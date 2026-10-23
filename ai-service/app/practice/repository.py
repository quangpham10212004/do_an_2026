"""Truy cập bảng practice_interviews (ai_db). transcript / result là JSONB, ghi dạng chuỗi JSON (pool không đăng ký codec)."""
import json
from datetime import datetime
from uuid import UUID

import asyncpg

from app.db import Db

COLUMNS = """id, mentee_id, interview_type, level, target_role, target_company, status, topics, transcript, result,
             overall_score, engine, consent_external_ai, created_at, completed_at"""
USED_STATUSES = ("COMPLETED", "ABANDONED")


async def find(conn: Db, practice_id: UUID) -> asyncpg.Record | None:
    return await conn.fetchrow(f"SELECT {COLUMNS} FROM practice_interviews WHERE id = $1", practice_id)


async def in_progress(conn: Db, mentee_id: UUID) -> asyncpg.Record | None:
    return await conn.fetchrow(
        f"SELECT {COLUMNS} FROM practice_interviews WHERE mentee_id = $1 AND status = 'IN_PROGRESS'", mentee_id)


async def used_count(conn: Db, mentee_id: UUID) -> int:
    """Buổi đã dùng lượt miễn phí: COMPLETED hoặc ABANDONED."""
    return await conn.fetchval(
        "SELECT COUNT(*) FROM practice_interviews WHERE mentee_id = $1 AND status = ANY($2::text[])",
        mentee_id, list(USED_STATUSES))


async def list_for(conn: Db, mentee_id: UUID) -> list[asyncpg.Record]:
    return await conn.fetch(
        f"SELECT {COLUMNS} FROM practice_interviews WHERE mentee_id = $1 ORDER BY created_at DESC", mentee_id)


async def insert(conn: Db, mentee_id: UUID, interview_type: str, level: str, target_role: str,
                 target_company: str | None, topics: list[str], engine: str) -> asyncpg.Record | None:
    """None khi mentee đã có buổi IN_PROGRESS (unique index một phần — bấm bắt đầu hai lần cùng lúc)."""
    try:
        return await conn.fetchrow(
            f"""INSERT INTO practice_interviews (mentee_id, interview_type, level, target_role, target_company, topics,
                                                 engine, consent_external_ai)
                VALUES ($1, $2, $3, $4, $5, $6, $7, true) RETURNING {COLUMNS}""",
            mentee_id, interview_type, level, target_role, target_company, topics, engine)
    except asyncpg.UniqueViolationError:
        return None


async def abandon_stale(conn: Db, before: datetime, mentee_id: UUID | None = None) -> list[asyncpg.Record]:
    """Buổi IN_PROGRESS bắt đầu trước `before` mà chưa nộp bản ghi => ABANDONED (đã dùng lượt miễn phí)."""
    return await conn.fetch(
        """UPDATE practice_interviews SET status = 'ABANDONED'
            WHERE status = 'IN_PROGRESS' AND created_at < $1 AND ($2::uuid IS NULL OR mentee_id = $2)
        RETURNING id, mentee_id""", before, mentee_id)


async def complete(conn: Db, practice_id: UUID, transcript: list[dict], result: dict,
                   overall_score: float, engine: str) -> asyncpg.Record | None:
    """Chỉ hoàn thành được buổi đang IN_PROGRESS (điều kiện trong WHERE chống gửi hai lần); None = đã kết thúc."""
    return await conn.fetchrow(
        f"""UPDATE practice_interviews SET status = 'COMPLETED', transcript = $2::jsonb, result = $3::jsonb,
                   overall_score = $4, engine = $5, completed_at = now()
             WHERE id = $1 AND status = 'IN_PROGRESS' RETURNING {COLUMNS}""",
        practice_id, json.dumps(transcript, ensure_ascii=False), json.dumps(result, ensure_ascii=False),
        overall_score, engine)


def load_json(value):
    return None if value is None else json.loads(value) if isinstance(value, str) else value
