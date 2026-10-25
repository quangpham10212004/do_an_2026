"""
Vòng 2 xác thực mentor: admin phỏng vấn qua Jitsi (docs/design-mentor-verification.md §6).

Luồng: admin cho qua vòng 1 (ROUND2_PENDING_SLOTS) → đề xuất khung giờ (ROUND2_PENDING_CHOICE) → mentor chọn (ROUND2_SCHEDULED) →
hai bên vào phòng Jitsi → admin chấm phiếu 5 tiêu chí và kết luận APPROVE | REJECT | RESCHEDULE. Mentor đổi giờ (≤ 2 lần, báo trước
≥ 24 giờ) hoặc vắng (≥ 2 lần thì đóng đợt) đưa đợt về ROUND2_PENDING_SLOTS. Phòng chỉ cấp token cho admin hoặc đúng mentor của đợt.
"""
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from app import config, errors
from app.clients import audit, mentoring, profile
from app.db import get_pool
from app.interview import rubric
from app.security import AuthUser
from app.verification import repository as repo
from app.verification import round2_repository as r2repo
from app.verification import round2_rubric, round2_rules, rules
from app.verification import service as verification
from app.verification.views import (ApplicationView, ProposeSlotsInput, Round2DecisionInput, RoomView, VerificationStatusView)

log = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _room_name() -> str:
    return "mentorhub-verify-" + uuid4().hex


def _opens_before() -> timedelta:
    return timedelta(minutes=config.VERIFICATION_ROOM_OPENS_BEFORE_MINUTES)


async def _find(db, application_id: UUID):
    app = await repo.find(db, application_id)
    if app is None:
        raise errors.not_found("VERIFICATION_NOT_FOUND", "Không tìm thấy đợt xác thực")
    return app


# ---------- admin đề xuất khung giờ ----------

async def propose_slots(admin: AuthUser, application_id: UUID, body: ProposeSlotsInput) -> ApplicationView:
    pool = await get_pool()
    app = await _find(pool, application_id)
    if app["status"] not in (rules.ROUND2_PENDING_SLOTS, rules.ROUND2_PENDING_CHOICE):
        raise errors.conflict("VERIFICATION_NOT_AT_ROUND2", "Chỉ đề xuất giờ được khi mentor đã qua vòng 1 và chưa chốt giờ")
    now = _now()
    if app["status"] == rules.ROUND2_PENDING_CHOICE and app["choice_deadline"] is not None and app["choice_deadline"] > now:
        raise errors.conflict("CHOICE_PENDING", "Đang chờ mentor chọn giờ; đề xuất lại được sau khi hết hạn chọn")
    starts = [s if s.tzinfo else s.replace(tzinfo=timezone.utc) for s in body.starts_at]
    error = round2_rules.validate_slots(starts, now, timedelta(minutes=config.VERIFICATION_SLOT_MIN_LEAD_MINUTES),
                                        config.VERIFICATION_ROUND2_SLOT_COUNT)
    if error:
        raise errors.bad_request(error, {"SLOTS_REQUIRED": "Cần ít nhất một khung giờ", "TOO_MANY_SLOTS":
                                         f"Tối đa {config.VERIFICATION_ROUND2_SLOT_COUNT} khung giờ", "DUPLICATE_SLOTS": "Có khung giờ bị trùng",
                                         "SLOT_TOO_SOON": f"Khung giờ phải cách hiện tại ít nhất {config.VERIFICATION_SLOT_MIN_LEAD_MINUTES:g} phút"}[error])
    conflicts = await r2repo.admin_conflicts(pool, admin.user_id, starts, 60)
    deadline = round2_rules.choice_deadline(now, config.VERIFICATION_SLOT_CHOICE_DAYS)
    async with pool.acquire() as conn, conn.transaction():
        await r2repo.expire_proposed(conn, application_id)
        await r2repo.insert_slots(conn, application_id, admin.user_id, starts)
        updated = await r2repo.to_pending_choice(conn, application_id, deadline)
        if updated is None:
            raise errors.conflict("VERIFICATION_NOT_AT_ROUND2", "Trạng thái đợt đã thay đổi")
    await mentoring.notify_user(
        app["mentor_id"], "MENTOR_INTERVIEW_SLOTS_PROPOSED", "Chọn giờ phỏng vấn vòng 2",
        f"Quản trị viên đề xuất {len(starts)} khung giờ phỏng vấn trực tiếp. Hãy chọn một khung trong {config.VERIFICATION_SLOT_CHOICE_DAYS:g} ngày.",
        "/interview")
    await audit.record(admin.user_id, "ADMIN", "VERIFICATION_SLOTS_PROPOSED", "VERIFICATION", str(application_id), None,
                       {"mentorId": str(app["mentor_id"]), "slots": [s.isoformat() for s in starts]})
    view = await verification.get_application(application_id)
    view.warnings = [f"Bạn đã có buổi phỏng vấn vòng 2 khác bắt đầu trong vòng 60 phút quanh {c.isoformat()}" for c in conflicts]
    return view


