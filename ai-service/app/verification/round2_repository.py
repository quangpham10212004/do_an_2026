"""Truy cập bảng verification_slots / verification_interviews (ai_db) và các chuyển trạng thái của đợt trong vòng 2."""
import json
from datetime import datetime
from uuid import UUID

import asyncpg

from app.db import Db
from app.verification import rules
from app.verification.repository import COLUMNS as APP_COLUMNS

SLOT_COLUMNS = "id, application_id, starts_at, status, proposed_by, created_at"
INTERVIEW_COLUMNS = """id, application_id, slot_id, admin_id, scheduled_at, status, room_name, mentor_joined_at, admin_joined_at,
                       ended_at, scores, score_notes, total_score, recommendation, note, created_at"""


def jsonb(value) -> dict | None:
    return json.loads(value) if isinstance(value, str) else value


# ---------- khung giờ ----------

async def expire_proposed(db: Db, application_id: UUID) -> None:
    await db.execute("UPDATE verification_slots SET status = 'EXPIRED' WHERE application_id = $1 AND status = 'PROPOSED'", application_id)


async def insert_slots(db: Db, application_id: UUID, admin_id: UUID, starts: list[datetime]) -> list[asyncpg.Record]:
    return [await db.fetchrow(
        f"INSERT INTO verification_slots (application_id, starts_at, proposed_by) VALUES ($1, $2, $3) RETURNING {SLOT_COLUMNS}",
        application_id, s, admin_id) for s in sorted(starts)]


async def slots_of(db: Db, application_id: UUID) -> list[asyncpg.Record]:
    return await db.fetch(
        f"SELECT {SLOT_COLUMNS} FROM verification_slots WHERE application_id = $1 ORDER BY created_at, starts_at", application_id)


async def proposed_slots(db: Db, application_id: UUID) -> list[asyncpg.Record]:
    return await db.fetch(
        f"SELECT {SLOT_COLUMNS} FROM verification_slots WHERE application_id = $1 AND status = 'PROPOSED' ORDER BY starts_at",
        application_id)


async def find_slot(db: Db, slot_id: UUID) -> asyncpg.Record | None:
    return await db.fetchrow(f"SELECT {SLOT_COLUMNS} FROM verification_slots WHERE id = $1", slot_id)


async def choose_slot(db: Db, slot_id: UUID) -> asyncpg.Record | None:
    """Chốt khung giờ (chỉ khi còn PROPOSED — chống hai request cùng lúc); các khung còn lại hết hiệu lực."""
    chosen = await db.fetchrow(
        f"UPDATE verification_slots SET status = 'CHOSEN' WHERE id = $1 AND status = 'PROPOSED' RETURNING {SLOT_COLUMNS}", slot_id)
    if chosen is not None:
        await db.execute("UPDATE verification_slots SET status = 'EXPIRED' WHERE application_id = $1 AND status = 'PROPOSED'",
                         chosen["application_id"])
    return chosen


# ---------- buổi vòng 2 ----------

async def insert_interview(db: Db, application_id: UUID, slot_id: UUID, admin_id: UUID, scheduled_at: datetime,
                           room_name: str) -> asyncpg.Record:
    return await db.fetchrow(
        f"""INSERT INTO verification_interviews (application_id, slot_id, admin_id, scheduled_at, room_name)
            VALUES ($1, $2, $3, $4, $5) RETURNING {INTERVIEW_COLUMNS}""",
        application_id, slot_id, admin_id, scheduled_at, room_name)


async def scheduled_of(db: Db, application_id: UUID) -> asyncpg.Record | None:
    return await db.fetchrow(
        f"SELECT {INTERVIEW_COLUMNS} FROM verification_interviews WHERE application_id = $1 AND status = 'SCHEDULED'", application_id)


async def interviews_of(db: Db, application_id: UUID) -> list[asyncpg.Record]:
    return await db.fetch(
        f"SELECT {INTERVIEW_COLUMNS} FROM verification_interviews WHERE application_id = $1 ORDER BY created_at", application_id)


async def close_interview(db: Db, interview_id: UUID, status: str) -> asyncpg.Record | None:
    """RESCHEDULED | MENTOR_NO_SHOW cho buổi đang SCHEDULED."""
    return await db.fetchrow(
        f"""UPDATE verification_interviews SET status = $2, ended_at = now()
             WHERE id = $1 AND status = 'SCHEDULED' RETURNING {INTERVIEW_COLUMNS}""", interview_id, status)


async def record_join(db: Db, interview_id: UUID, as_mentor: bool) -> None:
    """Nhật ký vào phòng: lần đầu mỗi bên lấy token. Căn cứ duy nhất xác định mentor vắng."""
    column = "mentor_joined_at" if as_mentor else "admin_joined_at"
    await db.execute(f"UPDATE verification_interviews SET {column} = COALESCE({column}, now()) WHERE id = $1", interview_id)


