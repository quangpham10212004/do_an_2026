"""Phía quản trị viên của phỏng vấn AI trực tiếp: hàng đợi ca chưa rõ ràng, chi tiết, quyết định, phát video."""
import asyncio
import json
import logging
from datetime import timedelta
from uuid import UUID

import jwt
from fastapi.responses import StreamingResponse

from app import config, errors
from app.clients import audit, mentoring
from app.db import get_pool
from app.security import AuthUser
from app.verification import live, media_storage
from app.verification import live_service as service
from app.verification.video_service import _parse_range

log = logging.getLogger(__name__)
SELECT_RESULTS = """SELECT r.*, t.details AS track FROM mentor_live_results r
                    JOIN mentor_assessment_tracks t ON t.id=r.track_id WHERE t.cancelled_at IS NULL"""


def status_of(row) -> str:
    if row["decided_by"] != "ADMIN":
        return "UNCLEAR"
    return "APPROVED" if row["outcome"] == "PASSED" else "REJECTED"


def _item(row, at) -> dict:
    details, track = json.loads(row["details"]), json.loads(row["track"])
    status = status_of(row)
    return dict(id=row["id"], name=track.get("name", ""), email=track.get("email", ""), years=track.get("years", 0),
                domain=details["domain"], totalScore=float(row["total_score"]),
                recommendation=details["recommendation"], confidence=details["confidence"],
                waitingSince=row["submitted_at"].isoformat(),
                overdue=status == "UNCLEAR" and at - row["submitted_at"] >= timedelta(days=live.OVERDUE_DAYS),
                status=status)


async def queue(filter_: str, query: str = "") -> dict:
    pool = await get_pool()
    rows = await pool.fetch(SELECT_RESULTS + " AND (r.decided_by IS NULL OR r.decided_by='ADMIN')")
    at = live.now()
    month = at.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    items = [(row, _item(row, at)) for row in rows]
    unclear = [i for _, i in items if i["status"] == "UNCLEAR"]
    stats = dict(
        unclear=len(unclear), overdue=sum(i["overdue"] for i in unclear),
        approvedThisMonth=sum(1 for r, i in items if i["status"] == "APPROVED" and r["decided_at"] >= month),
        rejectedThisMonth=sum(1 for r, i in items if i["status"] == "REJECTED" and r["decided_at"] >= month))
    counts = dict(UNCLEAR=len(unclear), DECIDED=len(items) - len(unclear))
    search = query.strip().casefold()
    selected = [i for _, i in items
                if (i["status"] == "UNCLEAR") == (filter_ == "UNCLEAR")
                and (not search or search in f"{i['name']} {i['email']}".casefold())]
    selected.sort(key=lambda i: i["waitingSince"], reverse=filter_ == "DECIDED")
    return dict(stats=stats, counts=counts, items=selected)


def _video_url(answer, admin: AuthUser, at) -> str | None:
    if not answer["media_bytes"] or answer["media_deleted_at"] or (answer["keep_until"] and answer["keep_until"] <= at):
        return None
    token = jwt.encode(dict(typ="live-answer-video", vid=str(answer["id"]), sub=str(admin.user_id),
                            exp=at + timedelta(seconds=config.VIDEO_PLAY_TOKEN_SECONDS)),
                       config.JWT_SECRET, algorithm="HS256")
    return f"/api/ai/verification/answer-videos/{answer['id']}/stream?token={token}"


