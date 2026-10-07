"""Truy cập bảng cv_documents (ai_db)."""
import json
from uuid import UUID

import asyncpg

from app.cv.models import ConfirmedFields, ParsedCv
from app.db import Db


async def insert(conn: Db, user_id: UUID, file_name: str, storage_path: str, raw_text: str, parsed: ParsedCv,
                 engine: str, consent_external_ai: bool) -> asyncpg.Record:
    return await conn.fetchrow(
        """INSERT INTO cv_documents (user_id, file_name, storage_path, raw_text, parsed_json, engine,
                                     consent_external_ai)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *""",
        user_id, file_name, storage_path, raw_text, parsed.model_dump_json(by_alias=True), engine,
        consent_external_ai)


async def find(conn: Db, cv_id: UUID) -> asyncpg.Record | None:
    return await conn.fetchrow("SELECT * FROM cv_documents WHERE id = $1", cv_id)


def parsed_of(cv: asyncpg.Record) -> ParsedCv:
    return ParsedCv.model_validate(json.loads(cv["parsed_json"]))


def confirmed_of(cv: asyncpg.Record) -> ConfirmedFields | None:
    """US-20 — trường người dùng đã duyệt; None nếu chưa duyệt (kể cả CV tải trước Sprint 2)."""
    raw = cv["confirmed_fields"]
    return None if raw is None else ConfirmedFields.model_validate(json.loads(raw))


def chat_context_of(cv: asyncpg.Record) -> ParsedCv:
    """Ngữ cảnh CV cho chatbot: trường đã duyệt; hội thoại cũ (bắt đầu trước bước duyệt) dùng kết quả parse."""
    confirmed = confirmed_of(cv)
    return confirmed.as_parsed() if confirmed is not None else parsed_of(cv)


async def set_confirmed(conn: Db, cv_id: UUID, fields: ConfirmedFields) -> asyncpg.Record:
    return await conn.fetchrow(
        """UPDATE cv_documents SET confirmed_fields = $2, confirmed_at = now() WHERE id = $1 RETURNING *""",
        cv_id, fields.model_dump_json(by_alias=True))


async def latest_for_user(conn: Db, user_id: UUID) -> asyncpg.Record | None:
    return await conn.fetchrow(
        "SELECT * FROM cv_documents WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1", user_id)


async def list_for_user(conn: Db, user_id: UUID) -> list[asyncpg.Record]:
    return await conn.fetch(
        "SELECT id, file_name, created_at, consent_external_ai FROM cv_documents WHERE user_id = $1 ORDER BY created_at DESC", user_id)


async def delete(conn: Db, cv_id: UUID) -> None:
    await conn.execute("DELETE FROM cv_documents WHERE id = $1", cv_id)
