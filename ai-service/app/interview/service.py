"""
AI Interview xác thực năng lực mentor (FR-7.1 → FR-7.5).

Vòng đời: mentor bắt đầu → trả lời lần lượt {maxTurns} câu (engine chấm từng câu và sinh
câu kế tiếp) → sau lượt cuối engine tổng hợp điểm & nhận xét → trạng thái PENDING_REVIEW,
thông báo admin → admin APPROVE/REJECT → đồng bộ trạng thái xác thực sang profile-service
(mentor chỉ xuất hiện trong matching khi APPROVED).

ai-service sở hữu cả luồng lẫn dữ liệu: buổi phỏng vấn và từng lượt hỏi-đáp nằm trong ai_db.
Lời gọi engine (DeepSeek) mất vài giây nên luôn thực hiện NGOÀI transaction.
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from pydantic import TypeAdapter

from app import config, errors
from app.clients import audit, mentoring, profile
from app.db import get_pool
from app.interview import attempts, rubric
from app.interview import engine as interview_engine
from app.interview import repository as repo
from app.interview.models import InterviewContext, TurnRecord
from app.interview.views import (EligibilityView, InterviewStats, InterviewView, ReviewInterviewInput,
                                 interview_view)
from app.security import AuthUser

log = logging.getLogger(__name__)

MAX_TURNS = config.INTERVIEW_MAX_TURNS
_DATETIME = TypeAdapter(datetime)


def _iso(value: datetime) -> str:
    """Cùng định dạng với datetime trong response model (vd. 2026-11-17T03:00:00Z)."""
    return _DATETIME.dump_python(value, mode="json")


async def _view(db, interview, for_admin: bool) -> InterviewView:
    """`db` là pool hoặc connection — asyncpg.Pool proxy sẵn fetch/fetchrow/execute."""
    turns = await repo.turns_of(db, interview["id"])
    name = await profile.display_name(interview["mentor_id"]) if for_admin else None
    return interview_view(interview, turns, for_admin, name)


def _context(domain: str, skills: list[str], mentor: dict | None, max_turns: int) -> InterviewContext:
    return InterviewContext(domain=domain, skills=skills, max_turns=max_turns,
                            years_experience=(mentor or {}).get("yearsExperience", 0) or 0,
                            bio=(mentor or {}).get("bio"))


async def _eligibility(db, mentor_id: UUID) -> attempts.Eligibility:
    rows = await repo.outcomes_since_unlock(db, mentor_id)
    outcomes = [attempts.InterviewOutcome(r["status"], r["created_at"], r["reviewed_at"]) for r in rows]
    return attempts.evaluate(outcomes, datetime.now(timezone.utc), config.INTERVIEW_MAX_ATTEMPTS,
                             timedelta(days=config.INTERVIEW_COOLDOWN_DAYS))


def _eligibility_view(e: attempts.Eligibility, latest) -> EligibilityView:
    status = None if latest is None else latest["status"]
    reason = ("IN_PROGRESS" if status == "IN_PROGRESS" else "PENDING_REVIEW" if status == "PENDING_REVIEW"
              else "ALREADY_APPROVED" if status == "APPROVED" else "LOCKED" if e.locked
              else "COOLDOWN" if e.cooldown_until is not None else None)
    return EligibilityView(attempts_used=e.attempts_used, attempts_left=e.attempts_left, max_attempts=e.max_attempts,
                           cooldown_until=e.cooldown_until, locked=e.locked,
                           can_start=reason in (None, "IN_PROGRESS"), reason=reason, question_count=MAX_TURNS)


async def abandon_stale(mentor_id: UUID | None = None) -> int:
    """US-43 (PRD-AIV-3) — buổi IN_PROGRESS không hoạt động quá 72 giờ → ABANDONED (tính là 1 lần phỏng vấn)."""
    pool = await get_pool()
    rows = await repo.abandon_stale(pool, datetime.now(timezone.utc) - attempts.RESUME_WINDOW, mentor_id)
    for r in rows:
        await audit.record(None, "SYSTEM", "INTERVIEW_ABANDONED", "INTERVIEW", str(r["id"]),
                           None, {"mentorId": str(r["mentor_id"])})
    if rows and mentor_id is None:
        log.info("Abandoned %d stale interviews", len(rows))
    return len(rows)


async def abandon_stale_forever(interval_seconds: float = 600) -> None:
    """Job nền của ai-service: quét buổi bỏ dở mỗi 10 phút (ngoài kiểm tra lười khi mentor mở trang)."""
    while True:
        try:
            await abandon_stale()
        except Exception as e:  # noqa: BLE001 — job nền không được chết
            log.warning("Interview abandonment sweep failed: %s", e)
        await asyncio.sleep(interval_seconds)


async def eligibility(mentor_id: UUID) -> EligibilityView:
    """US-22 — GET /api/ai/interviews/eligibility (mentor) và bản admin cho 1 mentor bất kỳ."""
    await abandon_stale(mentor_id)
    pool = await get_pool()
    return _eligibility_view(await _eligibility(pool, mentor_id), await repo.latest_for_mentor(pool, mentor_id))


async def start(user: AuthUser, self_answer_acknowledged: bool) -> InterviewView:
    """FR-7.1 — bắt đầu (hoặc tiếp tục) buổi phỏng vấn của mentor."""
    if not self_answer_acknowledged:
        raise errors.bad_request("SELF_ANSWER_ACK_REQUIRED",
                                 "Bạn cần xác nhận tự trả lời, không có sự trợ giúp từ bên ngoài trước khi bắt đầu")
    mentor = await profile.find_mentor(user.user_id)
    if mentor is None:
        raise errors.bad_request("PROFILE_REQUIRED", "Bạn cần hoàn thành hồ sơ mentor trước khi phỏng vấn")

    await abandon_stale(user.user_id)  # US-43 — quá 72 giờ thì không tiếp tục được nữa
    pool = await get_pool()
    latest = await repo.latest_for_mentor(pool, user.user_id)
    if latest is not None:
        if latest["status"] == "IN_PROGRESS":
            return await _view(pool, latest, for_admin=False)
        if latest["status"] == "PENDING_REVIEW":
            raise errors.conflict("INTERVIEW_PENDING_REVIEW", "Kết quả phỏng vấn đang chờ admin xem xét")
        if latest["status"] == "APPROVED":
            raise errors.conflict("ALREADY_APPROVED", "Tài khoản mentor đã được kích hoạt")
    # REJECTED / RETAKE_REQUESTED / chưa có buổi nào — kiểm tra số lần và thời gian chờ (US-22)
    rule = await _eligibility(pool, user.user_id)
    if rule.locked:
        raise errors.conflict("INTERVIEW_LOCKED",
                              f"Bạn đã bị từ chối {rule.max_attempts} lần. Vui lòng liên hệ quản trị viên để được mở khoá.")
    if rule.cooldown_until is not None:
        raise errors.conflict("INTERVIEW_COOLDOWN", "Bạn cần chờ hết thời gian chờ sau lần bị từ chối trước khi phỏng vấn lại",
                              extra={"retryAfter": _iso(rule.cooldown_until)})

    skills = list(mentor.get("skills") or [])
    ctx = _context(mentor["domain"], skills, mentor, MAX_TURNS)
    first = await interview_engine.first_question(None, ctx)

    async with pool.acquire() as conn, conn.transaction():
        interview = await repo.insert(conn, user.user_id, mentor["domain"], skills, MAX_TURNS, first.engine)
        plan = first.value
        await repo.insert_turn(conn, interview["id"], 1, plan.topic, plan.strategy, plan.question)

    if mentor.get("verificationStatus") == "REJECTED":
        await profile.update_verification(user.user_id, "PENDING_INTERVIEW")
    return await _view(pool, interview, for_admin=False)


async def answer(user: AuthUser, interview_id: UUID, text: str, pasted_large_text: bool = False) -> InterviewView:
    """FR-7.2 — mentor gửi câu trả lời cho câu hỏi hiện tại.
    pasted_large_text: trình duyệt phát hiện dán > 500 ký tự trong một lần (PRD-AIV-2) => gắn cờ COPIED_ANSWER."""
    text = text.strip()
    pool = await get_pool()
    interview = await _find(pool, interview_id)
    if interview["mentor_id"] != user.user_id:
        raise errors.forbidden("Đây không phải buổi phỏng vấn của bạn")
    # US-43 (PRD-AIV-3) — quá 72 giờ không hoạt động: buổi bị bỏ dở, không trả lời tiếp được.
    if interview["status"] == "IN_PROGRESS" and await abandon_stale(user.user_id):
        interview = await _find(pool, interview_id)
    if interview["status"] == "ABANDONED":
        raise errors.conflict("INTERVIEW_ABANDONED",
                              "Buổi phỏng vấn đã quá 72 giờ không hoạt động nên bị huỷ và tính là một lần phỏng vấn")
    # US-43 (PRD-AIV-2) — 50–3000 ký tự.
    length_error = attempts.answer_length_error(text)
    if length_error == "ANSWER_TOO_SHORT":
        raise errors.bad_request(length_error, f"Câu trả lời cần ít nhất {attempts.ANSWER_MIN} ký tự")
    if length_error == "ANSWER_TOO_LONG":
        raise errors.bad_request(length_error, f"Câu trả lời tối đa {attempts.ANSWER_MAX} ký tự")
    if interview["status"] != "IN_PROGRESS":
        raise errors.conflict("INTERVIEW_NOT_IN_PROGRESS", "Buổi phỏng vấn đã kết thúc")

    turns = await repo.turns_of(pool, interview_id)
    current = next((t for t in turns if t["answer"] is None), None)
    if current is None:
        raise errors.conflict("NO_OPEN_QUESTION", "Không có câu hỏi đang chờ trả lời")

    mentor = await profile.find_mentor(user.user_id)
    ctx = _context(interview["domain"], list(interview["skills"] or []), mentor, interview["max_turns"])
    history = [repo.to_record(t) for t in turns if t["answer"] is not None]
    current_record = TurnRecord(turn_no=current["turn_no"], topic=current["topic"], strategy=current["strategy"],
                                question=current["question"], answer=text)
    is_last = current["turn_no"] >= interview["max_turns"]

    # Gọi engine TRƯỚC khi mở transaction (DeepSeek có thể mất vài giây).
    evaluation = await interview_engine.evaluate(interview["engine"], ctx, history, current_record, is_last)
    flags = list(evaluation.value.flags)
    if pasted_large_text and rubric.FLAG_COPIED_ANSWER not in flags:
        flags.append(rubric.FLAG_COPIED_ANSWER)
    assessment = None
    if is_last:
        scored = current_record.model_copy(update={"score": evaluation.value.score, "flags": flags})
        assessment = await interview_engine.summarize(interview["engine"], ctx, [*history, scored])

    async with pool.acquire() as conn, conn.transaction():
        written = await repo.answer_turn(conn, current["id"], text, evaluation.value, flags,
                                         evaluation.used_engine, evaluation.model, evaluation.prompt_version,
                                         evaluation.fallback_used)
        if not written:
            raise errors.conflict("ALREADY_ANSWERED", "Câu hỏi này đã được trả lời")
        if assessment is None:
            plan = evaluation.value.next
            if plan is None:
                raise AiServiceUnavailable()
            next_turn = current["turn_no"] + 1
            await repo.insert_turn(conn, interview_id, next_turn, plan.topic, plan.strategy, plan.question)
            await repo.set_current_turn(conn, interview_id, next_turn)
            updated = await _find(conn, interview_id)
        else:
            final = assessment.value
            updated = await repo.complete(conn, interview_id, final.overall_score, final.summary,
                                          "\n".join(final.strengths), "\n".join(final.weaknesses),
                                          final.recommendation)

    if updated["status"] == "PENDING_REVIEW":
        await profile.update_verification(user.user_id, "PENDING_REVIEW")
        await mentoring.notify_role(
            "ADMIN", "INTERVIEW_PENDING_REVIEW", "Có kết quả AI Interview cần duyệt",
            f"Mentor lĩnh vực {updated['domain']} đạt {updated['overall_score']:.1f}/100 điểm "
            f"(AI khuyến nghị: {updated['recommendation']}).",
            f"/admin/interviews/{updated['id']}")
        await mentoring.notify_user(
            user.user_id, "INTERVIEW_COMPLETED", "Bạn đã hoàn thành AI Interview",
            "Kết quả đang chờ quản trị viên xem xét trước khi kích hoạt tài khoản mentor.", "/interview")
    return await _view(pool, updated, for_admin=False)


async def latest_for(user: AuthUser) -> InterviewView | None:
    await abandon_stale(user.user_id)
    pool = await get_pool()
    interview = await repo.latest_for_mentor(pool, user.user_id)
    return None if interview is None else await _view(pool, interview, for_admin=False)


async def get(user: AuthUser, interview_id: UUID) -> InterviewView:
    pool = await get_pool()
    interview = await _find(pool, interview_id)
    if not user.is_admin and not user.is_internal and interview["mentor_id"] != user.user_id:
        raise errors.forbidden("Bạn không có quyền xem buổi phỏng vấn này")
    return await _view(pool, interview, for_admin=user.is_admin)


async def list_interviews(status: str | None) -> list[InterviewView]:
    pool = await get_pool()
    rows = await repo.list_all(pool, status.upper() if status else None)
    return [await _view(pool, row, for_admin=True) for row in rows]


_DECISION_STATUS = {"APPROVE": "APPROVED", "REJECT": "REJECTED", "REQUEST_RETAKE": "RETAKE_REQUESTED"}
# Trạng thái xác thực đồng bộ sang profile-service: làm lại => quay về PENDING_INTERVIEW.
_DECISION_VERIFICATION = {"APPROVE": "APPROVED", "REJECT": "REJECTED", "REQUEST_RETAKE": "PENDING_INTERVIEW"}
MIN_OVERRULE_NOTE = 10


async def review(admin: AuthUser, interview_id: UUID, decision: ReviewInterviewInput) -> InterviewView:
    """FR-7.5 / NFR-8 / US-23 — admin xác nhận cuối cùng: APPROVE | REJECT | REQUEST_RETAKE."""
    choice = decision.decision
    note = (decision.note or "").strip() or None
    pool = await get_pool()
    current = await _find(pool, interview_id)
    if current["status"] != "PENDING_REVIEW":
        raise errors.conflict("INTERVIEW_NOT_PENDING_REVIEW", "Buổi phỏng vấn không ở trạng thái chờ duyệt")
    if rubric.note_required(choice, current["recommendation"]) and len(note or "") < MIN_OVERRULE_NOTE:
        raise errors.bad_request("REVIEW_NOTE_REQUIRED",
                                 f"Quyết định khác khuyến nghị của AI ({current['recommendation']}) — "
                                 f"vui lòng ghi rõ lý do (ít nhất {MIN_OVERRULE_NOTE} ký tự)")
    updated = await repo.review(pool, interview_id, _DECISION_STATUS[choice], admin.user_id, note)
    if updated is None:
        raise errors.conflict("INTERVIEW_NOT_PENDING_REVIEW", "Buổi phỏng vấn không ở trạng thái chờ duyệt")

    await profile.update_verification(updated["mentor_id"], _DECISION_VERIFICATION[choice])
    suffix = "" if note is None else f" Nhận xét: {note}"
    if choice == "APPROVE":
        notice = ("MENTOR_APPROVED", "Tài khoản mentor đã được kích hoạt",
                  "Chúc mừng! Bạn đã có thể xuất hiện trong kết quả gợi ý và nhận mentee." + suffix)
    elif choice == "REJECT":
        days = config.INTERVIEW_COOLDOWN_DAYS
        notice = ("MENTOR_REJECTED", "Hồ sơ mentor chưa được duyệt",
                  f"Bạn có thể cập nhật hồ sơ và phỏng vấn lại sau {days:g} ngày." + suffix)
    else:
        notice = ("INTERVIEW_RETAKE_REQUESTED", "Quản trị viên đề nghị bạn phỏng vấn lại",
                  "Bạn có thể bắt đầu buổi phỏng vấn mới ngay; lần này không bị tính vào số lần phỏng vấn." + suffix)
    await mentoring.notify_user(updated["mentor_id"], *notice, "/interview")
    await audit.record(admin.user_id, "ADMIN", f"INTERVIEW_{_DECISION_STATUS[choice]}", "INTERVIEW", str(interview_id),
                       {"status": current["status"], "recommendation": current["recommendation"],
                        "overallScore": current["overall_score"]},
                       {"status": updated["status"], "decision": choice, "note": note,
                        "mentorId": str(updated["mentor_id"]),
                        "agreesWithAi": rubric.agrees(choice, current["recommendation"])})
    return await _view(pool, updated, for_admin=True)


async def unlock(admin: AuthUser, mentor_id: UUID, note: str | None) -> EligibilityView:
    """US-22 — admin mở khoá mentor đã bị từ chối đủ số lần tối đa (ghi audit log)."""
    note = (note or "").strip() or None
    pool = await get_pool()
    before = await _eligibility(pool, mentor_id)
    if not before.locked:
        raise errors.conflict("INTERVIEW_NOT_LOCKED", "Mentor này không bị khoá phỏng vấn")
    await repo.insert_unlock(pool, mentor_id, admin.user_id, note)
    after = await eligibility(mentor_id)
    await audit.record(admin.user_id, "ADMIN", "INTERVIEW_ATTEMPTS_UNLOCKED", "MENTOR", str(mentor_id),
                       {"locked": True, "attemptsUsed": before.attempts_used},
                       {"locked": after.locked, "attemptsUsed": after.attempts_used, "note": note})
    return after


_STATUS_DECISION = {v: k for k, v in _DECISION_STATUS.items()}


def agreement(rows: list[tuple[str, str | None, int]]) -> dict:
    """US-24 — (status đã quyết định, khuyến nghị AI, số buổi) → các con số đồng thuận (hàm thuần)."""
    total = comparable = agreeing = 0
    for status, recommendation, count in rows:
        total += count
        agrees = rubric.agrees(_STATUS_DECISION[status], recommendation)
        if agrees is not None:
            comparable += count
            agreeing += count if agrees else 0
    return {"decisions_total": total, "decisions_comparable": comparable, "decisions_agreeing": agreeing,
            "decisions_on_needs_review": total - comparable,
            "agreement_rate": round(agreeing / comparable, 4) if comparable else None}


async def stats() -> InterviewStats:
    pool = await get_pool()
    counts = await repo.count_by_status(pool)
    reviewed = await repo.review_counts(pool)
    return InterviewStats(
        interviews_in_progress=counts.get("IN_PROGRESS", 0),
        interviews_pending_review=counts.get("PENDING_REVIEW", 0),
        mentors_approved=counts.get("APPROVED", 0),
        mentors_rejected=counts.get("REJECTED", 0),
        retakes_requested=counts.get("RETAKE_REQUESTED", 0),
        **agreement([(r["status"], r["recommendation"], r["total"]) for r in reviewed]))


async def dev_age(interview_id: UUID, hours: float) -> InterviewView:
    """Chỉ dev/e2e (không có ở APP_ENV=prod): lùi mốc bắt đầu và các câu trả lời `hours` giờ (kiểm thử US-43 72 giờ)."""
    pool = await get_pool()
    async with pool.acquire() as conn, conn.transaction():
        await conn.execute("UPDATE interviews SET created_at = created_at - make_interval(secs => $2) WHERE id = $1",
                           interview_id, hours * 3600)
        await conn.execute("""UPDATE interview_turns SET asked_at = asked_at - make_interval(secs => $2),
                                     answered_at = answered_at - make_interval(secs => $2) WHERE interview_id = $1""",
                           interview_id, hours * 3600)
    return await _view(pool, await _find(pool, interview_id), for_admin=True)


async def _find(db, interview_id: UUID):
    interview = await repo.find(db, interview_id)
    if interview is None:
        raise errors.not_found("INTERVIEW_NOT_FOUND", "Không tìm thấy buổi phỏng vấn")
    return interview


class AiServiceUnavailable(errors.AiError):
    def __init__(self) -> None:
        super().__init__("AI_ENGINE_UNAVAILABLE",
                         "Engine AI không sinh được câu hỏi tiếp theo, vui lòng gửi lại câu trả lời", status=502)
