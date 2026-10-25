"""
Vòng 1 của xác thực mentor: AI phỏng vấn bằng giọng nói (FR-7.7).

Vòng đời: mentor bắt đầu (tạo đợt xác thực nếu chưa có, xem app.verification) → nói chuyện với người phỏng vấn AI →
trình duyệt gửi bản chép lời, engine chấm từng chủ đề và tổng hợp → buổi PENDING_REVIEW, đợt sang ROUND1_REVIEW, thông báo
admin → admin duyệt vòng 1 (app.verification.service.round1_review).

Lời gọi engine (DeepSeek) mất vài giây nên luôn thực hiện NGOÀI transaction.
"""
import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

from app import config, engines, errors
from app.clients import audit, mentoring, profile
from app.db import get_pool
from app.cv import repository as cv_repo
from app.interview import planner, voice
from app.interview import engine as interview_engine
from app.interview import repository as repo
from app.interview.models import InterviewContext, TurnRecord
from app.interview.views import InterviewView, VoiceInterviewStart, interview_view
from app.interview.voice import TranscriptItem
from app.security import AuthUser
from app.verification import repository as vrepo
from app.verification import service as verification

log = logging.getLogger(__name__)


async def _view(db, interview, for_admin: bool) -> InterviewView:
    """`db` là pool hoặc connection — asyncpg.Pool proxy sẵn fetch/fetchrow/execute."""
    turns = await repo.turns_of(db, interview["id"])
    name = await profile.display_name(interview["mentor_id"]) if for_admin else None
    return interview_view(interview, turns, for_admin, name)


def _context(domain: str, skills: list[str], mentor: dict | None, max_turns: int) -> InterviewContext:
    return InterviewContext(domain=domain, skills=skills, max_turns=max_turns,
                            years_experience=(mentor or {}).get("yearsExperience", 0) or 0,
                            bio=(mentor or {}).get("bio"))


async def abandon_stale(mentor_id: UUID | None = None) -> int:
    """FR-7.7 — buổi giọng nói quá VOICE_SESSION_MINUTES phút chưa gửi bản ghi → ABANDONED (tính là 1 lần phỏng vấn)."""
    pool = await get_pool()
    now = datetime.now(timezone.utc)
    rows = await repo.abandon_stale(pool, now - timedelta(minutes=config.VOICE_SESSION_MINUTES), mentor_id)
    for r in rows:
        await audit.record(None, "SYSTEM", "INTERVIEW_ABANDONED", "INTERVIEW", str(r["id"]),
                           None, {"mentorId": str(r["mentor_id"])})
        await verification.on_attempt_failed(r["application_id"], r["mentor_id"])  # hết lượt thì đóng đợt
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


@dataclass
class _Start:
    pool: object
    mentor: dict
    in_progress: object | None  # buổi IN_PROGRESS còn hạn => tiếp tục thay vì tạo mới
    application: object | None = None  # đợt đang mở (None => start_voice tạo đợt cùng lúc với buổi)


async def _prepare_start(user: AuthUser, self_answer_acknowledged: bool) -> _Start:
    """
    Kiểm tra trước khi bắt đầu phỏng vấn giọng nói (FR-7.7): xác nhận tự trả lời, hồ sơ mentor, trạng thái và thời gian chờ
    của đợt xác thực (docs/design-mentor-verification.md §4). Không tạo dữ liệu.
    """
    if not self_answer_acknowledged:
        raise errors.bad_request("SELF_ANSWER_ACK_REQUIRED",
                                 "Bạn cần xác nhận tự trả lời, không có sự trợ giúp từ bên ngoài trước khi bắt đầu")
    mentor = await profile.find_mentor(user.user_id)
    if mentor is None:
        raise errors.bad_request("PROFILE_REQUIRED", "Bạn cần hoàn thành hồ sơ mentor trước khi phỏng vấn")
    if mentor.get("verificationStatus") == "APPROVED":
        raise errors.conflict("ALREADY_APPROVED", "Tài khoản mentor đã được kích hoạt")

    await abandon_stale(user.user_id)  # quá hạn thì không tiếp tục được nữa
    pool = await get_pool()
    state, open_app, _ = await verification.start_state(pool, user.user_id)
    verification.raise_if_blocked(state)
    in_progress = None
    if open_app is not None:
        row = await vrepo.in_progress_interview(pool, open_app["id"])
        in_progress = None if row is None else await repo.find(pool, row["id"])
    return _Start(pool, mentor, in_progress, open_app)


def _plan_of(interview) -> planner.InterviewPlan:
    """Kế hoạch đã lưu của buổi giọng nói; buổi tạo trước migration 011 => ngân hàng câu hỏi (như lúc tạo)."""
    return planner.load(interview["plan"]) or planner.mentor_bank_plan(interview["domain"], list(interview["skills"] or []))


async def _after_start(user: AuthUser, mentor: dict) -> None:
    if mentor.get("verificationStatus") == "REJECTED":
        await profile.update_verification(user.user_id, "PENDING_INTERVIEW")


