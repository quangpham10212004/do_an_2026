"""Truy cập bảng interview_videos (ai_db)."""
import json
from uuid import UUID

import asyncpg

from app import config
from app.db import Db

COLUMNS = """id, interview_id, mentor_id, consent_video, storage_dir, video_mime, audio_mime, chunks, audio_chunks, size_bytes,
             duration_s, gap_detected, gap_total_seconds, flags, server_transcript, transcript_diff, transcript_check,
             finished_at, processing_started_at, processed_at, created_at, expires_at, deleted_at, deleted_by"""


def _jsonb(value) -> list:
    return json.loads(value) if isinstance(value, str) else (value or [])


def chunk_list(video: asyncpg.Record, kind: str) -> list[dict]:
    return _jsonb(video["chunks" if kind == "video" else "audio_chunks"])


async def insert(db: Db, interview_id: UUID, mentor_id: UUID, consent_video: bool) -> asyncpg.Record:
    return await db.fetchrow(
        f"""INSERT INTO interview_videos (interview_id, mentor_id, consent_video, storage_dir, expires_at)
            VALUES ($1, $2, $3, $4, now() + $5::float8 * interval '1 day')
            ON CONFLICT (interview_id) DO UPDATE SET consent_video = EXCLUDED.consent_video RETURNING {COLUMNS}""",
        interview_id, mentor_id, consent_video, str(interview_id), config.VIDEO_RETENTION_DAYS)


async def find_by_interview(db: Db, interview_id: UUID) -> asyncpg.Record | None:
    return await db.fetchrow(f"SELECT {COLUMNS} FROM interview_videos WHERE interview_id = $1", interview_id)


async def add_chunk(db: Db, interview_id: UUID, kind: str, meta: dict, mime: str | None) -> asyncpg.Record | None:
    """Ghi metadata một đoạn (cùng n thì thay — tải lại idempotent). None nếu video đã kết thúc hoặc không tồn tại."""
    column = "chunks" if kind == "video" else "audio_chunks"
    mime_column = "video_mime" if kind == "video" else "audio_mime"
    return await db.fetchrow(
        f"""UPDATE interview_videos SET
                   {column} = (SELECT COALESCE(jsonb_agg(e), '[]'::jsonb) FROM jsonb_array_elements({column}) e
                                WHERE (e->>'n')::int <> $2) || $3::jsonb,
                   {mime_column} = COALESCE({mime_column}, $4),
                   size_bytes = size_bytes + $5
             WHERE interview_id = $1 AND finished_at IS NULL AND deleted_at IS NULL RETURNING {COLUMNS}""",
        interview_id, meta["n"], json.dumps(meta), mime, meta["size"])


async def finish(db: Db, interview_id: UUID, size_bytes: int, duration_s: float | None, gap_detected: bool,
                 gap_total_seconds: float) -> asyncpg.Record | None:
    """Chốt video (chỉ một lần): ghi kích thước thật sau khi ghép, cờ khoảng trống, hạn lưu tính từ lúc kết thúc."""
    return await db.fetchrow(
        f"""UPDATE interview_videos SET finished_at = now(), size_bytes = $2, duration_s = $3, gap_detected = $4,
                   gap_total_seconds = $5, expires_at = now() + $6::float8 * interval '1 day'
             WHERE interview_id = $1 AND finished_at IS NULL AND deleted_at IS NULL RETURNING {COLUMNS}""",
        interview_id, size_bytes, duration_s, gap_detected, gap_total_seconds, config.VIDEO_RETENTION_DAYS)


async def claim_processing(db: Db, interview_id: UUID) -> asyncpg.Record | None:
    """Giành quyền xử lý (chép lời lại + chốt cờ) đúng một lần; None nếu đã có người nhận hoặc chưa kết thúc."""
    return await db.fetchrow(
        f"""UPDATE interview_videos SET processing_started_at = now()
             WHERE interview_id = $1 AND finished_at IS NOT NULL AND processing_started_at IS NULL RETURNING {COLUMNS}""",
        interview_id)


async def save_result(db: Db, interview_id: UUID, server_transcript: str | None, diff: float | None, check: str,
                      flags: list[str]) -> asyncpg.Record:
    return await db.fetchrow(
        f"""UPDATE interview_videos SET server_transcript = $2, transcript_diff = $3, transcript_check = $4, flags = $5,
                   processed_at = now() WHERE interview_id = $1 RETURNING {COLUMNS}""",
        interview_id, server_transcript, diff, check, flags)


async def mark_deleted(db: Db, interview_id: UUID, by: UUID | None) -> asyncpg.Record | None:
    return await db.fetchrow(
        f"""UPDATE interview_videos SET deleted_at = now(), deleted_by = $2
             WHERE interview_id = $1 AND deleted_at IS NULL RETURNING {COLUMNS}""", interview_id, by)


async def expired(db: Db) -> list[asyncpg.Record]:
    return await db.fetch(
        f"SELECT {COLUMNS} FROM interview_videos WHERE deleted_at IS NULL AND expires_at < now()")


async def unfinished_after_submit(db: Db, grace_minutes: float) -> list[asyncpg.Record]:
    """Buổi đã nộp bản chép lời (PENDING_REVIEW) nhưng mentor chưa chốt video quá thời gian chờ."""
    return await db.fetch(
        f"""SELECT {', '.join('v.' + c.strip() for c in COLUMNS.split(','))} FROM interview_videos v
              JOIN interviews i ON i.id = v.interview_id
             WHERE v.finished_at IS NULL AND v.deleted_at IS NULL AND i.status = 'PENDING_REVIEW'
               AND i.completed_at < now() - $1::float8 * interval '1 minute'""", grace_minutes)