# ---------- mentor chọn / đổi giờ ----------

async def choose_slot(user: AuthUser, slot_id: UUID) -> VerificationStatusView:
    pool = await get_pool()
    slot = await r2repo.find_slot(pool, slot_id)
    if slot is None:
        raise errors.not_found("SLOT_NOT_FOUND", "Không tìm thấy khung giờ")
    app = await _find(pool, slot["application_id"])
    if app["mentor_id"] != user.user_id:
        raise errors.forbidden("Đây không phải đợt xác thực của bạn")
    now = _now()
    if app["status"] != rules.ROUND2_PENDING_CHOICE:
        raise errors.conflict("NOT_AWAITING_CHOICE", "Hiện không có khung giờ nào để chọn")
    if slot["status"] != "PROPOSED":
        raise errors.conflict("SLOT_NOT_AVAILABLE", "Khung giờ này không còn hiệu lực")
    if app["choice_deadline"] is not None and app["choice_deadline"] < now:
        raise errors.conflict("CHOICE_EXPIRED", "Đã quá hạn chọn giờ, vui lòng chờ quản trị viên đề xuất lại")
    if slot["starts_at"] < now:
        raise errors.conflict("SLOT_NOT_AVAILABLE", "Khung giờ này đã qua")
    async with pool.acquire() as conn, conn.transaction():
        chosen = await r2repo.choose_slot(conn, slot_id)
        if chosen is None:
            raise errors.conflict("SLOT_NOT_AVAILABLE", "Khung giờ này không còn hiệu lực")
        await r2repo.insert_interview(conn, app["id"], slot_id, chosen["proposed_by"], chosen["starts_at"], _room_name())
        if await r2repo.to_scheduled(conn, app["id"]) is None:
            raise errors.conflict("NOT_AWAITING_CHOICE", "Trạng thái đợt đã thay đổi")
    when = chosen["starts_at"].astimezone(timezone(timedelta(hours=7))).strftime("%H:%M %d/%m/%Y")
    await mentoring.notify_user(user.user_id, "MENTOR_INTERVIEW_SCHEDULED", "Đã chốt giờ phỏng vấn vòng 2",
                                f"Buổi phỏng vấn trực tiếp với quản trị viên: {when} (giờ Việt Nam). Phòng mở trước giờ bắt đầu "
                                f"{config.VERIFICATION_ROOM_OPENS_BEFORE_MINUTES:g} phút.", "/interview")
    if chosen["proposed_by"]:
        await mentoring.notify_user(chosen["proposed_by"], "MENTOR_INTERVIEW_SCHEDULED", "Mentor đã chọn giờ phỏng vấn",
                                    f"{await profile.display_name(user.user_id) or 'Mentor'} chọn {when} (giờ Việt Nam).",
                                    f"/admin/verification/{app['id']}")
    return await verification.status_view(user.user_id)


