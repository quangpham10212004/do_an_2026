"""
Ghi nhật ký kiểm toán sang auth-service (US-30, PRD-ADM-5): `POST /internal/audit` (X-Internal-Token) → 202.

Bắn-rồi-quên: nhật ký là phụ trợ, lỗi mạng / auth-service tạm chết chỉ ghi log cảnh báo và KHÔNG làm hỏng
quyết định của admin. Lời gọi vẫn được `await` (timeout ngắn) để dòng nhật ký có ngay khi API trả về.
"""
import logging
from uuid import UUID

import httpx
from fastapi.encoders import jsonable_encoder

from app import config
from app.clients.http import client_for

log = logging.getLogger(__name__)


async def record(actor_id: UUID | None, actor_role: str, action: str, target_type: str, target_id: str,
                 before: dict | None, after: dict | None) -> None:
    body = jsonable_encoder({"actorId": actor_id, "actorRole": actor_role, "action": action,
                             "targetType": target_type, "targetId": str(target_id),
                             "before": before, "after": after})
    try:
        res = await client_for(config.AUTH_SERVICE_URL).post("/internal/audit", json=body,
                                                             timeout=config.AUDIT_TIMEOUT_SECONDS)
        if res.status_code >= 300:
            log.warning("Audit %s rejected by auth-service: %s %s", action, res.status_code, res.text[:200])
    except httpx.HTTPError as e:
        log.warning("Could not write audit %s for %s/%s: %s", action, target_type, target_id, e)
