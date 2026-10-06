import hmac
from dataclasses import dataclass

import jwt
from fastapi import Depends, Header, HTTPException

from app import config


@dataclass(frozen=True)
class Caller:
    user_id: str | None
    role: str

    @property
    def is_privileged(self) -> bool:
        return self.role in ("ADMIN", "INTERNAL")


def _unauthorized() -> HTTPException:
    return HTTPException(status_code=401, detail={"code": "UNAUTHORIZED", "message": "Bạn cần đăng nhập"})


def _is_internal(token: str | None) -> bool:
    return token is not None and hmac.compare_digest(token.encode(), config.INTERNAL_API_KEY.encode())


def require_internal(x_internal_token: str | None = Header(default=None)) -> Caller:
    """Chỉ cho phép service nội bộ (header X-Internal-Token)."""
    if not _is_internal(x_internal_token):
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "Endpoint nội bộ"})
    return Caller(user_id=None, role="INTERNAL")


def require_user(
    authorization: str | None = Header(default=None),
    x_internal_token: str | None = Header(default=None),
) -> Caller:
    """Xác minh JWT access token do auth-service cấp (HS256, secret dùng chung)."""
    if _is_internal(x_internal_token):
        return Caller(user_id=None, role="INTERNAL")
    if not authorization or not authorization.startswith("Bearer "):
        raise _unauthorized()
    try:
        claims = jwt.decode(authorization[7:], config.JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise _unauthorized()
    if claims.get("typ") != "access":
        raise _unauthorized()
    return Caller(user_id=claims.get("sub"), role=claims.get("role", ""))


def require_admin(caller: Caller = Depends(require_user)) -> Caller:
    """Chỉ ADMIN (hoặc service nội bộ) — dùng cho /api/matching/admin/**."""
    if caller.role not in ("ADMIN", "INTERNAL"):
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "Chức năng chỉ dành cho ADMIN"})
    return caller
