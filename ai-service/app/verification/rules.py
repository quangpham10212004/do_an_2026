"""
Quy tắc đợt xác thực mentor (docs/design-mentor-verification.md §3–4). Hàm thuần, không I/O, để unit test.

- Một "lần" (attempt) = một lượt làm vòng 1. Chỉ lần KHÔNG hoàn thành hợp lệ (ABANDONED, INVALIDATED) tính vào giới hạn;
  hết `max_attempts` lần thất bại thì đóng đợt, chờ `retry_days` ngày.
- Admin yêu cầu làm lại (RETAKE) không tính vào số lần làm, nhưng tối đa `max_retake` lần mỗi đợt.
- Bị từ chối hoặc đóng đợt: chờ `retry_days` ngày kể từ lúc đó mới được bắt đầu đợt mới.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta

ROUND1 = "ROUND1"
ROUND1_REVIEW = "ROUND1_REVIEW"
ROUND2_PENDING_SLOTS = "ROUND2_PENDING_SLOTS"
ROUND2_PENDING_CHOICE = "ROUND2_PENDING_CHOICE"
ROUND2_SCHEDULED = "ROUND2_SCHEDULED"
APPROVED = "APPROVED"
REJECTED = "REJECTED"
CLOSED = "CLOSED"

OPEN_STATUSES = (ROUND1, ROUND1_REVIEW, ROUND2_PENDING_SLOTS, ROUND2_PENDING_CHOICE, ROUND2_SCHEDULED)
FAILED_ATTEMPT_STATUSES = ("ABANDONED", "INVALIDATED")

# Trạng thái đợt → mentor_profiles.verification_status (profile-service giữ nguyên bốn giá trị).
_PROFILE_STATUS = {
    ROUND1: "PENDING_INTERVIEW",
    ROUND1_REVIEW: "PENDING_REVIEW",
    ROUND2_PENDING_SLOTS: "PENDING_REVIEW",
    ROUND2_PENDING_CHOICE: "PENDING_REVIEW",
    ROUND2_SCHEDULED: "PENDING_REVIEW",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED",
    CLOSED: "REJECTED",
}

# Quyết định duyệt vòng 1 → từ vựng của rubric.note_required / rubric.agrees.
ROUND1_CHOICE = {"PASS": "APPROVE", "REJECT": "REJECT", "RETAKE": "REQUEST_RETAKE"}


def profile_status(application_status: str) -> str:
    return _PROFILE_STATUS[application_status]


def attempts_left(failed: int, max_attempts: int) -> int:
    return max(0, max_attempts - failed)


def exhausted(failed: int, max_attempts: int) -> bool:
    return failed >= max_attempts


def can_retake(retake_count: int, max_retake: int) -> bool:
    return retake_count < max_retake


def retry_after(closed_at: datetime, retry_days: float) -> datetime:
    return closed_at + timedelta(days=retry_days)


@dataclass(frozen=True)
class StartState:
    can_start: bool
    reason: str | None  # IN_PROGRESS | PENDING_REVIEW | ALREADY_APPROVED | COOLDOWN | None
    cooldown_until: datetime | None = None


def start_state(open_status: str | None, has_in_progress: bool, last_status: str | None,
                last_retry_after: datetime | None, now: datetime) -> StartState:
    """
    open_status = trạng thái đợt chưa kết thúc (None nếu không có); last_status / last_retry_after = đợt gần nhất
    (dùng khi không có đợt mở). Đợt đang ở ROUND1 và có buổi đang làm thì bắt đầu lại = tiếp tục buổi đó.
    """
    if open_status is not None:
        if open_status == ROUND1:
            return StartState(True, "IN_PROGRESS" if has_in_progress else None)
        return StartState(False, "PENDING_REVIEW")
    if last_status == APPROVED:
        return StartState(False, "ALREADY_APPROVED")
    if last_status in (REJECTED, CLOSED) and last_retry_after is not None and last_retry_after > now:
        return StartState(False, "COOLDOWN", last_retry_after)
    return StartState(True, None)
