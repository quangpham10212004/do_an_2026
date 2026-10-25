"""
Quy tắc vòng 2 (docs/design-mentor-verification.md §6, D8, D9). Hàm thuần, không I/O, để unit test.

- Buổi vòng 2 KHÔNG giới hạn thời lượng (D8): khung giờ chỉ có giờ bắt đầu; token phòng có trần kỹ thuật `max_hours`.
- Mentor đổi giờ tối đa `max_reschedule` lần mỗi đợt, báo trước ≥ `notice_hours` giờ (D9).
- Mentor vắng: nhật ký vào phòng quyết định (không phải lời khai), sau `grace` kể từ giờ bắt đầu.
"""
from datetime import datetime, timedelta


def validate_slots(starts: list[datetime], now: datetime, min_lead: timedelta, max_count: int) -> str | None:
    """Mã lỗi khi danh sách khung giờ admin đề xuất không hợp lệ, None khi hợp lệ."""
    if not starts:
        return "SLOTS_REQUIRED"
    if len(starts) > max_count:
        return "TOO_MANY_SLOTS"
    if len({s for s in starts}) != len(starts):
        return "DUPLICATE_SLOTS"
    if any(s < now + min_lead for s in starts):
        return "SLOT_TOO_SOON"
    return None


def choice_deadline(proposed_at: datetime, days: float) -> datetime:
    return proposed_at + timedelta(days=days)


def reschedule_error(now: datetime, scheduled_at: datetime, count: int, max_count: int, notice: timedelta) -> str | None:
    """RESCHEDULE_LIMIT khi đã đổi đủ số lần; RESCHEDULE_TOO_LATE khi còn ít hơn `notice` đến giờ bắt đầu."""
    if count >= max_count:
        return "RESCHEDULE_LIMIT"
    if scheduled_at - now < notice:
        return "RESCHEDULE_TOO_LATE"
    return None


def room_window(scheduled_at: datetime, opens_before: timedelta, max_hours: float) -> tuple[datetime, datetime]:
    """(mở phòng, hết hạn token): mở trước giờ bắt đầu `opens_before`; không có giờ đóng theo lịch, chỉ trần kỹ thuật."""
    return scheduled_at - opens_before, scheduled_at + timedelta(hours=max_hours)


def room_open(now: datetime, window: tuple[datetime, datetime]) -> bool:
    return window[0] <= now <= window[1]


def absence_error(now: datetime, scheduled_at: datetime, mentor_joined_at: datetime | None, grace: timedelta) -> str | None:
    """Admin chỉ báo mentor vắng khi đã qua thời gian chờ và nhật ký vào phòng không có mentor."""
    if mentor_joined_at is not None:
        return "MENTOR_ALREADY_JOINED"
    if now < scheduled_at + grace:
        return "GRACE_NOT_ELAPSED"
    return None


def no_show_closes(no_show_count: int, max_no_show: int) -> bool:
    """Vắng đủ lần (sau khi đã cộng lần này) thì đóng đợt."""
    return no_show_count >= max_no_show
