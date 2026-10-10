import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app import config, observability
from app.clients.http import close_clients
from app.db import close_pool, get_pool
from app.enrichment.service import purge_expired_cvs_forever, retry_profile_sync_forever
from app.interview import service as interview_service
from app.errors import AiError
from app.llm.deepseek import get_client
from app.routers import cv, enrichment, interview

observability.setup_logging("ai-service")  # US-46: log JSON có requestId
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    config.enforce_prod_secrets()  # APP_ENV=prod + bí mật dev => dừng khởi động (NFR-9)
    for warning in config.dev_secret_warnings():
        log.warning(warning)
    try:
        await get_pool()
    except OSError as e:  # DB chưa sẵn sàng: pool sẽ được tạo lại ở request đầu tiên
        log.warning("Could not connect to ai_db at startup: %s", e)
    retry_job = asyncio.create_task(retry_profile_sync_forever())
    # US-43 (PRD-AIV-3) — quét buổi phỏng vấn bỏ dở quá 72 giờ
    abandon_job = asyncio.create_task(interview_service.abandon_stale_forever())
    # US-45 (PRD-CV-6) — xoá file + văn bản gốc của CV quá 12 tháng
    retention_job = asyncio.create_task(purge_expired_cvs_forever())
    yield
    retry_job.cancel()
    abandon_job.cancel()
    retention_job.cancel()
    await close_clients()
    await close_pool()


app = FastAPI(
    title="ai-service",
    version="2.0.0",
    description="AI Interview, CV Parsing, Chatbot enrichment — DeepSeek + engine rule-based (fallback).",
    lifespan=lifespan,
)


@app.exception_handler(AiError)
async def ai_error_handler(_: Request, exc: AiError) -> JSONResponse:
    return JSONResponse(status_code=exc.status, content={"error": {"code": exc.code, "message": exc.message, **exc.extra}},
                        headers=exc.headers or None)


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    body = exc.detail if isinstance(exc.detail, dict) and "code" in exc.detail else {
        "code": f"HTTP_{exc.status_code}", "message": str(exc.detail)}
    return JSONResponse(status_code=exc.status_code, content={"error": body}, headers=getattr(exc, "headers", None))


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    message = "; ".join(f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors())
    return JSONResponse(status_code=400, content={"error": {"code": "VALIDATION_ERROR", "message": message}})


observability.install(app, "ai-service")  # US-46: X-Request-Id, access log, GET /metrics


@app.get("/health")
async def health() -> dict:
    client = get_client()
    try:
        pool = await get_pool()
        db_up = await pool.fetchval("SELECT 1") == 1
    except Exception:
        db_up = False
    return {
        "status": "UP" if db_up else "DEGRADED",
        "service": "ai-service",
        "dbConnected": db_up,
        "llmEnabled": client.enabled,
        "llmProvider": "deepseek" if client.enabled else None,
        "model": config.DEEPSEEK_MODEL if client.enabled else None,
    }


app.include_router(interview.router)
app.include_router(interview.dev_router)  # US-43 — chỉ dev/e2e, tự chặn ở APP_ENV=prod
app.include_router(cv.router)
app.include_router(enrichment.router)