async def reschedule(user: AuthUser) -> VerificationStatusView:
    """Mentor xin đổi giờ: ≤ 2 lần mỗi đợt, báo trước ≥ 24 giờ (D9); đưa đợt về chờ admin đề xuất lại."""
    pool = await get_pool()
    app = await repo.open_for_mentor(pool, user.user_id)
    if app is None or app["status"] != rules.ROUND2_SCHEDULED:
        raise errors.conflict("NOT_SCHEDULED", "Bạn chưa có buổi phỏng vấn vòng 2 đã chốt giờ")
    interview = await r2repo.scheduled_of(pool, app["id"])
    error = round2_rules.reschedule_error(_now(), interview["scheduled_at"], app["reschedule_count"],
                                          config.VERIFICATION_ROUND2_MAX_RESCHEDULE,
                                          timedelta(hours=config.VERIFICATION_ROUND2_RESCHEDULE_NOTICE_HOURS))
    if error:
        raise errors.conflict(error, "Bạn đã đổi giờ đủ số lần cho phép" if error == "RESCHEDULE_LIMIT"
                              else f"Chỉ đổi giờ được khi còn ít nhất {config.VERIFICATION_ROUND2_RESCHEDULE_NOTICE_HOURS:g} giờ trước buổi phỏng vấn")
    async with pool.acquire() as conn, conn.transaction():
        if await r2repo.close_interview(conn, interview["id"], "RESCHEDULED") is None:
            raise errors.conflict("NOT_SCHEDULED", "Buổi phỏng vấn đã thay đổi")
        if await r2repo.back_to_pending_slots(conn, app["id"], rescheduled=True) is None:
            raise errors.conflict("NOT_SCHEDULED", "Trạng thái đợt đã thay đổi")
    await mentoring.notify_user(interview["admin_id"], "MENTOR_RESCHEDULE_REQUESTED", "Mentor xin đổi giờ phỏng vấn",
                                "Mentor đã huỷ khung giờ đã chốt. Hãy đề xuất khung giờ mới.", f"/admin/verification/{app['id']}")
    await audit.record(user.user_id, "MENTOR", "VERIFICATION_ROUND2_RESCHEDULED", "VERIFICATION", str(app["id"]),
                       {"scheduledAt": interview["scheduled_at"].isoformat()}, {"rescheduleCount": app["reschedule_count"] + 1})
    return await verification.status_view(user.user_id)


# ---------- phòng Jitsi ----------

async def room(user: AuthUser, application_id: UUID | None) -> RoomView:
    """Token vào phòng: admin (moderator) hoặc đúng mentor của đợt, trong khung giờ phòng mở. Lần đầu mỗi bên ghi nhật ký vào phòng."""
    pool = await get_pool()
    if user.is_admin:
        if application_id is None:
            raise errors.bad_request("APPLICATION_REQUIRED", "Admin cần chỉ định đợt xác thực (applicationId)")
        app = await _find(pool, application_id)
    else:
        app = await repo.open_for_mentor(pool, user.user_id)
        if app is None:
            raise errors.not_found("VERIFICATION_NOT_FOUND", "Bạn chưa có đợt xác thực nào")
    if app["status"] != rules.ROUND2_SCHEDULED:
        raise errors.conflict("ROOM_NOT_AVAILABLE", "Phòng phỏng vấn chỉ mở cho buổi vòng 2 đã chốt giờ")
    interview = await r2repo.scheduled_of(pool, app["id"])
    window = round2_rules.room_window(interview["scheduled_at"], _opens_before(), config.VERIFICATION_ROOM_MAX_HOURS)
    if not round2_rules.room_open(_now(), window):
        raise errors.conflict("ROOM_CLOSED", f"Phòng mở từ {window[0].isoformat()}", extra={"opensAt": window[0].isoformat()})
    await r2repo.record_join(pool, interview["id"], as_mentor=not user.is_admin)
    name = await profile.display_name(user.user_id) or ("Quản trị viên" if user.is_admin else "Mentor")
    token = await mentoring.issue_room_token(interview["room_name"], user.user_id, name, user.is_admin,
                                             window[0] - timedelta(minutes=1), window[1])
    return RoomView(provider=token.get("provider", "jitsi"), domain=token["domain"], room_name=interview["room_name"],
                    jwt=token["jwt"], opens_at=window[0], expires_at=window[1], moderator=user.is_admin)


async def dev_move_interview(application_id: UUID, minutes: float) -> ApplicationView:
    """Chỉ dev/e2e (không có ở APP_ENV=prod): dời giờ bắt đầu của buổi vòng 2 đang chờ tới bây giờ + `minutes` phút."""
    pool = await get_pool()
    await _find(pool, application_id)
    interview = await r2repo.scheduled_of(pool, application_id)
    if interview is None:
        raise errors.conflict("NOT_SCHEDULED", "Đợt không có buổi vòng 2 đang chờ diễn ra")
    await pool.execute("UPDATE verification_interviews SET scheduled_at = now() + $2::float8 * interval '1 minute' WHERE id = $1",
                       interview["id"], minutes)
    return await verification.get_application(application_id)


