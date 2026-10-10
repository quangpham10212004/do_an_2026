"""
US-22 (PRD-AIV-4) — quy tắc số lần phỏng vấn. Hàm thuần, không I/O, để unit test.

- Một "lần" (attempt) = một buổi phỏng vấn đã có kết quả: PENDING_REVIEW, APPROVED, REJECTED hoặc ABANDONED
  (US-43, PRD-AIV-3: bỏ dở quá 72 giờ). Buổi đang làm (IN_PROGRESS) chưa tính; buổi admin yêu cầu làm lại
  (RETAKE_REQUESTED) KHÔNG tính.
- Tối đa `max_attempts` lần (mặc định 3). Bị từ chối đủ `max_attempts` lần => khoá (INTERVIEW_LOCKED) cho tới
  khi admin mở khoá; mở khoá => chỉ các buổi tạo SAU lần mở khoá gần nhất được tính.
- Buổi gần nhất bị REJECTED => phải chờ `cooldown` (mặc định 7 ngày) tính từ lúc admin từ chối.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta

COUNTED_STATUSES = ("PENDING_REVIEW", "APPROVED", "REJECTED", "ABANDONED")

# US-43 (PRD-AIV-3) — buổi IN_PROGRESS tiếp tục được trong 72 giờ kể từ hoạt động gần nhất.
RESUME_WINDOW = timedelta(hours=72)
# US-43 (PRD-AIV-2) — độ dài câu trả lời (ký tự, sau khi trim).
ANSWER_MIN = 50
ANSWER_MAX = 3000


def resume_deadline(created_at: datetime, last_answered_at: datetime | None) -> datetime:
    """Hạn tiếp tục = hoạt động gần nhất (bắt đầu hoặc câu trả lời cuối) + 72 giờ."""
    last = max(created_at, last_answered_at) if last_answered_at else created_at
    return last + RESUME_WINDOW


def answer_length_error(text: str) -> str | None:
    """Mã lỗi khi câu trả lời ngoài 50–3000 ký tự, None khi hợp lệ."""
    n = len(text.strip())
    if n < ANSWER_MIN:
        return "ANSWER_TOO_SHORT"
    if n > ANSWER_MAX:
        return "ANSWER_TOO_LONG"
    return None


@dataclass(frozen=True)
class InterviewOutcome:
    """Tóm tắt 1 buổi phỏng vấn của mentor (đã lọc: tạo sau lần mở khoá gần nhất)."""
    status: str
    created_at: datetime
    reviewed_at: datetime | None = None


@dataclass(frozen=True)
class Eligibility:
    attempts_used: int
    attempts_left: int
    max_attempts: int
    cooldown_until: datetime | None
    locked: bool


def evaluate(outcomes: list[InterviewOutcome], now: datetime, max_attempts: int,
             cooldown: timedelta) -> Eligibility:
    used = sum(1 for o in outcomes if o.status in COUNTED_STATUSES)
    rejected = sum(1 for o in outcomes if o.status == "REJECTED")
    locked = rejected >= max_attempts
    latest = max(outcomes, key=lambda o: o.created_at, default=None)
    cooldown_until = None
    if not locked and latest is not None and latest.status == "REJECTED" and latest.reviewed_at is not None:
        until = latest.reviewed_at + cooldown
        cooldown_until = until if until > now else None
    return Eligibility(attempts_used=used, attempts_left=max(0, max_attempts - used), max_attempts=max_attempts,
                       cooldown_until=cooldown_until, locked=locked)
