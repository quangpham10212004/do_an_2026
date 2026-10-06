"""Truy cập bảng enrichment_conversations / enrichment_messages (ai_db)."""
from uuid import UUID

import asyncpg

from app.db import Db
from app.enrichment.models import Exchange


async def insert(conn: Db, mentee_id: UUID, cv_id: UUID, max_turns: int, engine: str) -> asyncpg.Record:
    return await conn.fetchrow(
        """INSERT INTO enrichment_conversations (mentee_id, cv_id, max_turns, engine)
           VALUES ($1, $2, $3, $4) RETURNING *""",
        mentee_id, cv_id, max_turns, engine)


async def find(conn: Db, conversation_id: UUID) -> asyncpg.Record | None:
    return await conn.fetchrow("SELECT * FROM enrichment_conversations WHERE id = $1", conversation_id)


async def latest_for_mentee(conn: Db, mentee_id: UUID) -> asyncpg.Record | None:
    return await conn.fetchrow(
        "SELECT * FROM enrichment_conversations WHERE mentee_id = $1 ORDER BY created_at DESC LIMIT 1", mentee_id)


async def pending_profile_sync(conn: Db) -> list[asyncpg.Record]:
    return await conn.fetch(
        "SELECT * FROM enrichment_conversations WHERE status = 'COMPLETED' AND profile_synced = false")


async def mark_synced(conn: Db, conversation_id: UUID) -> None:
    await conn.execute("UPDATE enrichment_conversations SET profile_synced = true WHERE id = $1", conversation_id)


async def messages_of(conn: Db, conversation_id: UUID) -> list[asyncpg.Record]:
    return await conn.fetch(
        "SELECT * FROM enrichment_messages WHERE conversation_id = $1 ORDER BY turn_no ASC", conversation_id)


async def insert_message(conn: Db, conversation_id: UUID, turn_no: int, slot: str, question: str) -> None:
    await conn.execute(
        """INSERT INTO enrichment_messages (conversation_id, turn_no, slot, question)
           VALUES ($1, $2, $3, $4)""",
        conversation_id, turn_no, slot, question)


async def answer_message(conn: Db, message_id: UUID, answer: str) -> bool:
    """Ghi câu trả lời; trả False nếu lượt đã được trả lời (chống double-submit)."""
    row = await conn.fetchrow(
        """UPDATE enrichment_messages SET answer = $2, answered_at = now()
           WHERE id = $1 AND answer IS NULL RETURNING id""",
        message_id, answer)
    return row is not None


async def set_current_turn(conn: Db, conversation_id: UUID, turn_no: int) -> None:
    await conn.execute("UPDATE enrichment_conversations SET current_turn = $2 WHERE id = $1",
                       conversation_id, turn_no)


async def complete(conn: Db, conversation_id: UUID, enriched_goal: str) -> asyncpg.Record:
    return await conn.fetchrow(
        """UPDATE enrichment_conversations SET status = 'COMPLETED', enriched_goal = $2, completed_at = now()
           WHERE id = $1 RETURNING *""",
        conversation_id, enriched_goal)


def to_exchange(message: asyncpg.Record) -> Exchange:
    return Exchange(turn_no=message["turn_no"], slot=message["slot"], question=message["question"],
                    answer=message["answer"])


async def delete_for_cv(conn: Db, cv_id: UUID) -> None:
    """Xoá hội thoại gắn với CV (enrichment_messages xoá theo nhờ ON DELETE CASCADE)."""
    await conn.execute("DELETE FROM enrichment_conversations WHERE cv_id = $1", cv_id)
