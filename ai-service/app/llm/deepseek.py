"""
Client gọi DeepSeek Chat Completions API (định dạng tương thích OpenAI).

- Bật khi có DEEPSEEK_API_KEY; nếu không, mọi engine dùng thuật toán rule-based.
- JSON Output mode: response_format = {"type": "json_object"}; system prompt luôn chứa chữ
  "json" và một ví dụ mẫu (yêu cầu của DeepSeek). Kết quả được validate bằng Pydantic.
- DeepSeek có thể trả nội dung rỗng ở chế độ JSON → thử lại 1 lần; lỗi 429/5xx/mạng → thử lại 1 lần.
- Mọi lỗi còn lại trả về None để engine chuyển sang rule-based cho lượt đó.
"""
import logging
import re
from typing import TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from app import config

log = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)
MAX_ATTEMPTS = 2
_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$")


def strip_code_fence(content: str) -> str:
    return _FENCE.sub("", content.strip())


class DeepSeekClient:
    def __init__(self, api_key: str, base_url: str, model: str, max_tokens: int = 4000,
                 timeout: float = 60, transport: httpx.BaseTransport | None = None):
        self.model = model
        self.max_tokens = max_tokens
        self._http = None
        if api_key:
            self._http = httpx.Client(base_url=base_url, timeout=timeout, transport=transport,
                                      headers={"Authorization": f"Bearer {api_key}"})

    @property
    def enabled(self) -> bool:
        return self._http is not None

    def json(self, system: str, user: str, model_cls: type[T], example: str) -> T | None:
        if self._http is None:
            return None
        body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system
                 + "\n\nChỉ trả về DUY NHẤT một đối tượng json hợp lệ, không kèm giải thích hay markdown, "
                   "theo đúng cấu trúc ví dụ sau:\n" + example},
                {"role": "user", "content": user},
            ],
            "response_format": {"type": "json_object"},
            "max_tokens": self.max_tokens,
            "stream": False,
        }
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                res = self._http.post("/chat/completions", json=body)
            except httpx.HTTPError as e:
                log.warning("DeepSeek request failed (attempt %s): %s", attempt, e)
                continue
            if res.status_code != 200:
                log.warning("DeepSeek API error status=%s body=%s", res.status_code, res.text[:300])
                if res.status_code == 429 or res.status_code >= 500:
                    continue
                return None  # 400/401/402/422: thử lại vô ích
            try:
                choice = res.json()["choices"][0]
                content = (choice.get("message") or {}).get("content") or ""
                finish_reason = choice.get("finish_reason")
            except (ValueError, KeyError, IndexError, TypeError):
                log.warning("Unexpected DeepSeek response shape")
                return None
            if not content.strip():
                log.warning("DeepSeek returned empty content (attempt %s, finish_reason=%s)", attempt, finish_reason)
                continue
            if finish_reason == "length":
                log.warning("DeepSeek output truncated by max_tokens (%s)", model_cls.__name__)
                return None
            try:
                return model_cls.model_validate_json(strip_code_fence(content))
            except ValidationError as e:
                log.warning("Invalid DeepSeek json for %s: %s", model_cls.__name__, e.errors()[:3])
                return None
        return None


_client: DeepSeekClient | None = None


def get_client() -> DeepSeekClient:
    global _client
    if _client is None:
        _client = DeepSeekClient(config.DEEPSEEK_API_KEY, config.DEEPSEEK_BASE_URL, config.DEEPSEEK_MODEL,
                                 config.DEEPSEEK_MAX_TOKENS, config.DEEPSEEK_TIMEOUT_SECONDS)
    return _client
