"""US-35 (PRD-MATCH-3/4) — scheduleFit theo múi giờ hai bên, responsiveness, rating cold-start."""
from datetime import date, datetime, time, timezone

from app.services import ranking_signals as rs

# Thứ Hai 2026-11-02, 00:00 UTC = 07:00 giờ Việt Nam
NOW = datetime(2026, 11, 2, 0, 0, tzinfo=timezone.utc)
EVENING_MON_WED = {"preferred_days": [1, 3], "preferred_time_of_day": "EVENING", "timezone": "Asia/Ho_Chi_Minh"}


def test_mentee_slots_cover_14_days_of_preferred_weekdays():
    slots = rs.mentee_slots(NOW, [1, 3], "EVENING", "Asia/Ho_Chi_Minh")
    assert len(slots) == 4  # 2 thứ Hai + 2 thứ Tư trong 14 ngày
    # 18:00 giờ Việt Nam = 11:00 UTC
    assert slots[0][0] == datetime(2026, 11, 2, 11, 0, tzinfo=timezone.utc)


def test_slot_in_progress_is_not_counted():
    """Đang 21:30 giờ Việt Nam: khung tối hôm nay đã bắt đầu nên bị bỏ, còn 13 ngày tới."""
    late = datetime(2026, 11, 2, 14, 30, tzinfo=timezone.utc)
    slots = rs.mentee_slots(late, [], "EVENING", "Asia/Ho_Chi_Minh")
    assert len(slots) == 13
    assert slots[0][0] == datetime(2026, 11, 3, 11, 0, tzinfo=timezone.utc)


def test_fit_does_not_depend_on_time_of_call():
    """Mentor rảnh 18:00–22:00 mỗi ngày khớp trọn buổi tối, dù gọi API lúc 07:00, 21:00, 21:54 hay 22:30 giờ Việt Nam."""
    availability = [(d, time(18, 0), time(22, 0)) for d in range(1, 8)]
    mentee = {"preferred_days": [], "preferred_time_of_day": "EVENING", "timezone": "Asia/Ho_Chi_Minh"}
    for hour, minute in [(0, 0), (14, 0), (14, 54), (15, 30)]:  # UTC
        now = datetime(2026, 11, 2, hour, minute, tzinfo=timezone.utc)
        assert rs.schedule_fit(now, mentee, "Asia/Ho_Chi_Minh", availability, []) == 1.0, now


def test_full_fit_when_mentor_free_every_evening():
    availability = [(d, time(18, 0), time(22, 0)) for d in range(1, 8)]
    assert rs.schedule_fit(NOW, EVENING_MON_WED, "Asia/Ho_Chi_Minh", availability, []) == 1.0


def test_half_fit_when_only_mondays():
    availability = [(1, time(19, 0), time(21, 0))]
    assert rs.schedule_fit(NOW, EVENING_MON_WED, "Asia/Ho_Chi_Minh", availability, []) == 0.5


def test_overlap_under_60_minutes_does_not_count():
    availability = [(1, time(22, 30), time(23, 30)), (3, time(22, 30), time(23, 30))]
    assert rs.schedule_fit(NOW, EVENING_MON_WED, "Asia/Ho_Chi_Minh", availability, []) == 0.0


def test_whole_day_and_partial_exceptions_are_subtracted():
    availability = [(1, time(18, 0), time(22, 0)), (3, time(18, 0), time(22, 0))]
    exceptions = [(date(2026, 11, 2), None, None),                 # nghỉ cả thứ Hai đầu tiên
                  (date(2026, 11, 4), time(18, 0), time(21, 30))]  # thứ Tư đầu chỉ còn 30 phút
    assert rs.schedule_fit(NOW, EVENING_MON_WED, "Asia/Ho_Chi_Minh", availability, exceptions) == 0.5


def test_timezones_are_converted_before_comparing():
    """Mentor ở Paris rảnh 12:00–16:00 giờ Paris = 18:00–22:00 giờ Việt Nam (tháng 11, UTC+1) → khớp buổi tối."""
    paris = [(1, time(12, 0), time(16, 0)), (3, time(12, 0), time(16, 0))]
    assert rs.schedule_fit(NOW, EVENING_MON_WED, "Europe/Paris", paris, []) == 1.0
    # Cùng khung giờ nhưng hiểu theo giờ Việt Nam (buổi trưa) thì không khớp buổi tối.
    assert rs.schedule_fit(NOW, EVENING_MON_WED, "Asia/Ho_Chi_Minh", paris, []) == 0.0


def test_no_preferences_means_any_day_06_to_23():
    availability = [(d, time(9, 0), time(11, 0)) for d in range(1, 8)]
    mentee = {"preferred_days": [], "preferred_time_of_day": None, "timezone": None}
    assert rs.schedule_fit(NOW, mentee, None, availability, []) == 1.0


def test_no_availability_is_zero():
    assert rs.schedule_fit(NOW, EVENING_MON_WED, "Asia/Ho_Chi_Minh", [], []) == 0.0


def test_responsiveness_buckets():
    assert rs.responsiveness(None) == 0.5
    assert rs.responsiveness(3) == 1.0
    assert rs.responsiveness(24) == 1.0
    assert rs.responsiveness(48) == 0.5
    assert rs.responsiveness(72) == 0.5
    assert rs.responsiveness(9999) == 0.0


def test_effective_rating_cold_start():
    assert rs.effective_rating(5.0, 2, 4.1) == 4.1
    assert rs.effective_rating(5.0, 2, None) == rs.FALLBACK_MEDIAN_RATING
    assert rs.effective_rating(3.0, 10, 4.1) == 3.0
