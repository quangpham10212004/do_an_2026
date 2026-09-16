import uuid

from fastapi import APIRouter, Depends, HTTPException, Query

from app.schemas.matching import MatchingResponse, PipelineStats, RankedMentor
from app.security import Caller, require_user
from app.services import matching_pipeline as pipeline

router = APIRouter()


@router.get("/api/matching/mentors", response_model=MatchingResponse)
async def get_matches(
    menteeId: str = Query(...),
    limit: int = Query(10, ge=1, le=50),
    caller: Caller = Depends(require_user),
) -> MatchingResponse:
    try:
        uuid.UUID(menteeId)
    except ValueError:
        raise HTTPException(status_code=400, detail={"code": "BAD_REQUEST", "message": "menteeId không hợp lệ"})
    if not caller.is_privileged and caller.user_id != menteeId:
        raise HTTPException(
            status_code=403,
            detail={"code": "FORBIDDEN", "message": "Bạn chỉ được xem gợi ý mentor cho chính mình"},
        )

    result = await pipeline.match_mentors_for_mentee(menteeId, limit=limit)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "MENTEE_PROFILE_INCOMPLETE",
                "message": "Bạn cần hoàn thành hồ sơ nghề nghiệp trước khi tìm mentor",
            },
        )

    mentors = [
        RankedMentor(
            mentor_id=str(m["mentor_id"]),
            display_name=m["display_name"],
            domain=m["domain"],
            skills=list(m.get("skills") or []),
            similarity_score=m["similarity_score"],
            final_score=m["final_score"],
            rating=float(m["rating"]),
            rating_count=m["rating_count"],
            years_experience=m["years_experience"],
            hourly_rate=float(m["hourly_rate"]),
            matched_skills=m["matched_skills"],
            reasons=m["reasons"],
        )
        for m in result["mentors"]
    ]
    stats = result["stats"]
    return MatchingResponse(
        mentee_id=menteeId,
        mentors=mentors,
        pipeline=PipelineStats(
            k=stats["k"],
            retrieved=stats["retrieved"],
            excluded=stats["excluded"],
            returned=stats["returned"],
            weights={
                "similarity": pipeline.WEIGHT_SIMILARITY,
                "rating": pipeline.WEIGHT_RATING,
                "experience": pipeline.WEIGHT_EXPERIENCE,
            },
        ),
    )
