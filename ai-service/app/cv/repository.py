"""Truy cập bảng cv_documents (ai_db)."""
import json
from uuid import UUID

import asyncpg

from app.cv.models import ParsedCv
from app.db import Db


async def insert(conn: Db, user_id: UUID, file_name: str, storage_path: str, raw_text: str, parsed: ParsedCv,
                 engine: str) -> asyncpg.Record:
    return await conn.fetchrow(
        """INSERT INTO cv_documents (user_id, file_name, storage_path, raw_text, parsed_json, engine)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *""",
        user_id, file_name, storage_path, raw_text, parsed.model_dump_json(by_alias=True), engine)


async def find(conn: Db, cv_id: UUID) -> asyncpg.Record | None:
    return await conn.fetchrow("SELECT * FROM cv_documents WHERE id = $1", cv_id)


def parsed_of(cv: asyncpg.Record) -> ParsedCv:
    return ParsedCv.model_validate(json.loads(cv["parsed_json"]))


async def list_for_user(conn: Db, user_id: UUID) -> list[asyncpg.Record]:
    return await conn.fetch(
        "SELECT id, file_name, created_at FROM cv_documents WHERE user_id = $1 ORDER BY created_at DESC", user_id)


async def delete(conn: Db, cv_id: UUID) -> None:
    await conn.execute("DELETE FROM cv_documents WHERE id = $1", cv_id)
