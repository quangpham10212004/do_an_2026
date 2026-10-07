"""US-17 / US-18 — quy tắc thuần của bộ lọc người dùng (match_filters.py), không cần DB."""
from datetime import time
from decimal import Decimal

from app.services import match_filters as mf
from app.services.match_filters import MatchFilters

PREFS = {
    "budget_max_per_hour": Decimal("150000.00"),
    "preferred_days": [2, 6],
    "preferred_time_of_day": "EVENING",
    "languages": ["vi"],
}


def row(**flags) -> dict:
    """Một mentor đã qua ràng buộc hệ thống; mặc định thoả mọi bộ lọc."""
    base = {k: True for k in ("rate_ok", "free_ok", "language_ok", "session_ok", "rating_ok",
                              "days_ok", "time_ok", "days_time_ok")}
    base.update(flags)
    return base


# ---------------- resolve: request thắng hồ sơ, hồ sơ lấp chỗ trống ----------------

def test_missing_params_come_from_profile_preferences():
    f = mf.resolve({}, PREFS)
    assert f.max_rate == 150000.0
    assert f.days == (2, 6)
    assert f.time_of_day == "EVENING"
    assert f.language == ("vi",)
    assert set(f.from_profile_defaults) == {"maxRate", "days", "timeOfDay", "language"}
    assert f.active() == {"maxRate", "days", "timeOfDay", "language"}


def test_request_overrides_profile_without_saving():
    f = mf.resolve({"maxRate": 500000, "timeOfDay": "MORNING", "minRating": 4, "sessionType": "CODE_REVIEW"}, PREFS)
    assert f.max_rate == 500000
    assert f.time_of_day == "MORNING"
    assert f.min_rating == 4.0 and f.session_type == "CODE_REVIEW"
    assert set(f.from_profile_defaults) == {"days", "language"}
    assert PREFS["budget_max_per_hour"] == Decimal("150000.00")  # hồ sơ không bị đổi


def test_use_profile_defaults_false_ignores_preferences():
    f = mf.resolve({"freeOnly": True}, PREFS, use_profile_defaults=False)
    assert f.active() == {"freeOnly"}
    assert f.from_profile_defaults == ()


def test_empty_preferences_and_missing_columns_mean_no_filter():
    assert mf.resolve({}, {"preferred_days": [], "languages": [], "budget_max_per_hour": None}).active() == set()
    assert mf.resolve({}, {"domain": "backend"}).active() == set()  # profile_db chưa có cột sở thích
    assert mf.resolve({}, None).active() == set()


def test_values_are_normalized():
    f = mf.resolve({"days": [7, 1, 1], "language": ["EN", "vi", "en"]}, None)
    assert f.days == (1, 7)
    assert f.language == ("en", "vi")
    assert mf.resolve({"maxRate": 0}, None).active() == {"maxRate"}  # 0 vẫn là bộ lọc (chỉ miễn phí)


def test_time_windows():
    assert mf.TIME_WINDOWS["MORNING"] == (time(6), time(12))
    assert mf.TIME_WINDOWS["AFTERNOON"] == (time(12), time(18))
    assert mf.TIME_WINDOWS["EVENING"] == (time(18), time(23))
    assert MatchFilters().time_window() == (None, None)


def test_without_drops_filter_and_its_default_marker():
    f = mf.without(mf.resolve({}, PREFS), {"maxRate"})
    assert f.max_rate is None
    assert "maxRate" not in f.from_profile_defaults and "days" in f.from_profile_defaults


# ---------------- passes: ngày + buổi gắn với nhau ----------------

def test_days_and_time_of_day_need_one_slot_matching_both():
    both = {"days", "timeOfDay"}
    # Có khung vào ngày đã chọn (buổi sáng) và khung buổi tối vào ngày khác — không khớp cả hai cùng lúc.
    split = row(days_ok=True, time_ok=True, days_time_ok=False)
    assert not mf.passes(split, both)
    assert mf.passes(split, {"days"}) and mf.passes(split, {"timeOfDay"})
    assert mf.passes(row(), both)


def test_time_of_day_alone_checks_any_day():
    assert mf.passes(row(days_ok=False, days_time_ok=False), {"timeOfDay"})
    assert not mf.passes(row(time_ok=False, days_time_ok=False), {"timeOfDay"})


def test_inactive_filters_are_ignored():
    assert mf.passes(row(rate_ok=False, free_ok=False, rating_ok=False), set())


# ---------------- apply + excludedBy ----------------

def test_excluded_by_counts_mentors_each_filter_removes_on_its_own():
    f = mf.resolve({"maxRate": 150000, "language": ["en"], "minRating": 4}, None)
    rows = [
        row(),                                         # qua hết
        row(rate_ok=False),                            # chỉ trượt giá
        row(rate_ok=False),                            # chỉ trượt giá
        row(language_ok=False),                        # chỉ trượt ngôn ngữ
        row(rate_ok=False, rating_ok=False),           # trượt 2 bộ lọc => không tính cho bộ lọc nào
    ]
    kept, excluded_by = mf.apply(rows, f)
    assert len(kept) == 1
    assert excluded_by == {"maxRate": 2, "language": 1, "minRating": 0}
    assert mf.biggest_blocker(excluded_by) == "maxRate"


def test_excluded_by_for_days_and_time_of_day():
    f = mf.resolve({"days": [6], "timeOfDay": "EVENING"}, None)
    rows = [
        row(days_ok=True, time_ok=True, days_time_ok=False),   # bỏ một trong hai là khớp
        row(days_ok=False, time_ok=True, days_time_ok=False),  # chỉ bỏ ngày mới khớp
        row(days_ok=True, time_ok=False, days_time_ok=False),  # chỉ bỏ buổi mới khớp
    ]
    kept, excluded_by = mf.apply(rows, f)
    assert kept == []
    assert excluded_by == {"days": 2, "timeOfDay": 2}


def test_no_filters_keeps_everyone_and_reports_nothing():
    rows = [row(rate_ok=False), row()]
    kept, excluded_by = mf.apply(rows, MatchFilters())
    assert len(kept) == 2 and excluded_by == {}
    assert mf.biggest_blocker({}) is None
    assert mf.biggest_blocker({"maxRate": 0}) is None


def test_echo_uses_filter_names():
    echo = mf.to_echo(mf.resolve({"freeOnly": True}, PREFS))
    assert echo["free_only"] is True and echo["max_rate"] == 150000.0
    assert echo["days"] == [2, 6] and echo["language"] == ["vi"]
    assert set(echo["from_profile_defaults"]) == {"maxRate", "days", "timeOfDay", "language"}