async def detail(admin: AuthUser, result_id: UUID) -> dict:
    pool = await get_pool()
    row = await pool.fetchrow(SELECT_RESULTS + " AND r.id=$1", result_id)
    if row is None or (row["decided_by"] == "AI"):
        raise errors.not_found("VERIFICATION_REVIEW_NOT_FOUND", "Không tìm thấy hồ sơ cần xem xét.")
    details, track = json.loads(row["details"]), json.loads(row["track"])
    answers = await pool.fetch("SELECT * FROM mentor_live_answers WHERE interview_id=$1 ORDER BY position",
                               row["interview_id"])
    attempt = await pool.fetchval("SELECT count(*) FROM mentor_live_results WHERE track_id=$1 AND submitted_at<=$2",
                                  row["track_id"], row["submitted_at"])
    at = live.now()
    views = []
    for a in answers:
        evaluation = json.loads(a["evaluation"])
        views.append(dict(id=a["id"], topic=a["topic"], question=a["question"], transcript=a["transcript"],
                          durationSeconds=a["duration_seconds"], videoUrl=_video_url(a, admin, at),
                          note=evaluation.get("feedback")))
    if any(v["videoUrl"] for v in views):
        await audit.record(admin.user_id, "ADMIN", "VIDEO_VIEWED", "MENTOR_VERIFICATION", str(result_id), None,
                           {"mentorId": str(row["mentor_id"])})
    status = status_of(row)
    keep = [a["keep_until"] for a in answers if a["keep_until"] and not a["media_deleted_at"]]
    decision = None
    if status != "UNCLEAR":
        decision = dict(decision="APPROVE" if status == "APPROVED" else "REJECT", note=row["admin_note"] or "",
                        decidedAt=row["decided_at"].isoformat())
    return dict(
        id=row["id"], name=track.get("name", ""), email=track.get("email", ""), years=track.get("years", 0),
        domain=details["domain"], mentorProfileHref=f"/mentors/{row['mentor_id']}", status=status,
        totalScore=float(row["total_score"]), passScore=live.PASS_SCORE, criteria=details["criteria"],
        ai=dict(recommendation=details["recommendation"], confidence=details["confidence"], reason=details["reason"]),
        answers=views, durationLabel=live.duration_label(sum(a["duration_seconds"] for a in answers)),
        submittedAt=row["submitted_at"].isoformat(), attempt=f"Lần {attempt}",
        keepUntil=max(keep).isoformat() if keep else None, decision=decision)


async def decide(admin: AuthUser, result_id: UUID, decision: str, note: str, reviewed_video: bool) -> None:
    note = note.strip()
    if decision not in {"APPROVE", "REJECT"}:
        raise errors.AiError("INVALID_VERIFICATION_DECISION", "Quyết định không hợp lệ.", status=422)
    if decision == "REJECT" and len(note) < 10:
        raise errors.AiError("INVALID_VERIFICATION_DECISION", "Từ chối cần ghi rõ lý do (ít nhất 10 ký tự).", status=422)
    pool = await get_pool()
    async with pool.acquire() as conn, conn.transaction():
        row = await conn.fetchrow("SELECT * FROM mentor_live_results WHERE id=$1 FOR UPDATE", result_id)
        if row is None:
            raise errors.not_found("VERIFICATION_REVIEW_NOT_FOUND", "Không tìm thấy hồ sơ cần xem xét.")
        approved = decision == "APPROVE"
        if row["decided_by"] is not None:
            if row["decided_by"] == "ADMIN" and (row["outcome"] == "PASSED") == approved:
                return
            raise service.conflict("Hồ sơ này đã có quyết định.", "VERIFICATION_ALREADY_DECIDED")
        has_video = await conn.fetchval("""SELECT EXISTS(SELECT 1 FROM mentor_live_answers WHERE interview_id=$1
                                           AND media_bytes IS NOT NULL AND media_deleted_at IS NULL)""",
                                        row["interview_id"])
        if has_video and not reviewed_video:
            raise errors.AiError("INVALID_VERIFICATION_DECISION", "Cần xác nhận đã xem video trước khi quyết định.",
                                 status=422)
        track = await service.find_track(conn, row["track_id"], lock=True)
        state = json.loads(track["details"])
        details = json.loads(row["details"])
        at = live.now()
        retry = None if approved else live.retry_at(at)
        weakest = sorted(details["criteria"], key=lambda c: c["score"])[:3]
        details["improvements"] = [] if approved else [live.IMPROVEMENTS[c["key"]] for c in weakest]
        details["summary"] = live.SUMMARIES["PASSED" if approved else "FAILED"]
        await conn.execute("""UPDATE mentor_live_results SET outcome=$2, decided_by='ADMIN', decided_at=$3,
                              admin_note=$4, retry_at=$5, details=$6 WHERE id=$1""",
                           result_id, "PASSED" if approved else "FAILED", at, note or None, retry, json.dumps(details))
        state.update(stage="PASSED" if approved else "FAILED", adminNote=note or None)
        if retry:
            state["retryAt"] = retry.isoformat()
        else:
            state.pop("retryAt", None)
        await service.save_track(conn, track, state, sync=True)
    await service.try_sync(row["track_id"])
    await audit.record(admin.user_id, "ADMIN", f"VERIFICATION_{decision}", "MENTOR_VERIFICATION", str(result_id), None,
                       {"mentorId": str(row["mentor_id"]), "reviewedVideo": reviewed_video, "note": note})
    title = "Lĩnh vực đã được xác thực" if approved else "Hồ sơ xác thực chưa được duyệt"
    await mentoring.notify_user(row["mentor_id"], "VERIFICATION_DECISION", title, note or title, "/interview")


