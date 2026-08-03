from fastapi import APIRouter, HTTPException, Query
from app.schemas.matching import MatchingResponse, RankedMentor
from app.services.matching_pipeline import match_mentors_for_mentee

router = APIRouter()


@router.get("/api/matching/mentors", response_model=MatchingResponse)
async def get_matches(
    menteeId: str = Query(...),
    limit: int = Query(10, le=50),
) -> MatchingResponse:
    ranked = await match_mentors_for_mentee(menteeId, limit=limit)
    if ranked is None:
        raise HTTPException(
            status_code=404,
            detail="Mentee không tồn tại hoặc chưa có embedding",
        )

    mentors = [
        RankedMentor(
            mentor_id=str(m["mentor_id"]),
            display_name=m["display_name"],
            domain=m["domain"],
            similarity_score=m["similarity_score"],
            final_score=m["final_score"],
            rating=m["rating"],
            years_experience=m["years_experience"],
        )
        for m in ranked
    ]
    return MatchingResponse(mentee_id=menteeId, mentors=mentors)
