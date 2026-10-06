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


class PipelineStats(CamelModel):
    k: int
    retrieved: int
    excluded: dict[str, int]
    returned: int
    weights: dict[str, float]


class MatchingResponse(CamelModel):
    mentee_id: str
    mentors: list[RankedMentor]
    pipeline: PipelineStats
