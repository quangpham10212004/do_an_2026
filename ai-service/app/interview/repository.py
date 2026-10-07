"""Truy cập bảng interviews / interview_turns (ai_db)."""
from uuid import UUID

import asyncpg

from app.db import Db
from app.interview.models import TurnEvaluation, TurnRecord

INTERVIEW_COLUMNS = """id, mentor_id, domain, skills, status, max_turns, current_turn, engine, overall_score,
                       summary, strengths, weaknesses, recommendation, reviewed_by, review_note,
                       created_at, completed_at, reviewed_at, self_answer_acknowledged"""


async def find(conn: Db, interview_id: UUID) -> asyncpg.Record | None:
    return await conn.fetchrow(f"SELECT {INTERVIEW_COLUMNS} FROM interviews WHERE id = $1", interview_id)


async def latest_for_mentor(conn: Db, mentor_id: UUID) -> asyncpg.Record | None:
    return await conn.fetchrow(
        f"SELECT {INTERVIEW_COLUMNS} FROM interviews WHERE mentor_id = $1 ORDER BY created_at DESC LIMIT 1", mentor_id)


async def list_all(conn: Db, status: str | None) -> list[asyncpg.Record]:
    if status:
        return await conn.fetch(
            f"SELECT {INTERVIEW_COLUMNS} FROM interviews WHERE status = $1 ORDER BY completed_at ASC", status)
    return await conn.fetch(f"SELECT {INTERVIEW_COLUMNS} FROM interviews ORDER BY created_at DESC")


async def count_by_status(conn: Db) -> dict[str, int]:
    rows = await conn.fetch("SELECT status, COUNT(*) AS total FROM interviews GROUP BY status")
    return {r["status"]: r["total"] for r in rows}


async def insert(conn: Db, mentor_id: UUID, domain: str, skills: list[str], max_turns: int,
                 engine: str) -> asyncpg.Record:
    """Chỉ gọi sau khi mentor đã xác nhận tự trả lời (US-22) => self_answer_acknowledged = true."""
    return await conn.fetchrow(
        f"""INSERT INTO interviews (mentor_id, domain, skills, max_turns, engine, self_answer_acknowledged)
            VALUES ($1, $2, $3, $4, $5, true) RETURNING {INTERVIEW_COLUMNS}""",
        mentor_id, domain, skills, max_turns, engine)


async def outcomes_since_unlock(conn: Db, mentor_id: UUID) -> list[asyncpg.Record]:
    """US-22 — các buổi của mentor tạo sau lần admin mở khoá gần nhất (chưa từng mở khoá => tất cả)."""
    return await conn.fetch(
        """SELECT status, created_at, reviewed_at FROM interviews i
            WHERE i.mentor_id = $1
              AND i.created_at > COALESCE((SELECT max(u.created_at) FROM interview_attempt_unlocks u
                                            WHERE u.mentor_id = $1), '-infinity'::timestamptz)
            ORDER BY i.created_at""", mentor_id)


async def insert_unlock(conn: Db, mentor_id: UUID, unlocked_by: UUID | None, note: str | None) -> None:
    await conn.execute(
        "INSERT INTO interview_attempt_unlocks (mentor_id, unlocked_by, note) VALUES ($1, $2, $3)",
        mentor_id, unlocked_by, note)


async def turns_of(conn: Db, interview_id: UUID) -> list[asyncpg.Record]:
    return await conn.fetch(
        "SELECT * FROM interview_turns WHERE interview_id = $1 ORDER BY turn_no ASC", interview_id)


async def insert_turn(conn: Db, interview_id: UUID, turn_no: int, topic: str, strategy: str,
                      question: str) -> None:
    await conn.execute(
        """INSERT INTO interview_turns (interview_id, turn_no, topic, strategy, question)
           VALUES ($1, $2, $3, $4, $5)""",
        interview_id, turn_no, topic, strategy, question)


async def answer_turn(conn: Db, turn_id: UUID, answer: str, evaluation: TurnEvaluation, flags: list[str],
                      engine: str, model: str | None, prompt_version: str, fallback_used: bool) -> bool:
    """Ghi câu trả lời + điểm rubric + thông tin tái lập; trả False nếu lượt đã được trả lời (chống double-submit)."""
    r = evaluation.rubric
    row = await conn.fetchrow(
        """UPDATE interview_turns SET answer = $2, score = $3, feedback = $4, answered_at = now(),
                  score_technical = $5, score_depth = $6, score_communication = $7, score_mentoring = $8,
                  flags = $9, engine = $10, model = $11, prompt_version = $12, fallback_used = $13
           WHERE id = $1 AND answer IS NULL RETURNING id""",
        turn_id, answer, evaluation.score, evaluation.feedback, r.technical, r.depth, r.communication, r.mentoring,
        flags, engine, model, prompt_version, fallback_used)
    return row is not None


async def set_current_turn(conn: Db, interview_id: UUID, turn_no: int) -> None:
    await conn.execute("UPDATE interviews SET current_turn = $2 WHERE id = $1", interview_id, turn_no)


async def complete(conn: Db, interview_id: UUID, overall_score: float, summary: str,
                   strengths: str, weaknesses: str, recommendation: str) -> asyncpg.Record:
    return await conn.fetchrow(
        f"""UPDATE interviews SET status = 'PENDING_REVIEW', overall_score = $2, summary = $3, strengths = $4,
                                  weaknesses = $5, recommendation = $6, completed_at = now()
            WHERE id = $1 RETURNING {INTERVIEW_COLUMNS}""",
        interview_id, overall_score, summary, strengths, weaknesses, recommendation)


async def review(conn: Db, interview_id: UUID, status: str, reviewed_by: UUID,
                 note: str | None) -> asyncpg.Record | None:
    """Chỉ duyệt được buổi đang PENDING_REVIEW — điều kiện nằm trong WHERE để tránh race.
    status: APPROVED | REJECTED | RETAKE_REQUESTED."""
    return await conn.fetchrow(
        f"""UPDATE interviews SET status = $2, reviewed_by = $3, review_note = $4, reviewed_at = now()
            WHERE id = $1 AND status = 'PENDING_REVIEW' RETURNING {INTERVIEW_COLUMNS}""",
        interview_id, status, reviewed_by, note)


def to_record(turn: asyncpg.Record) -> TurnRecord:
    """1 lượt trong DB → lịch sử hội thoại đưa vào engine."""
    return TurnRecord(turn_no=turn["turn_no"], topic=turn["topic"], strategy=turn["strategy"],
                      question=turn["question"], answer=turn["answer"],
                      score=None if turn["score"] is None else round(turn["score"], 1),
                      flags=list(turn["flags"] or []))


async def review_counts(conn: Db) -> list[asyncpg.Record]:
    """US-24 — số buổi đã được admin quyết định theo (quyết định, khuyến nghị AI)."""
    return await conn.fetch(
        """SELECT status, recommendation, COUNT(*) AS total FROM interviews
            WHERE status IN ('APPROVED', 'REJECTED', 'RETAKE_REQUESTED') AND reviewed_at IS NOT NULL
            GROUP BY status, recommendation""")
