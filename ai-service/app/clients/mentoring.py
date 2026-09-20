"""
Gửi thông báo trong ứng dụng qua mentoring-service (chủ sở hữu bảng notifications).

Thông báo là phụ trợ: gửi thất bại chỉ ghi log, không làm hỏng luồng AI đang chạy.
"""
import logging
from uuid import UUID

import httpx

from app import config
from app.clients.http import client_for

log = logging.getLogger(__name__)


async def _notify(body: dict) -> None:
    try:
        res = await client_for(config.MENTORING_SERVICE_URL).post("/internal/notifications", json=body)
        res.raise_for_status()
    except httpx.HTTPError as e:
        log.warning("Could not send notification %s: %s", body.get("type"), e)


async def notify_user(user_id: UUID, type_: str, title: str, message: str, link: str | None = None) -> None:
    await _notify({"recipientId": str(user_id), "type": type_, "title": title, "message": message, "link": link})


async def notify_role(role: str, type_: str, title: str, message: str, link: str | None = None) -> None:
    await _notify({"recipientRole": role, "type": type_, "title": title, "message": message, "link": link})