# ---------- admin: báo mentor vắng, kết luận ----------

async def mentor_absent(admin: AuthUser, application_id: UUID) -> ApplicationView:
    pool = await get_pool()
    app = await _find(pool, application_id)
    if app["status"] != rules.ROUND2_SCHEDULED:
        raise errors.conflict("NOT_SCHEDULED", "Đợt không có buổi vòng 2 đang chờ diễn ra")
    interview = await r2repo.scheduled_of(pool, application_id)
    error = round2_rules.absence_error(_now(), interview["scheduled_at"], interview["mentor_joined_at"],
                                       timedelta(minutes=config.VERIFICATION_ROOM_GRACE_MINUTES))
    if error:
        raise errors.conflict(error, "Mentor đã vào phòng theo nhật ký" if error == "MENTOR_ALREADY_JOINED"
                              else f"Chưa hết thời gian chờ {config.VERIFICATION_ROOM_GRACE_MINUTES:g} phút kể từ giờ bắt đầu")
    count = app["no_show_count"] + 1
    closes = round2_rules.no_show_closes(count, config.VERIFICATION_MAX_ATTEMPTS_PER_ROUND)
    async with pool.acquire() as conn, conn.transaction():
        if await r2repo.close_interview(conn, interview["id"], "MENTOR_NO_SHOW") is None:
            raise errors.conflict("NOT_SCHEDULED", "Buổi phỏng vấn đã thay đổi")
        if closes:
            updated = await repo.close(conn, application_id, rules.CLOSED, config.VERIFICATION_RETRY_DAYS)
            await conn.execute("UPDATE verification_applications SET no_show_count = $2 WHERE id = $1", application_id, count)
        else:
            updated = await r2repo.back_to_pending_slots(conn, application_id, no_show=True)
        if updated is None:
            raise errors.conflict("NOT_SCHEDULED", "Trạng thái đợt đã thay đổi")
    if closes:
        await profile.update_verification(app["mentor_id"], rules.profile_status(rules.CLOSED))
        await mentoring.notify_user(app["mentor_id"], "MENTOR_REJECTED", "Đợt xác thực đã đóng",
                                    f"Bạn vắng buổi phỏng vấn {count} lần. Bạn có thể bắt đầu đợt mới sau {config.VERIFICATION_RETRY_DAYS:g} ngày.",
                                    "/interview")
    else:
        await mentoring.notify_user(app["mentor_id"], "MENTOR_INTERVIEW_SCHEDULED", "Bạn đã vắng buổi phỏng vấn",
                                    "Buổi phỏng vấn đã bị tính vắng một lần. Quản trị viên sẽ đề xuất giờ mới; vắng thêm một lần nữa đợt sẽ bị đóng.",
                                    "/interview")
    await audit.record(admin.user_id, "ADMIN", "VERIFICATION_ROUND2_NO_SHOW", "VERIFICATION", str(application_id),
                       {"scheduledAt": interview["scheduled_at"].isoformat()},
                       {"noShowCount": count, "closed": closes, "mentorId": str(app["mentor_id"])})
    return await verification.get_application(application_id)


