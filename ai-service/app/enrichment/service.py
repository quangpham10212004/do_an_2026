"""
CV Parsing + Chatbot enrichment (FR-8.1 → FR-8.5).

upload CV (PDF) → trích xuất text + parse có cấu trúc → mở hội thoại {maxTurns} lượt,
câu hỏi dựa trên CV → tổng hợp goal → gửi sang profile-service (cập nhật goal, gộp kỹ năng
từ CV, sinh lại embedding).

ai-service sở hữu cả luồng lẫn dữ liệu: file CV, CV đã parse và hội thoại nằm ở ai-service.
Lời gọi engine luôn thực hiện NGOÀI transaction.
"""
import asyncio
import logging
from uuid import UUID

import httpx

from app import config, errors, storage
from app.clients import mentoring, profile
from app.cv import engine as cv_engine
from app.cv import repository as cv_repo
from app.db import get_pool
from app.enrichment import engine as enrichment_engine
from app.enrichment import repository as repo
from app.enrichment.models import Exchange, MenteeContext
from app.enrichment.views import (ConversationView, CvSummaryView, CvUploadResult, CvView, conversation_view,
                                  cv_view)
from app.security import AuthUser

log = logging.getLogger(__name__)

MAX_TURNS = config.ENRICHMENT_MAX_TURNS


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
    """FR-8.1 → FR-8.3 — mentee upload CV và bắt đầu chatbot enrichment."""
    if not user.is_admin and not user.is_internal and user.user_id != mentee_id:
        raise errors.forbidden("Bạn chỉ có thể tải CV cho chính mình")
    mentee = await profile.find_mentee(mentee_id)
    if mentee is None:
        raise errors.bad_request("PROFILE_REQUIRED",
                                 "Hãy tạo hồ sơ nghề nghiệp (lĩnh vực, mục tiêu) trước khi tải CV")

    cv = await parse_and_store(mentee_id, file_name, content, consent_external_ai)
    ctx = _context(mentee, cv.parsed, MAX_TURNS)
    first = await enrichment_engine.next_question(cv.engine, ctx, [], cv.consent_external_ai)

    pool = await get_pool()
    async with pool.acquire() as conn, conn.transaction():
        conversation = await repo.insert(conn, mentee_id, cv.id, MAX_TURNS, first.engine)
        await repo.insert_message(conn, conversation["id"], 1, first.question.slot, first.question.question)
    messages = await repo.messages_of(pool, conversation["id"])
    return CvUploadResult(cv=cv, conversation=conversation_view(conversation, messages))


async def answer(user: AuthUser, conversation_id: UUID, text: str) -> ConversationView:
    """FR-8.3 → FR-8.5 — mentee trả lời; sau lượt cuối tổng hợp goal và cập nhật profile."""
    text = text.strip()
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
    ctx = _context(mentee, cv_repo.parsed_of(cv), conversation["max_turns"])
    allow_external = cv["consent_external_ai"]  # US-19: kiểm tra lại ở mỗi lượt

    history = [repo.to_exchange(m) for m in messages if m["answer"] is not None]
    history.append(Exchange(turn_no=current["turn_no"], slot=current["slot"], question=current["question"],
                            answer=text))
    is_last = current["turn_no"] >= conversation["max_turns"]

    # Gọi engine TRƯỚC khi mở transaction.
    next_question = None if is_last else await enrichment_engine.next_question(
        conversation["engine"], ctx, history, allow_external)
    goal = (await enrichment_engine.summarize_goal(conversation["engine"], ctx, history, allow_external)
            ).enriched_goal if is_last else None

    async with pool.acquire() as conn, conn.transaction():
        written = await repo.answer_message(conn, current["id"], text)
        if not written:
            raise errors.conflict("ALREADY_ANSWERED", "Câu hỏi này đã được trả lời")
        if is_last:
            await repo.complete(conn, conversation_id, goal)
        else:
            next_turn = current["turn_no"] + 1
            await repo.insert_message(conn, conversation_id, next_turn, next_question.question.slot,
                                      next_question.question.question)
            await repo.set_current_turn(conn, conversation_id, next_turn)

    if is_last:
        await sync_profile(conversation_id)
    return await _view(pool, conversation_id)


async def sync_profile(conversation_id: UUID) -> None:
    """Gửi goal đã tổng hợp sang profile-service; lỗi sẽ được job thử lại."""
    pool = await get_pool()
    conversation = await _find(pool, conversation_id)
    cv = await cv_repo.find(pool, conversation["cv_id"])
    try:
        await profile.apply_enrichment(conversation["mentee_id"], conversation["enriched_goal"],
                                       cv_repo.parsed_of(cv).skills, cv_file_url(cv["id"]))
    except (httpx.HTTPError, errors.AiError) as e:
        log.warning("Could not sync enrichment %s to profile-service: %s", conversation_id, e)
        return
    await repo.mark_synced(pool, conversation_id)
    await mentoring.notify_user(conversation["mentee_id"], "PROFILE_ENRICHED", "Hồ sơ đã được cập nhật",
                                "Mục tiêu học tập của bạn đã được làm rõ. Hãy thử tìm mentor phù hợp ngay!",
                                "/matching")


async def retry_profile_sync_forever() -> None:
    """Định kỳ thử lại các hội thoại đã xong nhưng chưa đẩy được sang profile-service."""
    while True:
        await asyncio.sleep(config.PROFILE_SYNC_RETRY_SECONDS)
        try:
            pool = await get_pool()
            for conversation in await repo.pending_profile_sync(pool):
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
    user.require_access(mentee_id)
    pool = await get_pool()
    conversation = await repo.latest_for_mentee(pool, mentee_id)
    if conversation is None:
        return None
    cv = await cv_repo.find(pool, conversation["cv_id"])
    messages = await repo.messages_of(pool, conversation["id"])
    return CvUploadResult(cv=cv_view(cv), conversation=conversation_view(conversation, messages))


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
    return cv["file_name"], storage.read(cv["storage_path"])


async def my_cvs(user: AuthUser) -> list[CvSummaryView]:
    if user.user_id is None:  # service nội bộ không sở hữu CV
        return []
    pool = await get_pool()
    return [CvSummaryView(id=r["id"], file_name=r["file_name"], uploaded_at=r["created_at"],
                          file_url=cv_file_url(r["id"]), consent_external_ai=r["consent_external_ai"])
            for r in await cv_repo.list_for_user(pool, user.user_id)]


async def delete_cv(user: AuthUser, cv_id: UUID) -> None:
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

    async with pool.acquire() as conn, conn.transaction():
        await repo.delete_for_cv(conn, cv_id)
        await cv_repo.delete(conn, cv_id)

    try:
        if not storage.delete(cv["storage_path"]):
            log.info("CV file %s was already missing", cv["storage_path"])
    except (OSError, errors.AiError) as e:  # dòng DB đã xoá — file mồ côi chỉ cần ghi log
        log.warning("Could not delete CV file %s: %s", cv["storage_path"], e)

    try:
        await profile.clear_cv_file(cv["user_id"], cv_file_url(cv_id))
    except httpx.HTTPError as e:
        log.warning("Could not clear cvFileUrl of %s in profile-service: %s", cv["user_id"], e)


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
    return conversation_view(conversation, await repo.messages_of(db, conversation_id))
