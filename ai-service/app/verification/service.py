"""
Đợt xác thực mentor (docs/design-mentor-verification.md §3–4, §7): trạng thái đợt, luật số lần và 15 ngày, duyệt vòng 1.

Vòng 1 (phỏng vấn giọng nói) do app.interview.service chạy; module này giữ đợt đứng trên các buổi đó và quyết định của admin.
Tuyệt đối không import app.interview.service (service đó gọi ngược vào đây).
"""
import logging
from datetime import datetime, timezone
from uuid import UUID

import asyncpg
from pydantic import TypeAdapter

from app import config, errors
from app.clients import audit, mentoring, profile
from app.db import get_pool
from app.interview import repository as irepo
from app.interview import rubric, voice
from app.interview.views import InterviewStats, InterviewView, interview_view
from app.security import AuthUser
from app.verification import repository as repo
from app.verification import rules
from app.verification.views import ApplicationView, Round1ReviewInput, VerificationStatusView

log = logging.getLogger(__name__)

MIN_OVERRULE_NOTE = 10
_DATETIME = TypeAdapter(datetime)
_INTERVIEW_DECISION = {"PASS": "PASSED", "REJECT": "REJECTED", "RETAKE": "RETAKE_REQUESTED"}
_STATUS_CHOICE = {"PASSED": "APPROVE", "REJECTED": "REJECT", "RETAKE_REQUESTED": "REQUEST_RETAKE"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
    return _DATETIME.dump_python(value, mode="json")


async def _interview_view(db, interview, for_admin: bool) -> InterviewView:
    turns = await irepo.turns_of(db, interview["id"])
    name = await profile.display_name(interview["mentor_id"]) if for_admin else None
    return interview_view(interview, turns, for_admin, name)


# ---------- trạng thái và điều kiện bắt đầu ----------

async def start_state(db, mentor_id: UUID):
    """(StartState, đợt đang mở hoặc None, đợt gần nhất hoặc None)."""
    open_app = await repo.open_for_mentor(db, mentor_id)
    latest = open_app or await repo.latest_for_mentor(db, mentor_id)
    has_in_progress = open_app is not None and await repo.in_progress_interview(db, open_app["id"]) is not None
    state = rules.start_state(open_app["status"] if open_app else None, has_in_progress,
                              latest["status"] if latest else None, latest["retry_after"] if latest else None, _now())
    return state, open_app, latest


def raise_if_blocked(state: rules.StartState) -> None:
    if state.reason == "PENDING_REVIEW":
        raise errors.conflict("INTERVIEW_PENDING_REVIEW", "Kết quả phỏng vấn đang chờ quản trị viên xem xét")
    if state.reason == "ALREADY_APPROVED":
        raise errors.conflict("ALREADY_APPROVED", "Tài khoản mentor đã được kích hoạt")
    if state.reason == "COOLDOWN":
        raise errors.conflict("INTERVIEW_COOLDOWN",
                              f"Đợt xác thực trước đã kết thúc, bạn cần chờ {config.VERIFICATION_RETRY_DAYS:g} ngày mới được bắt đầu lại",
                              extra={"retryAfter": _iso(state.cooldown_until)})


async def get_or_create_open(db, mentor_id: UUID) -> asyncpg.Record:
    """Đợt đang mở của mentor, chưa có thì tạo (an toàn khi hai request cùng lúc nhờ chỉ mục unique từng phần)."""
    existing = await repo.open_for_mentor(db, mentor_id)
    if existing is not None:
        return existing
    created = await repo.insert(db, mentor_id)
    return created if created is not None else await repo.open_for_mentor(db, mentor_id)


async def status_view(mentor_id: UUID) -> VerificationStatusView:
    pool = await get_pool()
    state, open_app, latest = await start_state(pool, mentor_id)
    # Số lần chỉ tính trong đợt đang mở, hoặc đợt vừa kết thúc còn trong thời gian chờ / đã duyệt
    shown = open_app or (latest if state.reason in ("COOLDOWN", "ALREADY_APPROVED") else None)
    failed = await repo.failed_attempts(pool, shown["id"]) if shown else 0
    max_attempts = config.VERIFICATION_MAX_ATTEMPTS_PER_ROUND
    return VerificationStatusView(
        application_id=shown["id"] if shown else None, status=shown["status"] if shown else None,
        attempts_used=failed, attempts_left=rules.attempts_left(failed, max_attempts), max_attempts=max_attempts,
        retake_count=shown["retake_count"] if shown else 0, retake_limit=config.VERIFICATION_ROUND1_MAX_RETAKE,
        retry_after=state.cooldown_until, can_start=state.can_start, reason=state.reason,
        voice_available=voice.available())


async def start_application(user: AuthUser) -> VerificationStatusView:
    """POST /verification/applications — mở đợt mới (idempotent: đã có đợt mở thì trả lại trạng thái hiện tại)."""
    mentor = await profile.find_mentor(user.user_id)
    if mentor is None:
        raise errors.bad_request("PROFILE_REQUIRED", "Bạn cần hoàn thành hồ sơ mentor trước khi xác thực")
    if mentor.get("verificationStatus") == "APPROVED":
        raise errors.conflict("ALREADY_APPROVED", "Tài khoản mentor đã được kích hoạt")
    pool = await get_pool()
    state, open_app, _ = await start_state(pool, user.user_id)
    raise_if_blocked(state)
    if open_app is None:
        await get_or_create_open(pool, user.user_id)
        if mentor.get("verificationStatus") == "REJECTED":
            await profile.update_verification(user.user_id, rules.profile_status(rules.ROUND1))
    return await status_view(user.user_id)


# ---------- móc từ vòng 1 ----------

async def on_round1_completed(conn, application_id: UUID | None) -> None:
    """Buổi vòng 1 vừa nộp bản chép lời xong (trong cùng transaction): đợt sang ROUND1_REVIEW chờ admin duyệt."""
    if application_id is not None:
        await repo.set_status(conn, application_id, rules.ROUND1_REVIEW, expected=rules.ROUND1)


async def on_attempt_failed(application_id: UUID | None, mentor_id: UUID) -> None:
    """Một lần làm vòng 1 không hoàn thành hợp lệ (bỏ dở): hết lượt thì đóng đợt, chờ VERIFICATION_RETRY_DAYS ngày."""
    if application_id is None:
        return
    pool = await get_pool()
    failed = await repo.failed_attempts(pool, application_id)
    if not rules.exhausted(failed, config.VERIFICATION_MAX_ATTEMPTS_PER_ROUND):
        return
    closed = await repo.close(pool, application_id, rules.CLOSED, config.VERIFICATION_RETRY_DAYS)
    if closed is None:
        return
    await profile.update_verification(mentor_id, rules.profile_status(rules.CLOSED))
    await mentoring.notify_user(
        mentor_id, "MENTOR_REJECTED", "Đợt xác thực đã đóng",
        f"Bạn chưa hoàn thành phỏng vấn trong {config.VERIFICATION_MAX_ATTEMPTS_PER_ROUND} lần cho phép. "
        f"Bạn có thể bắt đầu đợt mới sau {config.VERIFICATION_RETRY_DAYS:g} ngày.", "/interview")
    await audit.record(None, "SYSTEM", "VERIFICATION_CLOSED", "VERIFICATION", str(application_id),
                       {"status": rules.ROUND1}, {"status": rules.CLOSED, "failedAttempts": failed, "mentorId": str(mentor_id)})


# ---------- admin ----------

async def _application_view(db, app, detail: bool) -> ApplicationView:
    failed = await repo.failed_attempts(db, app["id"])
    interviews = await repo.interviews_of(db, app["id"])
    views = [await _interview_view(db, i, for_admin=True) for i in (interviews if detail else interviews[-1:])]
    max_attempts = config.VERIFICATION_MAX_ATTEMPTS_PER_ROUND
    return ApplicationView(
        id=app["id"], mentor_id=app["mentor_id"], mentor_name=await profile.display_name(app["mentor_id"]),
        status=app["status"], attempts_used=failed, attempts_left=rules.attempts_left(failed, max_attempts),
        max_attempts=max_attempts, retake_count=app["retake_count"], retake_limit=config.VERIFICATION_ROUND1_MAX_RETAKE,
        round1_decision=app["round1_decision"], round1_note=app["round1_note"],
        round1_reviewed_at=app["round1_reviewed_at"], reviewed_at=app["reviewed_at"], closed_at=app["closed_at"],
        retry_after=app["retry_after"], created_at=app["created_at"],
        interview=views[-1] if views else None, interviews=views if detail else [])


async def list_applications(status: str | None) -> list[ApplicationView]:
    pool = await get_pool()
    rows = await repo.list_all(pool, status.upper() if status else None)
    return [await _application_view(pool, row, detail=False) for row in rows]


async def get_application(application_id: UUID) -> ApplicationView:
    pool = await get_pool()
    return await _application_view(pool, await _find(pool, application_id), detail=True)


async def _find(db, application_id: UUID):
    app = await repo.find(db, application_id)
    if app is None:
        raise errors.not_found("VERIFICATION_NOT_FOUND", "Không tìm thấy đợt xác thực")
    return app


async def round1_review(admin: AuthUser, application_id: UUID, body: Round1ReviewInput) -> ApplicationView:
    """Duyệt vòng 1 (§7): PASS | REJECT | RETAKE. Ghi chú ≥ 10 ký tự khi quyết định ngược khuyến nghị AI hoặc khi RETAKE."""
    decision = body.decision
    note = (body.note or "").strip() or None
    pool = await get_pool()
    app = await _find(pool, application_id)
    if app["status"] != rules.ROUND1_REVIEW:
        raise errors.conflict("VERIFICATION_NOT_PENDING_REVIEW", "Đợt xác thực không ở bước chờ duyệt vòng 1")
    interview = await repo.pending_review_interview(pool, application_id)
    if interview is None:
        raise errors.conflict("VERIFICATION_NOT_PENDING_REVIEW", "Không có buổi vòng 1 nào đang chờ duyệt")
    if decision == "RETAKE" and not rules.can_retake(app["retake_count"], config.VERIFICATION_ROUND1_MAX_RETAKE):
        raise errors.conflict("RETAKE_LIMIT_REACHED",
                              f"Đã yêu cầu làm lại vòng 1 {config.VERIFICATION_ROUND1_MAX_RETAKE} lần, chỉ còn PASS hoặc REJECT")
    choice = rules.ROUND1_CHOICE[decision]
    if (decision == "RETAKE" or rubric.note_required(choice, interview["recommendation"])) and len(note or "") < MIN_OVERRULE_NOTE:
        why = "yêu cầu làm lại" if decision == "RETAKE" else f"khác khuyến nghị của AI ({interview['recommendation']})"
        raise errors.bad_request("REVIEW_NOTE_REQUIRED",
                                 f"Quyết định {why} — vui lòng ghi rõ lý do (ít nhất {MIN_OVERRULE_NOTE} ký tự)")

    final = decision == "PASS" and not config.VERIFICATION_ROUND2_ENABLED
    new_status = {"RETAKE": rules.ROUND1, "REJECT": rules.REJECTED,
                  "PASS": rules.APPROVED if final else rules.ROUND2_PENDING_SLOTS}[decision]
    async with pool.acquire() as conn, conn.transaction():
        updated = await repo.apply_round1_decision(conn, application_id, decision, admin.user_id, note, new_status,
                                                   config.VERIFICATION_RETRY_DAYS, final)
        if updated is None:
            raise errors.conflict("VERIFICATION_NOT_PENDING_REVIEW", "Đợt xác thực không ở bước chờ duyệt vòng 1")
        await conn.execute(
            """UPDATE interviews SET status = $2, reviewed_by = $3, review_note = $4, reviewed_at = now()
                WHERE id = $1 AND status = 'PENDING_REVIEW'""",
            interview["id"], _INTERVIEW_DECISION[decision], admin.user_id, note)

    await profile.update_verification(updated["mentor_id"], rules.profile_status(new_status))
    suffix = "" if note is None else f" Nhận xét: {note}"
    if decision == "PASS" and final:
        notice = ("MENTOR_APPROVED", "Tài khoản mentor đã được kích hoạt",
                  "Chúc mừng! Bạn có thể chọn mức giá cho buổi mentoring, xuất hiện trong kết quả gợi ý và nhận mentee." + suffix)
    elif decision == "PASS":
        notice = ("MENTOR_APPROVED", "Bạn đã qua vòng 1",
                  "Quản trị viên sẽ đề xuất giờ phỏng vấn vòng 2 với bạn." + suffix)
    elif decision == "REJECT":
        notice = ("MENTOR_REJECTED", "Hồ sơ mentor chưa được duyệt",
                  f"Bạn có thể cập nhật hồ sơ và xác thực lại sau {config.VERIFICATION_RETRY_DAYS:g} ngày." + suffix)
    else:
        notice = ("INTERVIEW_RETAKE_REQUESTED", "Quản trị viên đề nghị bạn phỏng vấn lại",
                  "Bạn có thể làm lại vòng 1 ngay; lần này không bị tính vào số lần làm." + suffix)
    await mentoring.notify_user(updated["mentor_id"], *notice, "/interview")
    await audit.record(admin.user_id, "ADMIN", f"VERIFICATION_ROUND1_{_INTERVIEW_DECISION[decision]}", "VERIFICATION",
                       str(application_id),
                       {"status": app["status"], "recommendation": interview["recommendation"],
                        "overallScore": interview["overall_score"]},
                       {"status": updated["status"], "decision": decision, "note": note,
                        "mentorId": str(updated["mentor_id"]), "interviewId": str(interview["id"]),
                        "agreesWithAi": rubric.agrees(choice, interview["recommendation"])})
    return await _application_view(pool, updated, detail=True)


# ---------- thống kê (US-24) ----------

def agreement(rows: list[tuple[str, str | None, int]]) -> dict:
    """US-24 — (kết quả buổi đã quyết định, khuyến nghị AI, số buổi) → các con số đồng thuận (hàm thuần)."""
    total = comparable = agreeing = 0
    for status, recommendation, count in rows:
        total += count
        agrees = rubric.agrees(_STATUS_CHOICE[status], recommendation)
        if agrees is not None:
            comparable += count
            agreeing += count if agrees else 0
    return {"decisions_total": total, "decisions_comparable": comparable, "decisions_agreeing": agreeing,
            "decisions_on_needs_review": total - comparable,
            "agreement_rate": round(agreeing / comparable, 4) if comparable else None}


async def stats() -> InterviewStats:
    pool = await get_pool()
    interviews = await repo.interview_counts(pool)
    applications = await repo.count_by_status(pool)
    decided = await repo.interview_decision_counts(pool)
    return InterviewStats(
        interviews_in_progress=interviews.get("IN_PROGRESS", 0),
        interviews_pending_review=applications.get(rules.ROUND1_REVIEW, 0),
        mentors_approved=applications.get(rules.APPROVED, 0),
        mentors_rejected=applications.get(rules.REJECTED, 0) + applications.get(rules.CLOSED, 0),
        retakes_requested=interviews.get("RETAKE_REQUESTED", 0),
        **agreement([(r["status"], r["recommendation"], r["total"]) for r in decided]))


async def dev_age(application_id: UUID, days: float) -> ApplicationView:
    """Chỉ dev/e2e (không có ở APP_ENV=prod): lùi mốc thời gian của đợt `days` ngày (kiểm thử chờ 15 ngày)."""
    pool = await get_pool()
    await _find(pool, application_id)
    await repo.age(pool, application_id, days)
    return await _application_view(pool, await _find(pool, application_id), detail=False)
