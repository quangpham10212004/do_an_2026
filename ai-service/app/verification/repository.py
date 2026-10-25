"""Truy cập bảng verification_applications (ai_db) và các buổi vòng 1 của một đợt."""
from uuid import UUID

import asyncpg

from app.db import Db
from app.verification import rules

COLUMNS = """id, mentor_id, status, retake_count, reschedule_count, no_show_count, round1_decision, round1_reviewed_by,
             round1_reviewed_at, round1_note, reviewed_by, review_note, reviewed_at, closed_at, retry_after, created_at, choice_deadline"""
_OPEN = ", ".join(f"'{s}'" for s in rules.OPEN_STATUSES)
_FAILED = ", ".join(f"'{s}'" for s in rules.FAILED_ATTEMPT_STATUSES)


def _interview_columns() -> str:
    from app.interview.repository import INTERVIEW_COLUMNS  # tránh import vòng khi tải module
    return INTERVIEW_COLUMNS


async def find(db: Db, application_id: UUID) -> asyncpg.Record | None:
    return await db.fetchrow(f"SELECT {COLUMNS} FROM verification_applications WHERE id = $1", application_id)


async def open_for_mentor(db: Db, mentor_id: UUID) -> asyncpg.Record | None:
    return await db.fetchrow(
        f"SELECT {COLUMNS} FROM verification_applications WHERE mentor_id = $1 AND status IN ({_OPEN})", mentor_id)


async def latest_for_mentor(db: Db, mentor_id: UUID) -> asyncpg.Record | None:
    return await db.fetchrow(
        f"SELECT {COLUMNS} FROM verification_applications WHERE mentor_id = $1 ORDER BY created_at DESC LIMIT 1", mentor_id)


async def insert(db: Db, mentor_id: UUID) -> asyncpg.Record:
    """Đợt mới ở ROUND1; None nếu mentor đã có đợt mở (chỉ mục unique từng phần chặn race hai lần bấm bắt đầu)."""
    return await db.fetchrow(
        f"""INSERT INTO verification_applications (mentor_id) VALUES ($1)
            ON CONFLICT (mentor_id) WHERE status NOT IN ('APPROVED', 'REJECTED', 'CLOSED') DO NOTHING
            RETURNING {COLUMNS}""", mentor_id)


async def failed_attempts(db: Db, application_id: UUID) -> int:
    return await db.fetchval(
        f"SELECT COUNT(*) FROM interviews WHERE application_id = $1 AND status IN ({_FAILED})", application_id)


async def in_progress_interview(db: Db, application_id: UUID) -> asyncpg.Record | None:
    return await db.fetchrow(
        "SELECT id FROM interviews WHERE application_id = $1 AND status = 'IN_PROGRESS' LIMIT 1", application_id)


async def interviews_of(db: Db, application_id: UUID) -> list[asyncpg.Record]:
    return await db.fetch(
        f"SELECT {_interview_columns()} FROM interviews WHERE application_id = $1 ORDER BY created_at ASC", application_id)


async def pending_review_interview(db: Db, application_id: UUID) -> asyncpg.Record | None:
    return await db.fetchrow(
        f"""SELECT {_interview_columns()} FROM interviews
             WHERE application_id = $1 AND status = 'PENDING_REVIEW' ORDER BY created_at DESC LIMIT 1""", application_id)


async def set_status(db: Db, application_id: UUID, status: str, expected: str | None = None) -> asyncpg.Record | None:
    """Đổi trạng thái; `expected` = chỉ đổi khi đang ở trạng thái này (chống race). None nếu không khớp."""
    return await db.fetchrow(
        f"""UPDATE verification_applications SET status = $2 WHERE id = $1 AND ($3::text IS NULL OR status = $3)
            RETURNING {COLUMNS}""", application_id, status, expected)


