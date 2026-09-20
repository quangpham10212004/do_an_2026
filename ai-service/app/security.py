"""
Xác thực cho ai-service.

- `/api/ai/**`  — yêu cầu JWT access token do auth-service cấp (HS256, secret dùng chung),
  hoặc header X-Internal-Token khi service nội bộ gọi thay người dùng.
- `/internal/**` — chỉ service nội bộ (header X-Internal-Token).
"""
import hmac
from dataclasses import dataclass
from uuid import UUID

import jwt
from fastapi import Depends, Header, HTTPException

from app import config

ROLE_INTERNAL = "INTERNAL"


@dataclass(frozen=True)
class AuthUser:
    user_id: UUID | None
    email: str | None
    role: str

    @property
    def is_admin(self) -> bool:
        return self.role == "ADMIN"

    @property
    def is_internal(self) -> bool:
        return self.role == ROLE_INTERNAL

    def require_access(self, owner_id: UUID) -> None:
        """Chủ sở hữu, admin hoặc service nội bộ mới được thao tác trên dữ liệu của owner_id."""
        if self.is_admin or self.is_internal or self.user_id == owner_id:
            return
        raise forbidden("Bạn không có quyền truy cập dữ liệu của người dùng khác")


def forbidden(message: str) -> HTTPException:
    return HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": message})


def _unauthorized() -> HTTPException:
    return HTTPException(status_code=401, detail={"code": "UNAUTHORIZED", "message": "Bạn cần đăng nhập"})


def _is_internal(token: str | None) -> bool:
    return token is not None and hmac.compare_digest(token.encode(), config.INTERNAL_API_KEY.encode())


def require_internal(x_internal_token: str | None = Header(default=None)) -> AuthUser:
    if not _is_internal(x_internal_token):
        raise forbidden("Endpoint nội bộ")
    return AuthUser(user_id=None, email=None, role=ROLE_INTERNAL)


def require_user(
    authorization: str | None = Header(default=None),
    x_internal_token: str | None = Header(default=None),
) -> AuthUser:
    if _is_internal(x_internal_token):
        return AuthUser(user_id=None, email=None, role=ROLE_INTERNAL)
    if not authorization or not authorization.startswith("Bearer "):
        raise _unauthorized()
    try:
        claims = jwt.decode(authorization[7:], config.JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise _unauthorized()
    if claims.get("typ") != "access":
        raise _unauthorized()
    try:
        user_id = UUID(str(claims.get("sub")))
    except ValueError:
        raise _unauthorized()
    return AuthUser(user_id=user_id, email=claims.get("email"), role=claims.get("role", ""))


def require_role(*roles: str):
    """Dependency phân quyền theo role (tương đương @PreAuthorize ở các service Java)."""
    allowed = set(roles)

    def dependency(user: AuthUser = Depends(require_user)) -> AuthUser:
        if user.is_internal or user.role in allowed:
            return user
        raise forbidden("Bạn không có quyền truy cập")

    return dependency
