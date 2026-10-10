"""
US-35 (PRD-MATCH-3, PRD-MATCH-4) — tín hiệu xếp hạng ngoài độ tương đồng nội dung (hàm thuần, không I/O):

- schedule_fit: tỉ lệ khung giờ mong muốn của mentee trong 14 ngày tới có ít nhất 60 phút trùng lịch rảnh của mentor.
  Khung giờ mong muốn = mỗi ngày thuộc preferred_days (rỗng = mọi ngày) × cửa sổ preferred_time_of_day (null =
  06:00–23:00), theo MÚI GIỜ CỦA MENTEE; lịch rảnh hằng tuần + ngoại lệ (nghỉ cả ngày / một khoảng) theo MÚI GIỜ
  CỦA MENTOR. Mọi khoảng được đổi sang UTC trước khi so, nên hai bên khác múi giờ vẫn đúng. Phiên đã đặt nằm ở
  mentoring-service (DB khác) nên không bị trừ — đây là xấp xỉ "lịch rảnh khai báo".
- responsiveness: 1 nếu trung vị phản hồi ≤ 24 giờ, 0.5 nếu ≤ 72 giờ, 0 nếu lâu hơn; mentor chưa có dữ liệu → 0.5
  (trung tính, không phạt mentor mới).
- cold_start_rating: mentor < 3 đánh giá dùng trung vị rating của nền tảng (không phải 0, không phải rating
  của 1–2 lượt đánh giá đầu) và được gắn nhãn "Mentor mới".
"""
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.services.match_filters import TIME_WINDOWS

HORIZON_DAYS = 14
MIN_OVERLAP = timedelta(minutes=60)
FULL_DAY_WINDOW = (time(6, 0), time(23, 0))
DEFAULT_TZ = "Asia/Ho_Chi_Minh"

RESPONSIVE_HOURS = 24
SLOW_HOURS = 72
NEUTRAL_RESPONSIVENESS = 0.5

MIN_REVIEWS = 3
FALLBACK_MEDIAN_RATING = 3.5

Interval = tuple[datetime, datetime]


def _zone(name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(name or DEFAULT_TZ)
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo(DEFAULT_TZ)


def _at(d: date, t: time, tz: ZoneInfo) -> datetime:
    return datetime.combine(d, t, tzinfo=tz).astimezone(timezone.utc)


def _subtract(pieces: list[Interval], cut: Interval) -> list[Interval]:
    out = []
    for start, end in pieces:
        if cut[1] <= start or cut[0] >= end:
            out.append((start, end))
            continue
        if cut[0] > start:
            out.append((start, cut[0]))
        if cut[1] < end:
            out.append((cut[1], end))
    return out


def mentor_free_intervals(local_day: date, availability: list[tuple], exceptions: list[tuple], tz: ZoneInfo) -> list[Interval]:
    """
    Khoảng rảnh (UTC) của mentor trong NGÀY local_day (giờ mentor): các khung hằng tuần có day_of_week trùng, trừ
    ngoại lệ của ngày đó. availability: (day_of_week 1–7, start time, end time); exceptions: (date, start|None, end|None)
    — start/end None = nghỉ cả ngày.
    """
    dow = local_day.isoweekday()
    pieces = [(_at(local_day, s, tz), _at(local_day, e, tz)) for d, s, e in availability if d == dow and s < e]
    for ex_date, ex_start, ex_end in exceptions:
        if ex_date != local_day:
            continue
        if ex_start is None or ex_end is None:
            return []
        pieces = _subtract(pieces, (_at(local_day, ex_start, tz), _at(local_day, ex_end, tz)))
    return pieces


def mentee_slots(now: datetime, preferred_days, time_of_day: str | None, mentee_tz: str | None) -> list[Interval]:
    """Các khung giờ mong muốn (UTC) của mentee trong HORIZON_DAYS ngày tới. Chỉ tính khung CHƯA BẮT ĐẦU: khung đã qua
    hoặc đang diễn ra bị bỏ nguyên. Nếu cắt khung đang diễn ra từ now, phần còn lại (vd. 21:30–23:00 khi mentor rảnh tới
    22:00) không đủ MIN_OVERLAP nên mọi mentor bị trừ điểm khớp lịch tuỳ theo giờ gọi API."""
    tz = _zone(mentee_tz)
    today = now.astimezone(tz).date()
    days = {int(d) for d in (preferred_days or [])}
    window = TIME_WINDOWS.get(time_of_day) if time_of_day else FULL_DAY_WINDOW
    slots = []
    for offset in range(HORIZON_DAYS):
        d = today + timedelta(days=offset)
        if days and d.isoweekday() not in days:
            continue
        start, end = _at(d, window[0], tz), _at(d, window[1], tz)
        if start <= now:
            continue
        slots.append((start, end))
    return slots


def schedule_fit(now: datetime, mentee: dict, mentor_tz: str | None, availability: list[tuple],
                 exceptions: list[tuple]) -> float:
    """Tỉ lệ khung mong muốn của mentee có ≥ 60 phút trùng lịch rảnh của mentor (0–1)."""
    slots = mentee_slots(now, mentee.get("preferred_days"), mentee.get("preferred_time_of_day"), mentee.get("timezone"))
    if not slots or not availability:
        return 0.0
    tz = _zone(mentor_tz)
    covered = 0
    for start, end in slots:
        local_days = {start.astimezone(tz).date(), (end - timedelta(microseconds=1)).astimezone(tz).date()}
        best = timedelta(0)
        for d in local_days:
            for f_start, f_end in mentor_free_intervals(d, availability, exceptions, tz):
                overlap = min(end, f_end) - max(start, f_start)
                best = max(best, overlap)
        if best >= MIN_OVERLAP:
            covered += 1
    return round(covered / len(slots), 4)


def responsiveness(median_response_hours) -> float:
    if median_response_hours is None:
        return NEUTRAL_RESPONSIVENESS
    hours = float(median_response_hours)
    if hours <= RESPONSIVE_HOURS:
        return 1.0
    if hours <= SLOW_HOURS:
        return 0.5
    return 0.0


def is_new_mentor(rating_count: int | None) -> bool:
    return (rating_count or 0) < MIN_REVIEWS


def effective_rating(rating, rating_count: int | None, platform_median: float | None) -> float:
    """Rating dùng để xếp hạng: thật khi ≥ 3 đánh giá, ngược lại trung vị nền tảng."""
    if is_new_mentor(rating_count):
        return float(platform_median) if platform_median is not None else FALLBACK_MEDIAN_RATING
    return float(rating or 0)
