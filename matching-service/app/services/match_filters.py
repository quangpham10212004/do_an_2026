"""
US-17 / US-18 (PRD-MATCH-1, 2, 5) — bộ lọc người dùng của AI Matching.

Bộ lọc là HARD FILTER áp dụng TRƯỚC khi xếp hạng bằng vector (xem matching_pipeline.py):
profile_db trả về, cho mỗi mentor đã qua 5 ràng buộc hệ thống (APPROVED, ACCEPTING, có lịch, còn
chỗ, cùng lĩnh vực), một cờ đúng/sai cho từng điều kiện người dùng; module này (thuần, không I/O)
quyết định mentor nào còn lại và đếm `excludedBy`.

Tên bộ lọc = tên query param của GET /api/matching/mentors (để frontend "Nới điều kiện" bỏ đúng
param đó): maxRate, days, timeOfDay, language, sessionType, minRating, freeOnly.

Giá trị mặc định lấy từ sở thích của mentee (US-16, cột trong mentee_profiles) khi request không
truyền và useProfileDefaults = true: maxRate ← budget_max_per_hour, days ← preferred_days,
timeOfDay ← preferred_time_of_day, language ← languages. Các bộ lọc còn lại chỉ đến từ request.
"""
from dataclasses import dataclass, field, replace
from datetime import time
from typing import Any

MAX_RATE = "maxRate"
DAYS = "days"
TIME_OF_DAY = "timeOfDay"
LANGUAGE = "language"
SESSION_TYPE = "sessionType"
MIN_RATING = "minRating"
FREE_ONLY = "freeOnly"
FILTER_NAMES = (MAX_RATE, DAYS, TIME_OF_DAY, LANGUAGE, SESSION_TYPE, MIN_RATING, FREE_ONLY)

# Khung giờ theo giờ địa phương của lịch rảnh mentor: mentor khớp nếu có ít nhất một khung lịch rảnh
# hằng tuần GIAO với cửa sổ (start < cửa sổ.end và end > cửa sổ.start).
TIME_WINDOWS: dict[str, tuple[time, time]] = {
    "MORNING": (time(6, 0), time(12, 0)),
    "AFTERNOON": (time(12, 0), time(18, 0)),
    "EVENING": (time(18, 0), time(23, 0)),
}
LANGUAGES = ("vi", "en")
SESSION_TYPES = ("CAREER_ADVICE", "CODE_REVIEW", "MOCK_INTERVIEW", "PROJECT_GUIDANCE")

# Bộ lọc nào có thể lấy mặc định từ hồ sơ mentee → cột tương ứng trong mentee_profiles.
PROFILE_DEFAULT_COLUMNS = {
    MAX_RATE: "budget_max_per_hour",
    DAYS: "preferred_days",
    TIME_OF_DAY: "preferred_time_of_day",
    LANGUAGE: "languages",
}


@dataclass(frozen=True)
class MatchFilters:
    max_rate: float | None = None
    days: tuple[int, ...] = ()
    time_of_day: str | None = None
    language: tuple[str, ...] = ()
    session_type: str | None = None
    min_rating: float | None = None
    free_only: bool = False
    # Tên các bộ lọc có giá trị lấy từ sở thích trong hồ sơ (không phải từ request).
    from_profile_defaults: tuple[str, ...] = field(default=())

    def active(self) -> set[str]:
        """Tên các bộ lọc đang có hiệu lực."""
        values = {
            MAX_RATE: self.max_rate is not None,
            DAYS: bool(self.days),
            TIME_OF_DAY: self.time_of_day is not None,
            LANGUAGE: bool(self.language),
            SESSION_TYPE: self.session_type is not None,
            MIN_RATING: self.min_rating is not None,
            FREE_ONLY: self.free_only,
        }
        return {name for name, on in values.items() if on}

    def time_window(self) -> tuple[time, time] | tuple[None, None]:
        return TIME_WINDOWS[self.time_of_day] if self.time_of_day else (None, None)


def _norm_days(values) -> tuple[int, ...]:
    return tuple(sorted({int(d) for d in values or () if 1 <= int(d) <= 7}))


def _norm_languages(values) -> tuple[str, ...]:
    out: list[str] = []
    for v in values or ():
        code = str(v).strip().lower()
        if code in LANGUAGES and code not in out:
            out.append(code)
    return tuple(out)


