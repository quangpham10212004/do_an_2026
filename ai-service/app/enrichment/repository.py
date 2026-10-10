"""Truy cập bảng enrichment_conversations / enrichment_messages (ai_db)."""
from uuid import UUID

import asyncpg

from app.db import Db
from app.enrichment.models import Exchange


async def insert_if_absent(conn: Db, mentee_id: UUID, cv_id: UUID, max_turns: int,
                           engine: str) -> asyncpg.Record | None:
    """Tạo hội thoại cho CV; None nếu CV đã có hội thoại (mỗi CV tối đa 1 — uq_enrichment_conversations_cv)."""
    return await conn.fetchrow(
        """INSERT INTO enrichment_conversations (mentee_id, cv_id, max_turns, engine)
           VALUES ($1, $2, $3, $4) ON CONFLICT (cv_id) DO NOTHING RETURNING *""",
        mentee_id, cv_id, max_turns, engine)


async def find_for_cv(conn: Db, cv_id: UUID) -> asyncpg.Record | None:
    return await conn.fetchrow("SELECT * FROM enrichment_conversations WHERE cv_id = $1", cv_id)


async def find(conn: Db, conversation_id: UUID) -> asyncpg.Record | None:
    return await conn.fetchrow("SELECT * FROM enrichment_conversations WHERE id = $1", conversation_id)


async def pending_profile_sync(conn: Db, min_age_seconds: float) -> list[asyncpg.Record]:
    """
    US-21 — chỉ goal người dùng ĐÃ xác nhận mà chưa gửi được. Bỏ qua xác nhận quá mới (request xác nhận đang
    tự gửi) để job không gửi trùng.
    """
    return await conn.fetch(
        """SELECT * FROM enrichment_conversations
           WHERE goal_status = 'CONFIRMED' AND profile_synced = false
             AND goal_decided_at < now() - make_interval(secs => $1)""",
        min_age_seconds)


async def mark_synced(conn: Db, conversation_id: UUID) -> bool:
    """True nếu lần gọi này chuyển profile_synced false → true."""
    row = await conn.fetchrow(
        "UPDATE enrichment_conversations SET profile_synced = true WHERE id = $1 AND profile_synced = false "
        "RETURNING id", conversation_id)
    return row is not None


async def decide_goal(conn: Db, conversation_id: UUID, status: str, goal: str | None,
                      added_skills: list[str] | None = None) -> asyncpg.Record | None:
    """
    US-21 — DRAFT → CONFIRMED (kèm goal người dùng chọn/sửa) hoặc DISCARDED, nguyên tử: chỉ một request thắng,
    nên xác nhận hai lần (kể cả đồng thời) chỉ đồng bộ một lần. None nếu goal không còn ở DRAFT.
    """
    return await conn.fetchrow(
        """UPDATE enrichment_conversations SET goal_status = $2, confirmed_goal = $3, goal_decided_at = now(),
                  added_skills = COALESCE($4, added_skills)
           WHERE id = $1 AND goal_status = 'DRAFT' RETURNING *""",
        conversation_id, status, goal, added_skills)


async def messages_of(conn: Db, conversation_id: UUID) -> list[asyncpg.Record]:
    return await conn.fetch(
        "SELECT * FROM enrichment_messages WHERE conversation_id = $1 ORDER BY turn_no ASC", conversation_id)


async def insert_message(conn: Db, conversation_id: UUID, turn_no: int, slot: str, question: str) -> None:
    await conn.execute(
        """INSERT INTO enrichment_messages (conversation_id, turn_no, slot, question)
           VALUES ($1, $2, $3, $4)""",
        conversation_id, turn_no, slot, question)


async def answer_message(conn: Db, message_id: UUID, answer: str, skipped: bool = False) -> bool:
    """Ghi câu trả lời (skipped = mentee bỏ qua — US-45); trả False nếu lượt đã được trả lời (chống double-submit)."""
    row = await conn.fetchrow(
        """UPDATE enrichment_messages SET answer = $2, skipped = $3, answered_at = now()
           WHERE id = $1 AND answer IS NULL RETURNING id""",
        message_id, answer, skipped)
    return row is not None


async def set_current_turn(conn: Db, conversation_id: UUID, turn_no: int) -> None:
    await conn.execute("UPDATE enrichment_conversations SET current_turn = $2 WHERE id = $1",
                       conversation_id, turn_no)


async def complete(conn: Db, conversation_id: UUID, enriched_goal: str) -> asyncpg.Record:
    return await conn.fetchrow(
        """UPDATE enrichment_conversations
           SET status = 'COMPLETED', enriched_goal = $2, goal_status = 'DRAFT', completed_at = now()
           WHERE id = $1 RETURNING *""",
        conversation_id, enriched_goal)


def to_exchange(message: asyncpg.Record) -> Exchange:
    # US-45 — câu bị bỏ qua đưa cho engine như "không biết"
    answer = "Tôi không biết / bỏ qua câu này." if message.get("skipped") else message["answer"]
    return Exchange(turn_no=message["turn_no"], slot=message["slot"], question=message["question"], answer=answer)


async def delete_for_cv(conn: Db, cv_id: UUID) -> None:
    """Xoá hội thoại gắn với CV (enrichment_messages xoá theo nhờ ON DELETE CASCADE)."""
    await conn.execute("DELETE FROM enrichment_conversations WHERE cv_id = $1", cv_id)