async def stream(answer_id: UUID, token: str, range_header: str | None) -> StreamingResponse:
    try:
        claims = jwt.decode(token, config.JWT_SECRET, algorithms=["HS256"], options={"require": ["sub", "exp"]})
        if claims.get("typ") != "live-answer-video" or claims.get("vid") != str(answer_id):
            raise jwt.InvalidTokenError()
    except jwt.InvalidTokenError:
        raise errors.AiError("UNAUTHORIZED", "Liên kết xem video không hợp lệ hoặc đã hết hạn.", status=401) from None
    pool = await get_pool()
    answer = await pool.fetchrow("""SELECT * FROM mentor_live_answers WHERE id=$1 AND media_deleted_at IS NULL
                                    AND media_bytes IS NOT NULL AND (keep_until IS NULL OR keep_until>now())""", answer_id)
    directory = f"live/{answer['interview_id']}" if answer else ""
    size = media_storage.file_size(directory, str(answer_id)) if answer else None
    if not size:
        raise errors.not_found("VIDEO_NOT_FOUND", "Không tìm thấy video.")
    matched = _parse_range(range_header, size)
    start, end = matched if matched else (0, size - 1)
    headers = {"Accept-Ranges": "bytes", "Content-Length": str(end - start + 1), "Cache-Control": "private, no-store"}
    if matched:
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    return StreamingResponse(media_storage.iter_range(directory, str(answer_id), start, end),
                             status_code=206 if matched else 200, media_type=answer["media_mime"] or "video/webm",
                             headers=headers)


async def purge(pool) -> None:
    """Xoá video quá hạn lưu (VIDEO_RETENTION_DAYS) và đóng các buổi dở quá hạn tiếp tục."""
    due = await pool.fetch("""SELECT id, interview_id FROM mentor_live_answers WHERE media_deleted_at IS NULL
                              AND media_bytes IS NOT NULL AND keep_until<=now() LIMIT 50""")
    for row in due:
        media_storage.delete_blob(f"live/{row['interview_id']}", str(row["id"]))
        await pool.execute("UPDATE mentor_live_answers SET media_deleted_at=now() WHERE id=$1", row["id"])
    stale = await pool.fetch("""SELECT i.* FROM mentor_live_interviews i WHERE i.status='IN_PROGRESS'
                                AND i.resume_deadline<=now() LIMIT 50""")
    for interview in stale:
        async with pool.acquire() as conn, conn.transaction():
            track = await service.find_track(conn, interview["track_id"], lock=True)
            current = await conn.fetchrow("SELECT status FROM mentor_live_interviews WHERE id=$1 FOR UPDATE",
                                          interview["id"])
            if current["status"] == "IN_PROGRESS":
                await service._expire(conn, interview, track, json.loads(track["details"]), live.now())


async def maintenance_forever() -> None:
    while True:
        try:
            pool = await get_pool()
            unsynced = await pool.fetch("""SELECT id FROM mentor_assessment_tracks
                                           WHERE NOT profile_synced AND cancelled_at IS NULL LIMIT 30""")
            for row in unsynced:
                await service.try_sync(row["id"])
            await purge(pool)
        except Exception:
            log.exception("Live verification maintenance failed")
        await asyncio.sleep(30)
