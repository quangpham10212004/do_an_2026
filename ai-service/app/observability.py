"""
US-46 (NFR-17) — quan sát hệ thống:
- X-Request-Id: nhận từ client / service gọi tới (nếu hợp lệ) hoặc sinh mới, trả lại trong response, gắn vào mọi dòng log
  và chuyển tiếp sang service kế tiếp (httpx event hook `propagate_request_id`).
- Log JSON một dòng / sự kiện (@timestamp, level, logger_name, message, service, requestId) — cùng trường với các
  service Java (logstash-logback-encoder).
- GET /metrics định dạng Prometheus: http_requests_total + http_request_duration_seconds theo method, route, status.
"""
import json
import logging
import re
import time
import uuid
from contextvars import ContextVar
from datetime import datetime, timezone
from threading import Lock

from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse

HEADER = "X-Request-Id"
_VALID = re.compile(r"[A-Za-z0-9._:-]{1,64}")
_SKIP = ("/health", "/metrics")

request_id: ContextVar[str | None] = ContextVar("request_id", default=None)
access_log = logging.getLogger("access")


def sanitize(incoming: str | None) -> str:
    """Giá trị hợp lệ thì giữ, ngược lại (thiếu, quá dài, ký tự lạ — tránh log injection) sinh UUID mới."""
    return incoming if incoming and _VALID.fullmatch(incoming) else str(uuid.uuid4())


class JsonFormatter(logging.Formatter):
    def __init__(self, service: str) -> None:
        super().__init__()
        self.service = service

    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "@timestamp": datetime.fromtimestamp(record.created, timezone.utc).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger_name": record.name,
            "message": record.getMessage(),
            "service": self.service,
        }
        rid = request_id.get()
        if rid:
            entry["requestId"] = rid
        if record.exc_info:
            entry["stack_trace"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False)


def setup_logging(service: str, level: int = logging.INFO) -> None:
    """Mọi logger (kể cả uvicorn) ghi JSON ra stdout; access log của uvicorn được thay bằng dòng "access" có requestId."""
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter(service))
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level)
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logger = logging.getLogger(name)
        logger.handlers[:] = []
        logger.propagate = True
    logging.getLogger("uvicorn.access").disabled = True


async def propagate_request_id(request) -> None:
    """httpx event hook (request: httpx.Request): gắn X-Request-Id của request đang xử lý vào lời gọi sang service khác."""
    rid = request_id.get()
    if rid and HEADER not in request.headers:
        request.headers[HEADER] = rid


def _label(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


class Metrics:
    def __init__(self, service: str) -> None:
        self.service = service
        self.started = time.time()
        self._lock = Lock()
        self._count: dict[tuple[str, str, str], int] = {}
        self._sum: dict[tuple[str, str, str], float] = {}

    def observe(self, method: str, route: str, status: int, seconds: float) -> None:
        key = (method, route, str(status))
        with self._lock:
            self._count[key] = self._count.get(key, 0) + 1
            self._sum[key] = self._sum.get(key, 0.0) + seconds

    def render(self) -> str:
        with self._lock:
            items = sorted(self._count.items())
            sums = dict(self._sum)
        out = ["# HELP http_requests_total Số request HTTP đã xử lý.", "# TYPE http_requests_total counter"]
        labels = {k: f'service="{self.service}",method="{k[0]}",route="{_label(k[1])}",status="{k[2]}"' for k, _ in items}
        out += [f"http_requests_total{{{labels[k]}}} {n}" for k, n in items]
        out += ["# HELP http_request_duration_seconds Thời gian xử lý request HTTP.",
                "# TYPE http_request_duration_seconds summary"]
        for k, n in items:
            out.append(f"http_request_duration_seconds_count{{{labels[k]}}} {n}")
            out.append(f"http_request_duration_seconds_sum{{{labels[k]}}} {sums[k]:.6f}")
        out += ["# HELP process_start_time_seconds Thời điểm tiến trình khởi động (Unix time).",
                "# TYPE process_start_time_seconds gauge",
                f'process_start_time_seconds{{service="{self.service}"}} {self.started:.3f}']
        return "\n".join(out) + "\n"


def install(app: FastAPI, service: str) -> Metrics:
    """Middleware request id + access log + metrics, và route GET /metrics."""
    metrics = Metrics(service)

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        rid = sanitize(request.headers.get(HEADER))
        token = request_id.set(rid)
        start = time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            response.headers[HEADER] = rid
            return response
        finally:
            path = request.url.path
            if not path.startswith(_SKIP):
                elapsed = time.perf_counter() - start
                # Mẫu route (vd. /api/ai/cv/{cv_id}) để số nhãn không bùng nổ; không khớp route nào => "unmatched".
                route = getattr(request.scope.get("route"), "path", None) or "unmatched"
                metrics.observe(request.method, route, status, elapsed)
                access_log.info("%s %s -> %s (%d ms)", request.method, path, status, elapsed * 1000)
            request_id.reset(token)

    @app.get("/metrics", include_in_schema=False)
    async def metrics_endpoint() -> PlainTextResponse:
        return PlainTextResponse(metrics.render(), media_type="text/plain; version=0.0.4; charset=utf-8")

    return metrics
