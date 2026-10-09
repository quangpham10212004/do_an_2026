from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Serialize JSON theo camelCase (CONVENTIONS.md mục 3)."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ReindexRequest(CamelModel):
    """profile-service chỉ gửi ĐỊNH DANH hồ sơ — text nguồn do matching-service tự
    đọc từ profile_db, nên format text chuẩn hoá là chuyện riêng của matching."""

    user_id: str
    role: Literal["MENTOR", "MENTEE"] | None = None
    force: bool = False


class IndexStatusResponse(CamelModel):
    user_id: str
    role: str | None
    status: Literal["UPDATED", "UNCHANGED", "PENDING"]
    indexed_at: datetime | None = None


class RebuildResponse(CamelModel):
    mentors: int
    mentees: int
    pending: int


class RankedMentor(CamelModel):
    mentor_id: str
    display_name: str
    domain: str
    skills: list[str]
    similarity_score: float
    final_score: float
    rating: float
    rating_count: int
    years_experience: int
    hourly_rate: float
    matched_skills: list[str]
    reasons: list[str]
    # US-35 — tín hiệu xếp hạng mới + phần đóng góp từng tín hiệu (cộng lại = finalScore)
    schedule_fit: float = 0.0
    responsiveness: float = 0.5
    median_response_hours: float | None = None
    new_mentor: bool = False
    rating_used: float = 0.0
    score_parts: dict[str, float] = {}
    headline: str | None = None


class PipelineStats(CamelModel):
    considered: int = 0
    excluded: dict[str, int]
    hidden: int = 0
    eligible: int = 0
    k: int
    retrieved: int
    returned: int
    weights: dict[str, float]


class EffectiveFilters(CamelModel):
    """US-17 — bộ lọc thực sự được áp dụng cho lượt tìm (request + mặc định từ hồ sơ)."""

    max_rate: float | None = None
    days: list[int] = []
    time_of_day: Literal["MORNING", "AFTERNOON", "EVENING"] | None = None
    language: list[str] = []
    session_type: str | None = None
    min_rating: float | None = None
    free_only: bool = False
    from_profile_defaults: list[str] = []


class MatchingResponse(CamelModel):
    mentee_id: str
    mentors: list[RankedMentor]
    pipeline: PipelineStats
    filters: EffectiveFilters = EffectiveFilters()
    excluded_by: dict[str, int] = {}
    # US-36 — id của danh sách vừa hiển thị (gửi kèm phản hồi "Không phù hợp"); None khi rỗng / ghi nhật ký lỗi.
    impression_id: str | None = None


class FeedbackRequest(CamelModel):
    """US-36 — "Không phù hợp": ẩn mentor 30 ngày khỏi gợi ý của mentee."""

    mentee_id: str
    mentor_id: str
    reason: Literal["WRONG_DOMAIN", "TOO_EXPENSIVE", "SCHEDULE", "OTHER"]
    note: str | None = None
    impression_id: str | None = None


class FeedbackItem(CamelModel):
    id: str
    mentor_id: str
    reason: str
    note: str | None = None
    rank: int | None = None
    created_at: datetime
    hidden_until: datetime


class RankStat(CamelModel):
    rank: int
    impressions: int
    not_relevant: int
    not_relevant_rate: float


class EvaluationStats(CamelModel):
    days: int
    result_lists: int
    by_rank: list[RankStat]
    reasons: dict[str, int]


class SimilarMentor(CamelModel):
    mentor_id: str
    full_name: str
    score: float


class SimilarMentorsResponse(CamelModel):
    mentors: list[SimilarMentor]
