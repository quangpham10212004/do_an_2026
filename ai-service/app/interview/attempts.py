"""
US-22 (PRD-AIV-4) — quy tắc số lần phỏng vấn. Hàm thuần, không I/O, để unit test.

- Một "lần" (attempt) = một buổi phỏng vấn đã có kết quả: PENDING_REVIEW, APPROVED hoặc REJECTED.
  Buổi đang làm (IN_PROGRESS) chưa tính; buổi admin yêu cầu làm lại (RETAKE_REQUESTED) KHÔNG tính.
  (Hệ thống chưa có trạng thái ABANDONED — PRD-AIV-3 ngoài phạm vi Sprint 3.)
- Tối đa `max_attempts` lần (mặc định 3). Bị từ chối đủ `max_attempts` lần => khoá (INTERVIEW_LOCKED) cho tới
  khi admin mở khoá; mở khoá => chỉ các buổi tạo SAU lần mở khoá gần nhất được tính.
- Buổi gần nhất bị REJECTED => phải chờ `cooldown` (mặc định 7 ngày) tính từ lúc admin từ chối.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta

COUNTED_STATUSES = ("PENDING_REVIEW", "APPROVED", "REJECTED")


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