async def close(db: Db, application_id: UUID, status: str, retry_days: float) -> asyncpg.Record | None:
    """Đóng đợt (REJECTED | CLOSED): ghi closed_at và retry_after = bây giờ + retry_days; không đóng lại đợt đã đóng."""
    return await db.fetchrow(
        f"""UPDATE verification_applications SET status = $2, closed_at = now(),
                   retry_after = now() + $3::float8 * interval '1 day'
             WHERE id = $1 AND status IN ({_OPEN}) RETURNING {COLUMNS}""", application_id, status, retry_days)


async def apply_round1_decision(db: Db, application_id: UUID, decision: str, admin_id: UUID, note: str | None,
                                new_status: str, retry_days: float, final: bool) -> asyncpg.Record | None:
    """
    Ghi quyết định duyệt vòng 1 (chỉ khi đợt đang ROUND1_REVIEW). new_status: ROUND1 (RETAKE, retake_count + 1),
    REJECTED (đóng đợt, chờ retry_days), APPROVED (final = true: duyệt luôn khi vòng 2 chưa bật) hoặc ROUND2_PENDING_SLOTS.
    """
    return await db.fetchrow(
        f"""UPDATE verification_applications SET
                   status = $4, round1_decision = $2, round1_reviewed_by = $3, round1_reviewed_at = now(), round1_note = $5,
                   retake_count = retake_count + CASE WHEN $2 = 'RETAKE' THEN 1 ELSE 0 END,
                   closed_at = CASE WHEN $4 = 'REJECTED' THEN now() ELSE closed_at END,
                   retry_after = CASE WHEN $4 = 'REJECTED' THEN now() + $6::float8 * interval '1 day' ELSE retry_after END,
                   reviewed_by = CASE WHEN $7 THEN $3 ELSE reviewed_by END,
                   review_note = CASE WHEN $7 THEN $5 ELSE review_note END,
                   reviewed_at = CASE WHEN $7 THEN now() ELSE reviewed_at END
             WHERE id = $1 AND status = 'ROUND1_REVIEW' RETURNING {COLUMNS}""",
        application_id, decision, admin_id, new_status, note, retry_days, final)


async def list_all(db: Db, status: str | None) -> list[asyncpg.Record]:
    if status:
        return await db.fetch(
            f"SELECT {COLUMNS} FROM verification_applications WHERE status = $1 ORDER BY created_at ASC", status)
    return await db.fetch(f"SELECT {COLUMNS} FROM verification_applications ORDER BY created_at DESC")


async def count_by_status(db: Db) -> dict[str, int]:
    rows = await db.fetch("SELECT status, COUNT(*) AS total FROM verification_applications GROUP BY status")
    return {r["status"]: r["total"] for r in rows}


async def interview_decision_counts(db: Db) -> list[asyncpg.Record]:
    """US-24 — số buổi vòng 1 đã được admin quyết định theo (kết quả buổi, khuyến nghị AI)."""
    return await db.fetch(
        """SELECT status, recommendation, COUNT(*) AS total FROM interviews
            WHERE status IN ('PASSED', 'REJECTED', 'RETAKE_REQUESTED') AND reviewed_at IS NOT NULL
            GROUP BY status, recommendation""")


async def interview_counts(db: Db) -> dict[str, int]:
    rows = await db.fetch("SELECT status, COUNT(*) AS total FROM interviews GROUP BY status")
    return {r["status"]: r["total"] for r in rows}


async def age(db: Db, application_id: UUID, days: float) -> None:
    """Chỉ dev/e2e: lùi các mốc thời gian của đợt `days` ngày (kiểm thử thời gian chờ 15 ngày)."""
    await db.execute(
        """UPDATE verification_applications SET
                  closed_at = closed_at - $2::float8 * interval '1 day',
                  retry_after = retry_after - $2::float8 * interval '1 day',
                  created_at = created_at - $2::float8 * interval '1 day'
            WHERE id = $1""", application_id, days)
