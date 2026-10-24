"""
Gọi profile-service (xem contracts/profile-service.yaml).

ai-service cần hồ sơ mentor/mentee để cá nhân hoá câu hỏi, và ghi ngược kết quả:
trạng thái xác thực mentor sau AI Interview (FR-7.5) và goal đã làm rõ sau chatbot
enrichment (FR-8.5). Không truy cập CSDL của profile-service.
"""
import logging
from uuid import UUID

import httpx

from app import config
from app.clients.http import client_for
from app.errors import AiError

log = logging.getLogger(__name__)


def _unavailable(reason: str) -> AiError:
    log.warning("profile-service call failed: %s", reason)
    return AiError("PROFILE_SERVICE_UNAVAILABLE", "Không thể kết nối tới dịch vụ hồ sơ", status=502)


def _client() -> httpx.AsyncClient:
    return client_for(config.PROFILE_SERVICE_URL)


async def _get(path: str) -> dict | None:
    """Trả None khi không tìm thấy (404); lỗi kết nối/5xx ném PROFILE_SERVICE_UNAVAILABLE."""
    try:
        res = await _client().get(path)
    except httpx.HTTPError as e:
        raise _unavailable(str(e)) from None
    if res.status_code == 404:
        return None
    if res.status_code >= 400:
        raise _unavailable(f"{res.status_code} {res.text[:200]}")
    return res.json()


async def find_mentor(mentor_id: UUID) -> dict | None:
    return await _get(f"/internal/mentor/{mentor_id}")


async def find_mentee(mentee_id: UUID) -> dict | None:
    return await _get(f"/api/profile/mentee/{mentee_id}")


async def display_name(user_id: UUID) -> str | None:
    """Tên hiển thị — lỗi trả None, không làm hỏng màn hình danh sách."""
    try:
        summary = await _get(f"/internal/profile-summary/{user_id}")
    except AiError:
        return None
    return (summary or {}).get("displayName")


async def update_verification(mentor_id: UUID, status: str) -> None:
    """FR-7.5 — đồng bộ trạng thái xác thực mentor (mentor chỉ vào matching khi APPROVED)."""
    try:
        res = await _client().put(f"/internal/mentor/{mentor_id}/verification", json={"status": status})
        res.raise_for_status()
    except httpx.HTTPError as e:
        raise _unavailable(str(e)) from None


async def apply_enrichment(mentee_id: UUID, enriched_goal: str, cv_skills: list[str], cv_file_url: str) -> None:
    """FR-8.5 — gửi goal đã làm rõ sang profile-service để cập nhật hồ sơ & sinh lại embedding."""
    res = await _client().post(
        f"/api/profile/mentee/{mentee_id}/enrichment-chat",
        json={"enrichedGoalText": enriched_goal, "cvSkills": cv_skills, "cvFileUrl": cv_file_url},
    )
    res.raise_for_status()


async def clear_cv_file(user_id: UUID, cv_file_url: str) -> None:
    """Gỡ cvFileUrl khỏi hồ sơ nếu hồ sơ còn trỏ tới CV vừa bị xoá (profile-service tự so khớp)."""
    res = await _client().delete(f"/internal/profile/{user_id}/cv-file", params={"cvFileUrl": cv_file_url})
    res.raise_for_status()


async def remove_skills(user_id: UUID, skills: list[str]) -> None:
    """US-45 (PRD-CV-6) — gỡ các kỹ năng đã thêm từ CV khỏi hồ sơ mentee (profile-service so khớp không phân biệt hoa thường)."""
    res = await _client().post(f"/internal/mentee/{user_id}/skills/remove", json={"skills": skills})
    res.raise_for_status()
