from pydantic import BaseModel


class EmbedRequest(BaseModel):
    text: str


class EmbedResponse(BaseModel):
    embedding: list[float]


class RankedMentor(BaseModel):
    mentor_id: str
    display_name: str
    domain: str
    similarity_score: float
    final_score: float
    rating: float
    years_experience: int


class MatchingResponse(BaseModel):
    mentee_id: str
    mentors: list[RankedMentor]