async def decision(admin: AuthUser, application_id: UUID, body: Round2DecisionInput) -> ApplicationView:
    """Kết luận sau vòng 2 (§6.3, §7): APPROVE | REJECT cần phiếu chấm đủ 5 tiêu chí; RESCHEDULE (admin hoãn) không tính lần của mentor."""
    pool = await get_pool()
    app = await _find(pool, application_id)
    if app["status"] != rules.ROUND2_SCHEDULED:
        raise errors.conflict("NOT_SCHEDULED", "Đợt không có buổi vòng 2 đang chờ diễn ra")
    interview = await r2repo.scheduled_of(pool, application_id)
    note = (body.note or "").strip() or None
    mentor_id = app["mentor_id"]

    if body.decision == "RESCHEDULE":
        async with pool.acquire() as conn, conn.transaction():
            if await r2repo.close_interview(conn, interview["id"], "RESCHEDULED") is None:
                raise errors.conflict("NOT_SCHEDULED", "Buổi phỏng vấn đã thay đổi")
            if await r2repo.back_to_pending_slots(conn, application_id) is None:
                raise errors.conflict("NOT_SCHEDULED", "Trạng thái đợt đã thay đổi")
        await mentoring.notify_user(mentor_id, "MENTOR_INTERVIEW_SLOTS_PROPOSED", "Buổi phỏng vấn được dời",
                                    "Quản trị viên cần dời buổi phỏng vấn (không tính vào số lần của bạn). Bạn sẽ nhận khung giờ mới." +
                                    (f" Lý do: {note}" if note else ""), "/interview")
        await audit.record(admin.user_id, "ADMIN", "VERIFICATION_ROUND2_RESCHEDULED_BY_ADMIN", "VERIFICATION", str(application_id),
                           {"status": app["status"]}, {"note": note, "mentorId": str(mentor_id)})
        return await verification.get_application(application_id)

    scores, notes = body.scores, body.score_notes or {}
    error = round2_rubric.scores_error(scores)
    if error:
        raise errors.bad_request(error, "Cần chấm đủ 5 tiêu chí (technical, depth, communication, mentoring, authenticity), mỗi tiêu chí 0–10"
                                 if error == "SCORES_REQUIRED" else "Điểm mỗi tiêu chí phải trong khoảng 0–10")
    missing = round2_rubric.evidence_missing(scores, notes)
    if missing:
        raise errors.AiError("SCORE_NOTE_REQUIRED", f"Tiêu chí chấm ≤ {round2_rubric.EVIDENCE_AT_OR_BELOW:g} hoặc ≥ "
                             f"{round2_rubric.EVIDENCE_AT_OR_ABOVE:g} cần lý do ít nhất {round2_rubric.MIN_NOTE} ký tự: {', '.join(missing)}",
                             status=400, extra={"criteria": missing})
    total = round2_rubric.total_score(scores)
    recommendation = round2_rubric.recommend(scores)
    if rubric.note_required(body.decision, recommendation) and len(note or "") < round2_rubric.MIN_NOTE:
        raise errors.bad_request("REVIEW_NOTE_REQUIRED", f"Quyết định khác khuyến nghị của phiếu chấm ({recommendation}) — "
                                 f"vui lòng ghi rõ lý do (ít nhất {round2_rubric.MIN_NOTE} ký tự)")
    approved = body.decision == "APPROVE"
    new_status = rules.APPROVED if approved else rules.REJECTED
    async with pool.acquire() as conn, conn.transaction():
        saved = await r2repo.save_decision(conn, interview["id"], scores, notes, total, recommendation, note)
        if saved is None:
            raise errors.conflict("NOT_SCHEDULED", "Buổi phỏng vấn đã được kết luận")
        updated = await r2repo.finish_application(conn, application_id, new_status, admin.user_id, note, config.VERIFICATION_RETRY_DAYS)
        if updated is None:
            raise errors.conflict("NOT_SCHEDULED", "Trạng thái đợt đã thay đổi")
    await profile.update_verification(mentor_id, rules.profile_status(new_status))
    suffix = "" if note is None else f" Nhận xét: {note}"
    if approved:
        notice = ("MENTOR_APPROVED", "Tài khoản mentor đã được kích hoạt",
                  "Chúc mừng! Bạn có thể chọn mức giá cho buổi mentoring, xuất hiện trong kết quả gợi ý và nhận mentee." + suffix)
    else:
        notice = ("MENTOR_REJECTED", "Hồ sơ mentor chưa được duyệt",
                  f"Bạn có thể cập nhật hồ sơ và xác thực lại sau {config.VERIFICATION_RETRY_DAYS:g} ngày." + suffix)
    await mentoring.notify_user(mentor_id, *notice, "/interview")
    await audit.record(admin.user_id, "ADMIN", f"VERIFICATION_ROUND2_{'APPROVED' if approved else 'REJECTED'}", "VERIFICATION",
                       str(application_id), {"status": app["status"]},
                       {"status": updated["status"], "decision": body.decision, "totalScore": total, "recommendation": recommendation,
                        "scores": scores, "note": note, "mentorId": str(mentor_id),
                        "agreesWithRecommendation": rubric.agrees(body.decision, recommendation)})
    return await verification.get_application(application_id)
