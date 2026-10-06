"""
Gọi mentoring-service (xem contracts/mentoring-service.yaml).

- Gửi thông báo trong ứng dụng (mentoring-service sở hữu bảng notifications). Thông báo là
  phụ trợ: gửi thất bại chỉ ghi log, không làm hỏng luồng AI đang chạy.
- Kiểm tra quan hệ mentor–mentee để phân quyền tải CV. Đây là kiểm tra bảo mật nên
  fail CLOSED: mentoring-service lỗi/không phản hồi => coi như không có quan hệ.
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


async def is_related(mentor_id: UUID, mentee_id: UUID) -> bool:
    """True khi mentor đang xét (PENDING) hoặc đang hướng dẫn (ACCEPTED) mentee; mọi lỗi => False."""
    try:
        res = await client_for(config.MENTORING_SERVICE_URL).get(
            "/internal/relationships", params={"mentorId": str(mentor_id), "menteeId": str(mentee_id)},
            timeout=config.RELATIONSHIP_CHECK_TIMEOUT_SECONDS)
        res.raise_for_status()
        return res.json().get("related") is True
    except (httpx.HTTPError, ValueError, AttributeError) as e:
        log.warning("Could not check mentor %s / mentee %s relationship, denying: %s", mentor_id, mentee_id, e)
        return False