async def save_decision(db: Db, interview_id: UUID, scores: dict, notes: dict, total: float, recommendation: str,
                        note: str | None) -> asyncpg.Record | None:
    return await db.fetchrow(
        f"""UPDATE verification_interviews SET status = 'COMPLETED', ended_at = now(), scores = $2::jsonb, score_notes = $3::jsonb,
                   total_score = $4, recommendation = $5, note = $6
             WHERE id = $1 AND status = 'SCHEDULED' RETURNING {INTERVIEW_COLUMNS}""",
        interview_id, json.dumps(scores), json.dumps(notes), total, recommendation, note)


async def admin_conflicts(db: Db, admin_id: UUID, starts: list[datetime], window_minutes: float) -> list[datetime]:
    """Khung giờ đề xuất mà admin đã có buổi vòng 2 khác bắt đầu trong vòng `window_minutes` phút (chỉ cảnh báo, không chặn)."""
    found = []
    for s in starts:
        hit = await db.fetchval(
            """SELECT 1 FROM verification_interviews WHERE admin_id = $1 AND status = 'SCHEDULED'
                  AND abs(extract(epoch FROM (scheduled_at - $2::timestamptz))) < $3::float8 * 60 LIMIT 1""",
            admin_id, s, window_minutes)
        if hit:
            found.append(s)
    return found


async def ai_rubric_average(db: Db, application_id: UUID) -> dict[str, float] | None:
    """Trung bình điểm 4 tiêu chí của AI ở vòng 1 (buổi đã PASSED) để đặt cạnh điểm admin."""
    row = await db.fetchrow(
        """SELECT avg(t.score_technical) AS technical, avg(t.score_depth) AS depth,
                  avg(t.score_communication) AS communication, avg(t.score_mentoring) AS mentoring
             FROM interview_turns t JOIN interviews i ON i.id = t.interview_id
            WHERE i.application_id = $1 AND i.status = 'PASSED'""", application_id)
    if row is None or row["technical"] is None:
        return None
    return {k: float(row[k]) for k in ("technical", "depth", "communication", "mentoring")}


# ---------- đợt: chuyển trạng thái vòng 2 ----------

async def to_pending_choice(db: Db, application_id: UUID, deadline: datetime) -> asyncpg.Record | None:
    return await db.fetchrow(
        f"""UPDATE verification_applications SET status = $2, choice_deadline = $3
             WHERE id = $1 AND status IN ($4, $2) RETURNING {APP_COLUMNS}""",
        application_id, rules.ROUND2_PENDING_CHOICE, deadline, rules.ROUND2_PENDING_SLOTS)


async def to_scheduled(db: Db, application_id: UUID) -> asyncpg.Record | None:
    return await db.fetchrow(
        f"UPDATE verification_applications SET status = $2, choice_deadline = NULL WHERE id = $1 AND status = $3 RETURNING {APP_COLUMNS}",
        application_id, rules.ROUND2_SCHEDULED, rules.ROUND2_PENDING_CHOICE)


async def back_to_pending_slots(db: Db, application_id: UUID, rescheduled: bool = False, no_show: bool = False) -> asyncpg.Record | None:
    """Mentor đổi giờ / vắng / admin RESCHEDULE → admin đề xuất lại giờ; cộng bộ đếm tương ứng."""
    return await db.fetchrow(
        f"""UPDATE verification_applications SET status = $2, choice_deadline = NULL,
                   reschedule_count = reschedule_count + CASE WHEN $3 THEN 1 ELSE 0 END,
                   no_show_count = no_show_count + CASE WHEN $4 THEN 1 ELSE 0 END
             WHERE id = $1 AND status = $5 RETURNING {APP_COLUMNS}""",
        application_id, rules.ROUND2_PENDING_SLOTS, rescheduled, no_show, rules.ROUND2_SCHEDULED)


async def finish_application(db: Db, application_id: UUID, status: str, admin_id: UUID, note: str | None,
                             retry_days: float) -> asyncpg.Record | None:
    """Kết luận sau vòng 2: APPROVED | REJECTED (REJECTED đóng đợt, chờ retry_days ngày). Chỉ khi đang ROUND2_SCHEDULED."""
    return await db.fetchrow(
        f"""UPDATE verification_applications SET status = $2, reviewed_by = $3, review_note = $4, reviewed_at = now(),
                   closed_at = CASE WHEN $2 = 'REJECTED' THEN now() ELSE closed_at END,
                   retry_after = CASE WHEN $2 = 'REJECTED' THEN now() + $5::float8 * interval '1 day' ELSE retry_after END
             WHERE id = $1 AND status = $6 RETURNING {APP_COLUMNS}""",
        application_id, status, admin_id, note, retry_days, rules.ROUND2_SCHEDULED)