def resolve(requested: dict[str, Any], prefs: dict | None, use_profile_defaults: bool = True) -> MatchFilters:
    """
    Bộ lọc hiệu lực của một lượt tìm. `requested` = giá trị từ query (None = không truyền);
    `prefs` = dòng mentee_profiles (có thể thiếu cột sở thích). Request luôn thắng hồ sơ; hồ sơ chỉ
    lấp chỗ trống khi use_profile_defaults. Không ghi gì vào hồ sơ (ghi đè chỉ cho lượt tìm này).
    """
    prefs = prefs or {}
    values: dict[str, Any] = {name: requested.get(name) for name in FILTER_NAMES}
    from_defaults: list[str] = []
    if use_profile_defaults:
        for name, column in PROFILE_DEFAULT_COLUMNS.items():
            if values[name] is not None:
                continue
            default = prefs.get(column)
            if default is None or (isinstance(default, (list, tuple)) and len(default) == 0):
                continue
            values[name] = default
            from_defaults.append(name)

    max_rate = values[MAX_RATE]
    min_rating = values[MIN_RATING]
    return MatchFilters(
        max_rate=float(max_rate) if max_rate is not None else None,
        days=_norm_days(values[DAYS]),
        time_of_day=values[TIME_OF_DAY] if values[TIME_OF_DAY] in TIME_WINDOWS else None,
        language=_norm_languages(values[LANGUAGE]),
        session_type=values[SESSION_TYPE] if values[SESSION_TYPE] in SESSION_TYPES else None,
        min_rating=float(min_rating) if min_rating is not None else None,
        free_only=bool(values[FREE_ONLY]),
        from_profile_defaults=tuple(from_defaults),
    )


def without(filters: MatchFilters, names: set[str] | frozenset[str]) -> MatchFilters:
    """Bỏ các bộ lọc trong `names` (dùng khi nới điều kiện)."""
    changes: dict[str, Any] = {}
    if MAX_RATE in names:
        changes["max_rate"] = None
    if DAYS in names:
        changes["days"] = ()
    if TIME_OF_DAY in names:
        changes["time_of_day"] = None
    if LANGUAGE in names:
        changes["language"] = ()
    if SESSION_TYPE in names:
        changes["session_type"] = None
    if MIN_RATING in names:
        changes["min_rating"] = None
    if FREE_ONLY in names:
        changes["free_only"] = False
    changes["from_profile_defaults"] = tuple(n for n in filters.from_profile_defaults if n not in names)
    return replace(filters, **changes)


def passes(row: dict, active: set[str]) -> bool:
    """
    Mentor (một dòng có các cờ do SQL tính) có thoả MỌI bộ lọc trong `active` không.

    Ngày và buổi gắn với nhau: cả hai cùng bật thì cần MỘT khung lịch rảnh vừa thuộc ngày đã chọn vừa
    giao với cửa sổ giờ (days_time_ok); chỉ bật buổi thì xét mọi ngày (time_ok); chỉ bật ngày thì chỉ
    cần có khung trong ngày đó (days_ok).
    """
    if MAX_RATE in active and not row["rate_ok"]:
        return False
    if FREE_ONLY in active and not row["free_ok"]:
        return False
    if LANGUAGE in active and not row["language_ok"]:
        return False
    if SESSION_TYPE in active and not row["session_ok"]:
        return False
    if MIN_RATING in active and not row["rating_ok"]:
        return False
    if DAYS in active and TIME_OF_DAY in active:
        return bool(row["days_time_ok"])
    if DAYS in active and not row["days_ok"]:
        return False
    if TIME_OF_DAY in active and not row["time_ok"]:
        return False
    return True


def apply(rows: list[dict], filters: MatchFilters) -> tuple[list[dict], dict[str, int]]:
    """
    (mentor còn lại sau mọi bộ lọc người dùng, excludedBy).

    excludedBy[f] = số mentor đã qua ràng buộc hệ thống và qua MỌI bộ lọc khác nhưng trượt riêng f —
    tức là số mentor sẽ xuất hiện thêm nếu chỉ bỏ f (US-18 "Nới điều kiện"). Có mặt cho mọi bộ lọc
    đang bật, kể cả khi bằng 0. Một mentor trượt ≥ 2 bộ lọc không được tính cho bộ lọc nào.
    """
    active = filters.active()
    kept = [r for r in rows if passes(r, active)]
    rejected = [r for r in rows if not passes(r, active)]
    excluded_by = {
        name: sum(1 for r in rejected if passes(r, active - {name}))
        for name in FILTER_NAMES if name in active
    }
    return kept, excluded_by


def biggest_blocker(excluded_by: dict[str, int]) -> str | None:
    """Bộ lọc loại nhiều mentor nhất (để gợi ý nới); None nếu không bộ lọc nào loại ai."""
    best = max(excluded_by.items(), key=lambda kv: kv[1], default=None)
    return best[0] if best and best[1] > 0 else None


def to_echo(filters: MatchFilters) -> dict:
    """Bộ lọc hiệu lực trả lại cho client (snake_case → schema camelCase)."""
    return {
        "max_rate": filters.max_rate,
        "days": list(filters.days),
        "time_of_day": filters.time_of_day,
        "language": list(filters.language),
        "session_type": filters.session_type,
        "min_rating": filters.min_rating,
        "free_only": filters.free_only,
        "from_profile_defaults": list(filters.from_profile_defaults),
    }
