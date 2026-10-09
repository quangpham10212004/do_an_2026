import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from app.schemas.matching import (
    EffectiveFilters,
    EvaluationStats,
    FeedbackItem,
    FeedbackRequest,
    MatchingResponse,
    PipelineStats,
    RankedMentor,
    SimilarMentor,
    SimilarMentorsResponse,
)
from app.security import Caller, require_admin, require_internal, require_user
from app.services import feedback_service
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
            schedule_fit=m.get("schedule_fit", 0.0),
            responsiveness=m.get("responsiveness", 0.5),
            median_response_hours=(float(m["median_response_hours"])
                                   if m.get("median_response_hours") is not None else None),
            new_mentor=m.get("new_mentor", False),
            rating_used=m.get("rating_used", float(m["rating"])),
            score_parts=m.get("score_parts", {}),
            headline=m.get("headline"),
        )
        for m in result["mentors"]
    ]
    stats = result["stats"]
    filters_echo = match_filters.to_echo(result["filters"])
    impression_id = await feedback_service.log_impressions(menteeId, result["mentors"], filters_echo, pipeline.WEIGHTS)
    return MatchingResponse(
        mentee_id=menteeId,
        mentors=mentors,
        pipeline=PipelineStats(
            considered=stats["considered"],
            excluded=stats["excluded"],
            hidden=stats.get("hidden", 0),
            eligible=stats["eligible"],
            k=stats["k"],
            retrieved=stats["retrieved"],
            returned=stats["returned"],
            weights=pipeline.WEIGHTS,
        ),
        filters=EffectiveFilters(**filters_echo),
        excluded_by=result["excluded_by"],
        impression_id=impression_id,
    )


def _require_self(caller: Caller, mentee_id: str) -> None:
    if caller.role == "INTERNAL" or caller.user_id == mentee_id:
        return
    raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "Chỉ mentee được phản hồi gợi ý của chính mình"})


def _feedback_item(row: dict) -> FeedbackItem:
    return FeedbackItem(id=str(row["id"]), mentor_id=str(row["mentor_id"]), reason=row["reason"], note=row["note"],
                        rank=row["rank"], created_at=row["created_at"], hidden_until=row["hidden_until"])


@router.post("/api/matching/feedback", response_model=FeedbackItem, status_code=201)
async def not_relevant(body: FeedbackRequest, caller: Caller = Depends(require_user)) -> FeedbackItem:
    """
    US-36 (PRD-MATCH-6) — "Không phù hợp": ẩn mentor khỏi gợi ý của mentee 30 ngày, lưu lý do (WRONG_DOMAIN /
    TOO_EXPENSIVE / SCHEDULE / OTHER) và hạng lúc bấm (qua impressionId) để đánh giá offline.
    """
    _parse_uuid(body.mentee_id, "menteeId")
    _parse_uuid(body.mentor_id, "mentorId")
    if body.impression_id:
        _parse_uuid(body.impression_id, "impressionId")
    _require_self(caller, body.mentee_id)
    note = (body.note or "").strip() or None
    if note and len(note) > 300:
        raise _bad_request("note tối đa 300 ký tự")
    row = await feedback_service.hide(body.mentee_id, body.mentor_id, body.reason, note, body.impression_id)
    return _feedback_item(row)


@router.get("/api/matching/feedback", response_model=list[FeedbackItem])
async def hidden_mentors(menteeId: str = Query(...), caller: Caller = Depends(require_user)) -> list[FeedbackItem]:
    """US-36 — các mentor đang bị ẩn (còn hiệu lực) của mentee."""
    _parse_uuid(menteeId, "menteeId")
    if not caller.is_privileged:
        _require_self(caller, menteeId)
    return [_feedback_item(r) for r in await feedback_service.active_feedback(menteeId)]


@router.delete("/api/matching/feedback/{mentorId}", status_code=204)
async def unhide(mentorId: str, menteeId: str = Query(...), caller: Caller = Depends(require_user)) -> None:
    """US-36 — bỏ ẩn sớm (mentor xuất hiện lại trong gợi ý)."""
    _parse_uuid(menteeId, "menteeId")
    _parse_uuid(mentorId, "mentorId")
    _require_self(caller, menteeId)
    if await feedback_service.unhide(menteeId, mentorId) == 0:
        raise HTTPException(status_code=404, detail={"code": "FEEDBACK_NOT_FOUND", "message": "Mentor này không bị ẩn"})


@router.get("/api/matching/admin/evaluation", response_model=EvaluationStats, dependencies=[Depends(require_admin)])
async def evaluation(days: int = Query(30, ge=1, le=365)) -> EvaluationStats:
    """US-36 (PRD-MATCH-8) — ADMIN: lượt hiển thị và lượt "Không phù hợp" theo hạng, phân bố lý do."""
    return EvaluationStats(**await feedback_service.evaluation_stats(days))


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
