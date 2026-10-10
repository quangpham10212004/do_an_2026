"""
CV Parsing + Chatbot enrichment (FR-8.1 → FR-8.5).

upload CV (PDF, kèm đồng ý gửi AI bên ngoài — US-19) → trích xuất text + parse có cấu trúc (KHÔNG ghi gì
vào hồ sơ) → người dùng duyệt/sửa/bỏ từng trường (US-20, confirmed_fields) → mở hội thoại {maxTurns} lượt,
câu hỏi dựa trên trường đã duyệt → tổng hợp goal NHÁP (US-21, chưa đổi hồ sơ) → người dùng "Dùng mục tiêu
này" (có thể sửa) hoặc "Bỏ qua" → chỉ khi xác nhận mới gửi sang profile-service (cập nhật goal, gộp kỹ năng
đã duyệt, sinh lại embedding; lỗi thì job thử lại).

ai-service sở hữu cả luồng lẫn dữ liệu: file CV, CV đã parse và hội thoại nằm ở ai-service.
Lời gọi engine luôn thực hiện NGOÀI transaction.
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

import httpx

from app import config, errors, storage
from app.clients import mentoring, profile
from app.cv import engine as cv_engine
from app.cv import repository as cv_repo
from app.db import get_pool
from app.enrichment import engine as enrichment_engine
from app.enrichment import repository as repo
from app.cv.models import ConfirmedFields
from app.enrichment.models import Exchange, MenteeContext
from app.enrichment.views import (ConversationView, CvSummaryView, CvUploadResult, CvView, conversation_view,
                                  cv_view)
from app.security import AuthUser

log = logging.getLogger(__name__)

MAX_TURNS = config.ENRICHMENT_MAX_TURNS
# Job thử lại bỏ qua goal vừa xác nhận trong khoảng này (request xác nhận đang tự gửi) để không gửi trùng.
SYNC_GRACE_SECONDS = 60


def cv_file_url(cv_id: UUID) -> str:
    return f"/api/ai/cv/{cv_id}/file"


async def parse_and_store(owner_id: UUID, file_name: str, content: bytes, consent_external_ai: bool) -> CvView:
    """
    FR-8.1 + FR-8.2 — upload & parse CV (dùng chung cho mentor để điền nhanh hồ sơ).
    US-19: `consent_external_ai` = false => chỉ parse bằng rule-based, không gửi gì tới DeepSeek.
    """
    if not content:
        raise errors.bad_request("FILE_REQUIRED", "Vui lòng chọn file CV")
    if len(content) > config.MAX_CV_BYTES:
        raise errors.AiError("FILE_TOO_LARGE", "File CV không được vượt quá 5MB", status=413)

    # Parse trước khi lưu file: file không hợp lệ (INVALID_FILE_TYPE, CV_NO_TEXT...) thì không lưu gì cả.
    result = await cv_engine.parse(None, content, consent_external_ai)
    path = storage.save(owner_id, content)
    pool = await get_pool()
    cv = await cv_repo.insert(pool, owner_id, file_name, path, result.raw_text, result.parsed, result.engine,
                              consent_external_ai)
    return cv_view(cv)


async def upload_for_mentee(user: AuthUser, mentee_id: UUID, file_name: str, content: bytes,
                            consent_external_ai: bool) -> CvUploadResult:
    """
    FR-8.1 + FR-8.2 — mentee upload CV. Chỉ parse và lưu CV; chatbot CHƯA bắt đầu (`conversation = null`)
    cho tới khi mentee duyệt thông tin trích xuất (US-20: confirm_fields → start_conversation).
    """
    if not user.is_admin and not user.is_internal and user.user_id != mentee_id:
        raise errors.forbidden("Bạn chỉ có thể tải CV cho chính mình")
    if await profile.find_mentee(mentee_id) is None:
        raise errors.bad_request("PROFILE_REQUIRED",
                                 "Hãy tạo hồ sơ nghề nghiệp (lĩnh vực, mục tiêu) trước khi tải CV")
    return CvUploadResult(cv=await parse_and_store(mentee_id, file_name, content, consent_external_ai))


async def confirm_fields(user: AuthUser, cv_id: UUID, fields: ConfirmedFields) -> CvView:
    """
    US-20 — lưu các trường người dùng đã xem lại/sửa/bỏ (chỉ chủ CV). Không ghi gì sang hồ sơ: kỹ năng đã duyệt
    chỉ tới profile-service khi người dùng xác nhận mục tiêu (US-21).
    """
    pool = await get_pool()
    cv = await _own_cv(pool, user, cv_id)
    return cv_view(await cv_repo.set_confirmed(pool, cv["id"], fields))


async def start_conversation(user: AuthUser, cv_id: UUID) -> CvUploadResult:
    """
    FR-8.3 — bắt đầu chatbot enrichment cho CV đã duyệt (chủ CV, MENTEE). Mỗi CV một hội thoại: gọi lại trả về
    hội thoại đã có. Câu hỏi đầu dùng trường đã duyệt; engine theo đồng ý của CV (US-19).
    """
    pool = await get_pool()
    cv = await _own_cv(pool, user, cv_id)
    existing = await repo.find_for_cv(pool, cv_id)
    if existing is not None:
        messages = await repo.messages_of(pool, existing["id"])
        return CvUploadResult(cv=cv_view(cv), conversation=conversation_view(existing, messages, cv))
    confirmed = cv_repo.confirmed_of(cv)
    if confirmed is None:
        raise errors.conflict("CV_NOT_REVIEWED",
                              "Hãy xem lại và xác nhận thông tin trích xuất từ CV trước khi trò chuyện")
    mentee = await profile.find_mentee(cv["user_id"])
    if mentee is None:
        raise errors.bad_request("PROFILE_REQUIRED",
                                 "Hãy tạo hồ sơ nghề nghiệp (lĩnh vực, mục tiêu) trước khi trò chuyện")

    ctx = _context(mentee, confirmed.as_parsed(), MAX_TURNS)
    first = await enrichment_engine.next_question(cv["engine"], ctx, [], cv["consent_external_ai"])

    async with pool.acquire() as conn, conn.transaction():
        conversation = await repo.insert_if_absent(conn, cv["user_id"], cv_id, MAX_TURNS, first.engine)
        if conversation is not None:
            await repo.insert_message(conn, conversation["id"], 1, first.question.slot, first.question.question)
    conversation = conversation or await repo.find_for_cv(pool, cv_id)  # bấm hai lần cùng lúc: lấy bản đã có
    messages = await repo.messages_of(pool, conversation["id"])
    return CvUploadResult(cv=cv_view(cv), conversation=conversation_view(conversation, messages, cv))


# US-45 (PRD-CV-3) — câu bị bỏ qua được đưa cho engine như câu "không biết" (không có thông tin mới).
SKIPPED_ANSWER_FOR_ENGINE = "Tôi không biết / bỏ qua câu này."


async def answer(user: AuthUser, conversation_id: UUID, text: str, skipped: bool = False) -> ConversationView:
    """FR-8.3 → FR-8.4 — mentee trả lời (hoặc bỏ qua — US-45); sau lượt cuối tổng hợp goal NHÁP (không đổi hồ sơ — US-21)."""
    text = "" if skipped else text.strip()
    if not skipped and not text:
        raise errors.bad_request("ANSWER_REQUIRED", "Hãy nhập câu trả lời, hoặc bấm “Bỏ qua”")
    pool = await get_pool()
    conversation = await _find(pool, conversation_id)
    if conversation["mentee_id"] != user.user_id:
        raise errors.forbidden("Đây không phải hội thoại của bạn")
    if conversation["status"] != "IN_PROGRESS":
        raise errors.conflict("CONVERSATION_COMPLETED", "Hội thoại đã kết thúc")

    messages = await repo.messages_of(pool, conversation_id)
    current = next((m for m in messages if m["answer"] is None), None)
    if current is None:
        raise errors.conflict("NO_OPEN_QUESTION", "Không có câu hỏi đang chờ trả lời")

    mentee = await profile.find_mentee(conversation["mentee_id"])
    if mentee is None:
        raise errors.not_found("PROFILE_NOT_FOUND", "Không tìm thấy hồ sơ mentee")
    cv = await cv_repo.find(pool, conversation["cv_id"])
    ctx = _context(mentee, cv_repo.chat_context_of(cv), conversation["max_turns"])
    allow_external = cv["consent_external_ai"]  # US-19: kiểm tra lại ở mỗi lượt

    history = [repo.to_exchange(m) for m in messages if m["answer"] is not None]
    history.append(Exchange(turn_no=current["turn_no"], slot=current["slot"], question=current["question"],
                            answer=SKIPPED_ANSWER_FOR_ENGINE if skipped else text))
    is_last = current["turn_no"] >= conversation["max_turns"]

    # Gọi engine TRƯỚC khi mở transaction.
    next_question = None if is_last else await enrichment_engine.next_question(
        conversation["engine"], ctx, history, allow_external)
    goal = (await enrichment_engine.summarize_goal(conversation["engine"], ctx, history, allow_external)
            ).enriched_goal if is_last else None

    async with pool.acquire() as conn, conn.transaction():
        written = await repo.answer_message(conn, current["id"], text, skipped)
        if not written:
            raise errors.conflict("ALREADY_ANSWERED", "Câu hỏi này đã được trả lời")
        if is_last:
            await repo.complete(conn, conversation_id, goal)
        else:
            next_turn = current["turn_no"] + 1
            await repo.insert_message(conn, conversation_id, next_turn, next_question.question.slot,
                                      next_question.question.question)
            await repo.set_current_turn(conn, conversation_id, next_turn)

    return await _view(pool, conversation_id)


async def confirm_goal(user: AuthUser, conversation_id: UUID, goal: str, skills: list[str] | None = None) -> ConversationView:
    """
    US-21 — "Dùng mục tiêu này": goal (bản nháp hoặc bản người dùng sửa) được ghi nhận rồi đồng bộ sang hồ sơ
    cùng các kỹ năng đã duyệt. Idempotent: goal đã xác nhận thì trả về trạng thái hiện tại, không gửi lại.
    """
    pool = await get_pool()
    conversation = await _owned_completed(pool, user, conversation_id)
    if conversation["goal_status"] == "DISCARDED":
        raise errors.conflict("GOAL_DISCARDED", "Mục tiêu này đã bị bỏ qua — hãy tải CV mới để làm lại")
    if conversation["goal_status"] == "DRAFT":
        # US-45 (PRD-CV-5) — chỉ thêm các kỹ năng gợi ý mentee đã chọn (None = mọi kỹ năng đã duyệt, như trước).
        cv = await cv_repo.find(pool, conversation["cv_id"])
        chosen = pick_skills(_confirmed_skills(cv), skills)
        if await repo.decide_goal(pool, conversation_id, "CONFIRMED", goal, chosen) is not None:
            await sync_profile(conversation_id)  # chỉ request chuyển DRAFT → CONFIRMED mới gửi
    return await _view(pool, conversation_id)


async def discard_goal(user: AuthUser, conversation_id: UUID) -> ConversationView:
    """US-21 — "Bỏ qua": bỏ bản nháp, không gửi gì sang hồ sơ. Gọi lại khi đã bỏ: trả về trạng thái hiện tại."""
    pool = await get_pool()
    conversation = await _owned_completed(pool, user, conversation_id)
    if conversation["goal_status"] == "DRAFT":
        await repo.decide_goal(pool, conversation_id, "DISCARDED", None)
    conversation = await _find(pool, conversation_id)
    if conversation["goal_status"] == "CONFIRMED":
        raise errors.conflict("GOAL_ALREADY_CONFIRMED", "Mục tiêu đã được dùng cho hồ sơ, không thể bỏ qua")
    return await _view(pool, conversation_id)


async def sync_profile(conversation_id: UUID) -> None:
    """
    Gửi goal ĐÃ XÁC NHẬN + kỹ năng đã duyệt sang profile-service; lỗi sẽ được job thử lại. Không làm gì nếu goal
    chưa được xác nhận hoặc đã gửi rồi.
    """
    pool = await get_pool()
    conversation = await _find(pool, conversation_id)
    if conversation["goal_status"] != "CONFIRMED" or conversation["profile_synced"]:
        return
    cv = await cv_repo.find(pool, conversation["cv_id"])
    try:
        await profile.apply_enrichment(conversation["mentee_id"], conversation["confirmed_goal"],
                                       list(conversation["added_skills"] or []), cv_file_url(cv["id"]))
    except (httpx.HTTPError, errors.AiError) as e:
        log.warning("Could not sync enrichment %s to profile-service: %s", conversation_id, e)
        return
    if not await repo.mark_synced(pool, conversation_id):
        return
    await mentoring.notify_user(conversation["mentee_id"], "PROFILE_ENRICHED", "Hồ sơ đã được cập nhật",
                                "Mục tiêu học tập của bạn đã được làm rõ. Hãy thử tìm mentor phù hợp ngay!",
                                "/matching")


async def retry_profile_sync_forever() -> None:
    """Định kỳ thử lại các hội thoại đã xong nhưng chưa đẩy được sang profile-service."""
    while True:
        await asyncio.sleep(config.PROFILE_SYNC_RETRY_SECONDS)
        try:
            pool = await get_pool()
            for conversation in await repo.pending_profile_sync(pool, SYNC_GRACE_SECONDS):
                await sync_profile(conversation["id"])
        except asyncio.CancelledError:
            raise
        except Exception as e:  # job nền: không bao giờ được làm chết service
            log.warning("Profile sync retry job failed: %s", e)


async def get(user: AuthUser, conversation_id: UUID) -> ConversationView:
    pool = await get_pool()
    conversation = await _find(pool, conversation_id)
    user.require_access(conversation["mentee_id"])
    return conversation_view(conversation, await repo.messages_of(pool, conversation_id))


async def latest(user: AuthUser, mentee_id: UUID) -> CvUploadResult | None:
    """CV mới nhất của mentee + hội thoại của CV đó (null nếu chưa duyệt/chưa bắt đầu chatbot)."""
    user.require_access(mentee_id)
    pool = await get_pool()
    cv = await cv_repo.latest_for_user(pool, mentee_id)
    if cv is None:
        return None
    conversation = await repo.find_for_cv(pool, cv["id"])
    view = None if conversation is None else conversation_view(conversation,
                                                               await repo.messages_of(pool, conversation["id"]), cv)
    return CvUploadResult(cv=cv_view(cv), conversation=view)


async def cv_file(user: AuthUser, cv_id: UUID) -> tuple[str, bytes]:
    pool = await get_pool()
    cv = await cv_repo.find(pool, cv_id)
    if cv is None:
        raise errors.not_found("CV_NOT_FOUND", "Không tìm thấy CV")
    # Chủ CV, admin, service nội bộ; mentor chỉ được tải CV của mentee đang gửi yêu cầu cho
    # mình (PENDING) hoặc đang được mình hướng dẫn (ACCEPTED) — hỏi mentoring-service, lỗi => từ chối.
    if not user.is_admin and not user.is_internal and cv["user_id"] != user.user_id:
        if user.role != "MENTOR" or not await mentoring.is_related(user.user_id, cv["user_id"]):
            raise errors.forbidden("Bạn không có quyền tải CV này")
    if cv["purged_at"] is not None:
        raise errors.AiError("CV_PURGED", "File CV đã bị xoá theo chính sách lưu giữ 12 tháng", status=410)
    return cv["file_name"], storage.read(cv["storage_path"])


async def my_cvs(user: AuthUser) -> list[CvSummaryView]:
    if user.user_id is None:  # service nội bộ không sở hữu CV
        return []
    pool = await get_pool()
    return [CvSummaryView(id=r["id"], file_name=r["file_name"], uploaded_at=r["created_at"],
                          file_url=cv_file_url(r["id"]), consent_external_ai=r["consent_external_ai"],
                          purged_at=r["purged_at"], delete_after=r["created_at"] + CV_RETENTION,
                          added_skills=list(r["added_skills"] or []))
            for r in await cv_repo.list_for_user(pool, user.user_id)]


async def delete_cv(user: AuthUser, cv_id: UUID, remove_skills: bool = False) -> None:
    """
    Xoá CV theo yêu cầu của chủ CV hoặc ADMIN (chính sách dữ liệu CV): hội thoại enrichment
    → dòng cv_documents trong 1 transaction (đúng thứ tự FK), sau đó mới xoá file và gỡ
    tham chiếu ở profile-service — không gọi mạng/đĩa bên trong transaction.
    """
    pool = await get_pool()
    cv = await cv_repo.find(pool, cv_id)
    if cv is None:
        raise errors.not_found("CV_NOT_FOUND", "Không tìm thấy CV")
    if not user.is_admin and cv["user_id"] != user.user_id:
        raise errors.forbidden("Chỉ chủ CV hoặc quản trị viên được xoá CV")

    # US-45 (PRD-CV-6) — "Gỡ cả kỹ năng đã thêm từ CV này": đọc trước khi xoá hội thoại.
    conversation = await repo.find_for_cv(pool, cv_id)
    added = list(conversation["added_skills"] or []) if conversation is not None else []

    async with pool.acquire() as conn, conn.transaction():
        await repo.delete_for_cv(conn, cv_id)
        await cv_repo.delete(conn, cv_id)

    if remove_skills and added:
        try:
            await profile.remove_skills(cv["user_id"], added)
        except httpx.HTTPError as e:
            log.warning("Could not remove CV skills of %s in profile-service: %s", cv["user_id"], e)

    try:
        if not storage.delete(cv["storage_path"]):
            log.info("CV file %s was already missing", cv["storage_path"])
    except (OSError, errors.AiError) as e:  # dòng DB đã xoá — file mồ côi chỉ cần ghi log
        log.warning("Could not delete CV file %s: %s", cv["storage_path"], e)

    try:
        await profile.clear_cv_file(cv["user_id"], cv_file_url(cv_id))
    except httpx.HTTPError as e:
        log.warning("Could not clear cvFileUrl of %s in profile-service: %s", cv["user_id"], e)


# US-45 (PRD-CV-6) — file CV + văn bản gốc giữ 12 tháng sau khi tải lên.
CV_RETENTION = timedelta(days=365)


async def purge_expired_cvs(now: datetime | None = None) -> int:
    """
    Xoá file + văn bản gốc của CV quá 12 tháng; kết quả parse chỉ giữ khi người dùng đã xác nhận (confirmed_fields).
    Ghi DB trước (purged_at), xoá file sau — không gọi đĩa/mạng trong transaction. Trả số CV đã xử lý.
    """
    now = now or datetime.now(timezone.utc)
    pool = await get_pool()
    rows = await cv_repo.purge_before(pool, now - CV_RETENTION)
    for r in rows:
        try:
            storage.delete(r["storage_path"])
        except (OSError, errors.AiError) as e:
            log.warning("Could not delete expired CV file %s: %s", r["storage_path"], e)
        try:
            await profile.clear_cv_file(r["user_id"], cv_file_url(r["id"]))
        except httpx.HTTPError as e:
            log.warning("Could not clear cvFileUrl of %s: %s", r["user_id"], e)
    if rows:
        log.info("Purged %d CVs older than 12 months", len(rows))
    return len(rows)


async def purge_expired_cvs_forever(interval_seconds: float = 6 * 3600) -> None:
    while True:
        try:
            await purge_expired_cvs()
        except Exception as e:  # noqa: BLE001 — job nền không được chết
            log.warning("CV retention sweep failed: %s", e)
        await asyncio.sleep(interval_seconds)


async def _owned_completed(db, user: AuthUser, conversation_id: UUID):
    conversation = await _find(db, conversation_id)
    if conversation["mentee_id"] != user.user_id:
        raise errors.forbidden("Đây không phải hội thoại của bạn")
    if conversation["status"] != "COMPLETED":
        raise errors.conflict("CONVERSATION_NOT_COMPLETED", "Hội thoại chưa kết thúc nên chưa có mục tiêu")
    return conversation


async def _own_cv(db, user: AuthUser, cv_id: UUID):
    cv = await cv_repo.find(db, cv_id)
    if cv is None:
        raise errors.not_found("CV_NOT_FOUND", "Không tìm thấy CV")
    if cv["user_id"] != user.user_id:
        raise errors.forbidden("Chỉ chủ CV được duyệt thông tin và trò chuyện với chatbot")
    return cv


def pick_skills(suggested: list[str], chosen: list[str] | None) -> list[str]:
    """
    US-45 (PRD-CV-5) — kỹ năng thêm vào hồ sơ: None = mọi kỹ năng gợi ý (tương thích client cũ); ngược lại phải là tập
    con của kỹ năng gợi ý (không phân biệt hoa thường, giữ cách viết trong CV, bỏ trùng).
    """
    if chosen is None:
        return list(suggested)
    by_key = {s.lower(): s for s in suggested}
    out: list[str] = []
    for c in chosen:
        key = (c or "").strip().lower()
        if key not in by_key:
            raise errors.bad_request("INVALID_SKILLS", f"Kỹ năng không có trong gợi ý từ CV: {c}")
        if by_key[key] not in out:
            out.append(by_key[key])
    return out


def _confirmed_skills(cv) -> list[str]:
    """Chỉ kỹ năng người dùng đã duyệt (US-20); CV chưa duyệt => không gửi kỹ năng nào."""
    confirmed = cv_repo.confirmed_of(cv)
    return [] if confirmed is None else confirmed.skills


def _context(mentee: dict, parsed, max_turns: int) -> MenteeContext:
    return MenteeContext(domain=mentee["domain"], current_level=mentee.get("currentLevel"),
                         current_goal=mentee.get("goal"), cv=parsed, max_turns=max_turns)


async def _find(db, conversation_id: UUID):
    conversation = await repo.find(db, conversation_id)
    if conversation is None:
        raise errors.not_found("CONVERSATION_NOT_FOUND", "Không tìm thấy hội thoại")
    return conversation


async def _view(db, conversation_id: UUID) -> ConversationView:
    conversation = await _find(db, conversation_id)
    return conversation_view(conversation, await repo.messages_of(db, conversation_id),
                             await cv_repo.find(db, conversation["cv_id"]))
