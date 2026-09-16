from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Serialize JSON theo camelCase (CONVENTIONS.md mục 3)."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class EmbedRequest(CamelModel):
    text: str = Field(min_length=1, max_length=10000)


class EmbedResponse(CamelModel):
    embedding: list[float]


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