async def start_voice(user: AuthUser, self_answer_acknowledged: bool, consent_external_ai: bool) -> VoiceInterviewStart:
    """
    FR-7.7 — bắt đầu buổi phỏng vấn giọng nói: Gọi lại khi đang có buổi giọng
    nói chưa quá VOICE_SESSION_MINUTES phút => cùng buổi đó với client secret mới (kết nối lại khi rớt cuộc gọi).
    """
    voice.require_consent(consent_external_ai)
    voice.ensure_available()
    s = await _prepare_start(user, self_answer_acknowledged)
    if s.in_progress is not None:
        topics = _plan_of(s.in_progress).topics  # kết nối lại: đúng kế hoạch đã soạn
        session = await voice.mint(user.user_id, voice.build_instructions(s.mentor, topics), [t.name for t in topics])
        return VoiceInterviewStart(interview=await _view(s.pool, s.in_progress, for_admin=False), voice=session)

    mentor = s.mentor
    skills = list(mentor.get("skills") or [])
    # Phương án A — AI soạn kế hoạch câu hỏi một lần từ hồ sơ + CV (nếu được đồng ý gửi AI bên ngoài); lỗi => ngân hàng câu hỏi.
    plan = await planner.mentor_plan(mentor, await cv_repo.confirmed_for_external_ai(s.pool, user.user_id))
    # Tạo client secret TRƯỚC khi ghi CSDL: OpenAI lỗi (502) thì không có buổi nào bị tính.
    session = await voice.mint(user.user_id, voice.build_instructions(mentor, plan.topics), [t.name for t in plan.topics])
    async with s.pool.acquire() as conn, conn.transaction():
        application = await verification.get_or_create_open(conn, user.user_id)
        interview = await repo.insert(conn, user.user_id, mentor["domain"], skills, len(plan.topics), engines.select(None),
                                      plan=planner.dump(plan), application_id=application["id"])
    await _after_start(user, mentor)
    return VoiceInterviewStart(interview=await _view(s.pool, interview, for_admin=False), voice=session)


async def _on_completed(mentor_id: UUID, updated) -> None:
    """Buổi vừa sang PENDING_REVIEW: đồng bộ trạng thái xác thực + thông báo admin và mentor."""
    await profile.update_verification(mentor_id, "PENDING_REVIEW")
    via = " (phỏng vấn giọng nói)"
    await mentoring.notify_role(
        "ADMIN", "INTERVIEW_PENDING_REVIEW", "Có kết quả AI Interview cần duyệt",
        f"Mentor lĩnh vực {updated['domain']} đạt {updated['overall_score']:.1f}/100 điểm{via} "
        f"(AI khuyến nghị: {updated['recommendation']}).",
        f"/admin/verification/{updated['application_id']}")
    await mentoring.notify_user(
        mentor_id, "INTERVIEW_COMPLETED", "Bạn đã hoàn thành AI Interview",
        "Kết quả đang chờ quản trị viên xem xét trước khi kích hoạt tài khoản mentor.", "/interview")


async def submit_voice_transcript(user: AuthUser, interview_id: UUID, items: list[TranscriptItem]) -> InterviewView:
    """
    FR-7.7 — bản ghi buổi giọng nói: gộp theo chủ đề → mỗi chủ đề một lượt (câu hỏi = lời người phỏng vấn nối " / ",
    câu trả lời = lời mentor), chấm bằng engine + rubric rồi sang PENDING_REVIEW.
    """
    pool = await get_pool()
    interview = await _find(pool, interview_id)
    if interview["mentor_id"] != user.user_id:
        raise errors.forbidden("Đây không phải buổi phỏng vấn của bạn")
    if interview["status"] == "IN_PROGRESS" and await abandon_stale(user.user_id):
        interview = await _find(pool, interview_id)  # quá VOICE_SESSION_MINUTES: job nền chưa quét kịp
    if interview["status"] == "ABANDONED":
        raise errors.conflict("INTERVIEW_ABANDONED", "Buổi phỏng vấn giọng nói đã quá hạn nên bị huỷ và tính là một lần phỏng vấn")
    if interview["status"] != "IN_PROGRESS":
        raise errors.conflict("INTERVIEW_NOT_IN_PROGRESS", "Buổi phỏng vấn đã kết thúc")

    plan = _plan_of(interview)
    topics = plan.topics
    grouped = voice.asked_topics(items, len(topics))
    mentor = await profile.find_mentor(user.user_id)
    ctx = _context(interview["domain"], list(interview["skills"] or []), mentor, len(grouped))
    ctx = ctx.model_copy(update={"planned_concepts": plan.concepts()})  # rule-based chấm câu AI soạn theo expectedConcepts

    # Chấm NGOÀI transaction (DeepSeek có thể mất vài giây mỗi lượt).
    history: list[TurnRecord] = []
    scored = []
    for i, turn in enumerate(grouped):
        record = TurnRecord(turn_no=i + 1, topic=topics[turn.topic_no - 1].name, strategy="OPENING" if i == 0 else "PIVOT",
                            question=" / ".join(turn.questions), answer=" ".join(turn.answers) or voice.NO_ANSWER)
        evaluation = await interview_engine.evaluate(interview["engine"], ctx, history, record, True)
        history.append(record.model_copy(update={"score": evaluation.value.score, "flags": evaluation.value.flags}))
        scored.append((record, evaluation))
    final = (await interview_engine.summarize(interview["engine"], ctx, history)).value

    async with pool.acquire() as conn, conn.transaction():
        if await repo.lock_in_progress(conn, interview_id) is None:
            raise errors.conflict("INTERVIEW_NOT_IN_PROGRESS", "Buổi phỏng vấn đã kết thúc")
        for record, ev in scored:
            turn_id = await repo.insert_turn(conn, interview_id, record.turn_no, record.topic, record.strategy, record.question)
            await repo.answer_turn(conn, turn_id, record.answer, ev.value, list(ev.value.flags), ev.used_engine, ev.model,
                                   ev.prompt_version, ev.fallback_used)
        await repo.set_current_turn(conn, interview_id, len(scored))
        updated = await repo.complete(conn, interview_id, final.overall_score, final.summary, "\n".join(final.strengths),
                                      "\n".join(final.weaknesses), final.recommendation)
        await verification.on_round1_completed(conn, updated["application_id"])

    await _on_completed(user.user_id, updated)
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
