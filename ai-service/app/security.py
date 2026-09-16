import hmac

from fastapi import Header, HTTPException

from app import config


def require_internal(x_internal_token: str | None = Header(default=None)) -> None:
    """ai-service chỉ phục vụ service nội bộ (mentoring-service) qua header X-Internal-Token."""
    if x_internal_token is None or not hmac.compare_digest(x_internal_token.encode(), config.INTERNAL_API_KEY.encode()):
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "Endpoint nội bộ"})
