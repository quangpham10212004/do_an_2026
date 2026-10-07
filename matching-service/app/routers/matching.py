import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from app.schemas.matching import (
    EffectiveFilters,
    MatchingResponse,
    PipelineStats,
    RankedMentor,
    SimilarMentor,
    SimilarMentorsResponse,
)
from app.security import Caller, require_internal, require_user
from app.services import match_filters
from app.services import matching_pipeline as pipeline

router = APIRouter()

TimeOfDay = Literal["MORNING", "AFTERNOON", "EVENING"]
SessionType = Literal["CAREER_ADVICE", "CODE_REVIEW", "MOCK_INTERVIEW", "PROJECT_GUIDANCE"]


def _bad_request(message: str) -> HTTPException:
    return HTTPException(status_code=400, detail={"code": "BAD_REQUEST", "message": message})


def _parse_uuid(value: str, name: str) -> str:
    try:
        uuid.UUID(value)
    except ValueError:
        raise _bad_request(f"{name} không hợp lệ")
    return value


def _split(values: list[str] | None) -> list[str] | None:
    """Nhận cả dạng lặp (?days=1&days=3) lẫn phân tách dấu phẩy (?days=1,3). None = không truyền."""
    if values is None:
        return None
    return [part.strip() for v in values for part in v.split(",") if part.strip()]


def parse_days(values: list[str] | None) -> list[int] | None:
    parts = _split(values)
    if parts is None:
        return None
    try:
        days = [int(p) for p in parts]
    except ValueError:
        raise _bad_request("days phải là số từ 1 (Thứ Hai) đến 7 (Chủ Nhật)")
    if any(d < 1 or d > 7 for d in days):
        raise _bad_request("days phải là số từ 1 (Thứ Hai) đến 7 (Chủ Nhật)")
    return days


def parse_languages(values: list[str] | None) -> list[str] | None:
    parts = _split(values)
    if parts is None:
        return None
    codes = [p.lower() for p in parts]
    if any(c not in match_filters.LANGUAGES for c in codes):
        raise _bad_request("language chỉ nhận vi hoặc en")
    return codes


@router.get("/api/matching/mentors", response_model=MatchingResponse)
async def get_matches(
    menteeId: str = Query(...),
    limit: int = Query(10, ge=1, le=50),
    maxRate: float | None = Query(None, ge=0),
    days: list[str] | None = Query(None),
    timeOfDay: TimeOfDay | None = Query(None),
    language: list[str] | None = Query(None),
    sessionType: SessionType | None = Query(None),
    minRating: float | None = Query(None, ge=0, le=5),
    freeOnly: bool | None = Query(None),
    useProfileDefaults: bool = Query(True),
    caller: Caller = Depends(require_user),
) -> MatchingResponse:
    _parse_uuid(menteeId, "menteeId")
    if not caller.is_privileged and caller.user_id != menteeId:
        raise HTTPException(
            status_code=403,
            detail={"code": "FORBIDDEN", "message": "Bạn chỉ được xem gợi ý mentor cho chính mình"},
        )
    requested = {
        match_filters.MAX_RATE: maxRate,
        match_filters.DAYS: parse_days(days),
        match_filters.TIME_OF_DAY: timeOfDay,
        match_filters.LANGUAGE: parse_languages(language),
        match_filters.SESSION_TYPE: sessionType,
        match_filters.MIN_RATING: minRating,
        match_filters.FREE_ONLY: freeOnly,
    }

    result = await pipeline.match_mentors_for_mentee(
        menteeId, limit=limit, requested=requested, use_profile_defaults=useProfileDefaults
    )
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
            considered=stats["considered"],
            excluded=stats["excluded"],
            eligible=stats["eligible"],
            k=stats["k"],
            retrieved=stats["retrieved"],
            returned=stats["returned"],
            weights={
                "similarity": pipeline.WEIGHT_SIMILARITY,
                "rating": pipeline.WEIGHT_RATING,
                "experience": pipeline.WEIGHT_EXPERIENCE,
            },
        ),
        filters=EffectiveFilters(**match_filters.to_echo(result["filters"])),
        excluded_by=result["excluded_by"],
    )


@router.get("/internal/matching/similar-mentors", response_model=SimilarMentorsResponse,
            dependencies=[Depends(require_internal)])
async def similar_mentors(
    menteeId: str = Query(...),
    excludeMentorId: str = Query(...),
    limit: int = Query(3, ge=1, le=10),
) -> SimilarMentorsResponse:
    """
    Nội bộ (mentoring-service, US-15) — mentor phù hợp nhất cho mentee, trừ excludeMentorId; áp sở thích
    hồ sơ, nới bộ lọc người dùng nếu chưa đủ limit. Mentee chưa có hồ sơ/chỉ mục => danh sách rỗng.
    """
    _parse_uuid(menteeId, "menteeId")
    _parse_uuid(excludeMentorId, "excludeMentorId")
    mentors = await pipeline.similar_mentors(menteeId, excludeMentorId, limit=limit)
    return SimilarMentorsResponse(mentors=[
        SimilarMentor(mentor_id=str(m["mentor_id"]), full_name=m["display_name"], score=m["final_score"])
        for m in mentors
    ])
