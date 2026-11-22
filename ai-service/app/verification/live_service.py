"""Nghiệp vụ phía mentor của phỏng vấn AI trực tiếp: lượt xác thực theo lĩnh vực, buổi phỏng vấn, kết quả, lịch sử."""
import asyncio
import json
import logging
from datetime import timedelta
from uuid import UUID, uuid4

from fastapi import UploadFile

from app import config, errors
from app.clients import mentoring, profile
from app.db import get_pool
from app.interview import engine
from app.interview.models import InterviewContext, TurnRecord
from app.security import AuthUser
from app.verification import live, media_storage

log = logging.getLogger(__name__)
TRACK_QUERY = "SELECT * FROM mentor_assessment_tracks WHERE id=$1 AND cancelled_at IS NULL"
RESULT_KEYS = ("lastScore", "submittedAt", "resultId", "adminNote", "retryAt")
RETRY_STAGES = {"READY", "EXPIRED", "FAILED"}


def conflict(message: str, code: str, extra: dict | None = None) -> errors.AiError:
    return errors.AiError(code, message, status=409, extra=extra)


async def find_track(conn, track_id: UUID, owner: UUID | None = None, *, lock: bool = False):
    row = await conn.fetchrow(TRACK_QUERY + (" FOR UPDATE" if lock else ""), track_id)
    if row is None or (owner is not None and row["mentor_id"] != owner):
        raise errors.not_found("VERIFICATION_TRACK_NOT_FOUND", "Không tìm thấy lượt xác thực.")
    return row


async def save_track(conn, row, state: dict, *, sync: bool = False) -> None:
    await conn.execute("""UPDATE mentor_assessment_tracks SET details=$2,
                          profile_synced=profile_synced AND NOT $3::boolean WHERE id=$1""",
                       row["id"], json.dumps(state), sync)


def profile_state(stage: str, state: dict) -> dict:
    if stage == "PASSED":
        return dict(state="VERIFIED", stage="ADMIN")
    if stage == "FAILED":
        return dict(state="REJECTED", rejectedReason=state.get("adminNote") or "Buổi phỏng vấn AI chưa đạt.",
                    retryAt=state.get("retryAt"))
    return dict(state="PENDING", stage="ADMIN" if stage == "PENDING_REVIEW" else "TEST")


async def sync_track(track_id: UUID) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn, conn.transaction():
        row = await conn.fetchrow(TRACK_QUERY + " AND NOT profile_synced FOR UPDATE", track_id)
        if row is None:
            return
        state = json.loads(row["details"])
        body = profile_state(state["stage"], state)
        body["testScore"] = state.get("lastScore")
        if row["profile_domain_id"]:
            body["profileDomainId"] = str(row["profile_domain_id"])
        await profile.update_domain_verification(row["mentor_id"], row["domain"], body)
        await conn.execute("UPDATE mentor_assessment_tracks SET profile_synced=TRUE WHERE id=$1", track_id)


async def try_sync(track_id: UUID) -> None:
    try:
        await sync_track(track_id)
    except errors.AiError as exc:
        log.warning("Profile sync queued for verification track %s: %s", track_id, exc.code)


async def _identity(user: AuthUser) -> tuple[dict, dict]:
    info, domains = await asyncio.gather(profile.find_mentor(user.user_id), profile.mentor_domains(user.user_id))
    if info is None or domains is None:
        raise errors.not_found("MENTOR_PROFILE_NOT_FOUND", "Bạn cần tạo hồ sơ mentor trước khi xác thực.")
    return info, domains


def enrollments(payload: dict) -> dict[str, dict]:
    return {item["domain"]: item for item in payload.get("records", [])}


async def register_track(conn, user: AuthUser, info: dict, domain: str, stage: str, record: dict) -> None:
    enrollment = UUID(record["id"]) if record.get("id") else None
    state = {"stage": stage, "name": info.get("displayName") or info.get("fullName") or user.email or str(user.user_id),
             "email": user.email or "", "years": info.get("yearsExperience") or 0}
    if enrollment:
        await conn.execute("""UPDATE mentor_assessment_tracks SET cancelled_at=now()
                              WHERE mentor_id=$1 AND domain=$2 AND cancelled_at IS NULL
                                AND profile_domain_id IS NOT NULL AND profile_domain_id<>$3""",
                           user.user_id, domain, enrollment)
    await conn.execute("""INSERT INTO mentor_assessment_tracks(id, mentor_id, domain, details, profile_domain_id)
                          VALUES ($1,$2,$3,$4,$5)
                          ON CONFLICT (mentor_id, domain) WHERE cancelled_at IS NULL DO UPDATE
                          SET profile_domain_id=COALESCE(mentor_assessment_tracks.profile_domain_id,
                                                         EXCLUDED.profile_domain_id)""",
                       uuid4(), user.user_id, domain, json.dumps(state), enrollment)


# Trạng thái cũ của luồng trắc nghiệm (migration 018) quy về trạng thái hiện hành khi gặp lại.
LEGACY_STAGES = {"APPROVED": "PASSED", "REJECTED": "FAILED", "QUIZ_FAILED": "FAILED", "VOIDED": "FAILED",
                 "NEED_VIDEO": "READY", "NEED_MORE": "READY"}


def normalize(state: dict) -> bool:
    legacy = LEGACY_STAGES.get(state["stage"])
    if legacy:
        state["stage"] = legacy
    return legacy is not None


def track_view(row, state: dict, interview=None, details: dict | None = None) -> dict:
    view = dict(id=row["id"], domain=row["domain"], stage=state["stage"])
    for key in RESULT_KEYS:
        if state.get(key) is not None:
            view[key] = state[key]
    if state["stage"] == "IN_PROGRESS" and interview is not None and details is not None:
        total, done = len(details["plan"]), details["index"]
        view.update(interviewId=interview["id"], resumeDeadline=interview["resume_deadline"].isoformat(),
                    progressLabel=f"Chủ đề {min(done + 1, total)}/{total}", topicsDone=done, topicsTotal=total)
    return view


async def _expire(conn, interview, row, state: dict, at) -> None:
    """Buổi dở quá hạn tiếp tục: đóng buổi, lượt xác thực về EXPIRED (được phỏng vấn lại ngay)."""
    await conn.execute("UPDATE mentor_live_interviews SET status='EXPIRED' WHERE id=$1", interview["id"])
    state.update(stage="EXPIRED", retryAt=at.isoformat())
    state.pop("interviewId", None)
    await save_track(conn, row, state, sync=True)


async def _open_interview(conn, track_id: UUID, *, lock: bool = False):
    return await conn.fetchrow("SELECT * FROM mentor_live_interviews WHERE track_id=$1 AND status='IN_PROGRESS'"
                               + (" FOR UPDATE" if lock else ""), track_id)


async def overview(user: AuthUser) -> dict:
    info, payload = await _identity(user)
    registered = {item["domain"] for item in payload["domains"]}
    records = enrollments(payload)
    pool = await get_pool()
    touched = []
    async with pool.acquire() as conn, conn.transaction():
        for entry in payload["domains"]:
            domain = entry["domain"]
            if domain in live.DOMAINS:
                await register_track(conn, user, info, domain,
                                     "PASSED" if entry["state"] == "VERIFIED" else "READY", records.get(domain, {}))
        rows = await conn.fetch("""SELECT * FROM mentor_assessment_tracks
                                   WHERE mentor_id=$1 AND domain=ANY($2::text[]) AND cancelled_at IS NULL
                                   ORDER BY created_at FOR UPDATE""", user.user_id, list(registered))
        tracks = []
        at = live.now()
        for row in rows:
            state = json.loads(row["details"])
            changed = normalize(state)
            interview = await _open_interview(conn, row["id"]) if state["stage"] == "IN_PROGRESS" else None
            if interview is not None and interview["resume_deadline"] <= at:
                await _expire(conn, interview, row, state, at)
                interview, changed = None, False
                touched.append(row["id"])
            elif state["stage"] == "IN_PROGRESS" and interview is None:
                state["stage"], changed = "READY", True
            if changed:
                await save_track(conn, row, state, sync=True)
                touched.append(row["id"])
            tracks.append(track_view(row, state, interview, json.loads(interview["details"]) if interview else None))
    for track_id in touched:
        await try_sync(track_id)
    used = {row["domain"] for row in rows}
    available = [d for d in live.DOMAINS if d not in used]
    focus = next((t for t in tracks if t["stage"] in RETRY_STAGES | {"IN_PROGRESS"}), tracks[0] if tracks else None)
    topics = live.topic_names(focus["domain"] if focus else "backend", list(info.get("skills") or []))
    return dict(tracks=tracks, maxDomains=payload["max"], availableDomains=[] if len(used) >= payload["max"] else available,
                rules=live.rules_view(topics))


async def add_track(user: AuthUser, domain: str) -> dict:
    info, payload = await _identity(user)
    registered = {item["domain"] for item in payload["domains"]}
    if domain not in registered:
        if len(registered) >= payload["max"]:
            raise conflict(f"Mỗi mentor xác thực tối đa {payload['max']} lĩnh vực.", "VERIFICATION_DOMAIN_LIMIT")
        await profile.update_domain_verification(user.user_id, domain, dict(state="PENDING", stage="TEST", register=True))
        payload = await profile.mentor_domains(user.user_id)
        if payload is None:
            raise errors.not_found("MENTOR_PROFILE_NOT_FOUND", "Không tìm thấy hồ sơ mentor.")
    pool = await get_pool()
    async with pool.acquire() as conn, conn.transaction():
        await register_track(conn, user, info, domain, "READY", enrollments(payload).get(domain, {}))
        row = await conn.fetchrow("""SELECT * FROM mentor_assessment_tracks
                                     WHERE mentor_id=$1 AND domain=$2 AND cancelled_at IS NULL""", user.user_id, domain)
    return track_view(row, json.loads(row["details"]))


async def cancel(mentor_id: UUID, domain: str, profile_domain_id: UUID | None) -> None:
    pool = await get_pool()
    await pool.execute("""UPDATE mentor_assessment_tracks SET cancelled_at=now()
                          WHERE mentor_id=$1 AND domain=$2 AND cancelled_at IS NULL
                            AND ($3::uuid IS NULL OR profile_domain_id=$3)""", mentor_id, domain, profile_domain_id)


def _turn(role: str, text: str, topic: str | None, at) -> dict:
    return dict(id=str(uuid4()), role=role, text=text, topic=topic, at=at.isoformat())


async def start(user: AuthUser, track_id: UUID, consent: bool) -> dict:
    if consent is not True:
        raise errors.bad_request("VIDEO_CONSENT_REQUIRED", "Bạn cần đồng ý cho hệ thống ghi hình và ghi âm buổi phỏng vấn.")
    info = await profile.find_mentor(user.user_id)
    pool = await get_pool()
    async with pool.acquire() as conn, conn.transaction():
        row = await find_track(conn, track_id, user.user_id, lock=True)
        state = json.loads(row["details"])
        normalize(state)
        at = live.now()
        open_interview = await _open_interview(conn, track_id, lock=True)
        if open_interview is not None:
            if open_interview["resume_deadline"] > at:
                return live.interview_view(open_interview, json.loads(open_interview["details"]))
            await _expire(conn, open_interview, row, state, at)
        stage = state["stage"]
        if stage == "PASSED":
            raise conflict("Lĩnh vực này đã được xác thực.", "ALREADY_VERIFIED")
        if stage == "PENDING_REVIEW":
            raise conflict("Kết quả đang chờ quản trị viên xem xét.", "INTERVIEW_PENDING_REVIEW")
        if stage == "FAILED" and state.get("retryAt") and live.parse(state["retryAt"]) > at:
            raise conflict("Bạn chưa đến ngày được phỏng vấn lại.", "INTERVIEW_COOLDOWN", {"retryAt": state["retryAt"]})
        plan = live.plan(row["domain"], list((info or {}).get("skills") or []), uuid4)
        details = dict(domain=row["domain"], plan=plan, index=0, remaining=live.MAX_MINUTES * 60,
                       skills=list((info or {}).get("skills") or []), years=(info or {}).get("yearsExperience") or 0,
                       turns=[_turn("ai", live.greeting(row["domain"], plan[0]["question"]), plan[0]["topic"], at)])
        interview_id = uuid4()
        await conn.execute("""INSERT INTO mentor_live_interviews(id, track_id, mentor_id, status, details, started_at,
                              resume_deadline) VALUES ($1,$2,$3,'IN_PROGRESS',$4,$5,$6)""",
                           interview_id, track_id, user.user_id, json.dumps(details), at,
                           at + timedelta(hours=live.RESUME_HOURS))
        for key in (*RESULT_KEYS, "interviewId"):
            state.pop(key, None)
        state.update(stage="IN_PROGRESS", interviewId=str(interview_id))
        await save_track(conn, row, state, sync=True)
        interview = await conn.fetchrow("SELECT * FROM mentor_live_interviews WHERE id=$1", interview_id)
    await try_sync(track_id)
    return live.interview_view(interview, details)


async def _owned_interview(conn, interview_id: UUID, owner: UUID, *, lock: bool = False):
    row = await conn.fetchrow("SELECT * FROM mentor_live_interviews WHERE id=$1" + (" FOR UPDATE" if lock else ""),
                              interview_id)
    if row is None or row["mentor_id"] != owner:
        raise errors.not_found("INTERVIEW_NOT_FOUND", "Không tìm thấy buổi phỏng vấn.")
    return row


async def get_interview(user: AuthUser, interview_id: UUID) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn, conn.transaction():
        interview = await _owned_interview(conn, interview_id, user.user_id, lock=True)
        at = live.now()
        if interview["status"] == "IN_PROGRESS" and interview["resume_deadline"] <= at:
            track = await find_track(conn, interview["track_id"], lock=True)
            await _expire(conn, interview, track, json.loads(track["details"]), at)
            interview = await _owned_interview(conn, interview_id, user.user_id)
            expired = True
        else:
            expired = False
    if expired:
        await try_sync(interview["track_id"])
    return live.interview_view(interview, json.loads(interview["details"]))


async def _read_media(media: UploadFile | None) -> tuple[bytes, str] | None:
    if media is None:
        return None
    data = await media.read(config.LIVE_ANSWER_MAX_BYTES + 1)
    if len(data) > config.LIVE_ANSWER_MAX_BYTES:
        raise errors.AiError("MEDIA_TOO_LARGE", "Đoạn video của câu trả lời quá lớn.", status=413)
    return (data, media.content_type or "video/webm") if data else None


def _history(answers: list) -> list[TurnRecord]:
    return [TurnRecord(turn_no=a["position"] + 1, topic=a["topic"], strategy="OPENING", question=a["question"],
                       answer=a["transcript"], score=json.loads(a["evaluation"])["score"],
                       flags=json.loads(a["evaluation"])["flags"]) for a in answers]


async def _evaluate(details: dict, item: dict, position: int, transcript: str, answers: list) -> dict:
    if not transcript.strip():
        return dict(rubric=dict(technical=0, depth=0, communication=0, mentoring=0), score=0.0,
                    flags=[live.FLAG_NO_TRANSCRIPT], engine="NONE", model=None,
                    feedback="Mình chưa nhận được nội dung câu trả lời bằng chữ. Quản trị viên sẽ nghe lại video của câu này.")
    context = InterviewContext(domain=details["domain"], skills=details["skills"], years_experience=details["years"],
                               planned_concepts={item["topic"]: item["concepts"]}, max_turns=len(details["plan"]))
    current = TurnRecord(turn_no=position + 1, topic=item["topic"], strategy="OPENING", question=item["question"],
                         answer=transcript)
    result = await engine.evaluate(None, context, _history(answers), current, is_last_turn=True)
    value = result.value
    return dict(rubric=value.rubric.model_dump(by_alias=False), score=value.score, flags=list(value.flags),
                feedback=value.feedback, engine=result.used_engine, model=result.model)


async def answer(user: AuthUser, interview_id: UUID, question_id: str, transcript: str, duration: int,
                 media: UploadFile | None) -> dict:
    pool = await get_pool()
    interview = await _owned_interview(pool, interview_id, user.user_id)
    details = json.loads(interview["details"])
    position = details["index"]
    at = live.now()
    if interview["status"] != "IN_PROGRESS" or interview["resume_deadline"] <= at:
        raise conflict("Buổi phỏng vấn đã kết thúc hoặc quá hạn.", "INTERVIEW_CLOSED")
    if position >= len(details["plan"]) or details["plan"][position]["id"] != question_id:
        raise conflict("Câu hỏi này không còn là câu hiện tại.", "QUESTION_MISMATCH")
    item = details["plan"][position]
    transcript = transcript.strip()[:8000]
    blob = await _read_media(media)
    previous = await pool.fetch("SELECT * FROM mentor_live_answers WHERE interview_id=$1 ORDER BY position", interview_id)
    evaluation = await _evaluate(details, item, position, transcript, previous)
    answer_id = uuid4()
    if blob:
        media_storage.write_blob(f"live/{interview_id}", str(answer_id), blob[0])
    async with pool.acquire() as conn, conn.transaction():
        current = await _owned_interview(conn, interview_id, user.user_id, lock=True)
        fresh = json.loads(current["details"])
        if current["status"] != "IN_PROGRESS" or fresh["index"] != position:
            raise conflict("Câu hỏi này đã được trả lời.", "QUESTION_MISMATCH")
        keep = at + timedelta(days=config.VIDEO_RETENTION_DAYS) if blob else None
        await conn.execute("""INSERT INTO mentor_live_answers(id, interview_id, position, topic, question, transcript,
                              duration_seconds, evaluation, media_mime, media_bytes, keep_until)
                              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)""",
                           answer_id, interview_id, position, item["topic"], item["question"], transcript,
                           max(0, min(duration, 3600)), json.dumps(evaluation),
                           blob[1] if blob else None, len(blob[0]) if blob else None, keep)
        fresh["turns"].append(_turn("mentor", transcript or "(Trả lời bằng giọng nói)", item["topic"], at))
        fresh["index"] = position + 1
        if fresh["index"] < len(fresh["plan"]):
            upcoming = fresh["plan"][fresh["index"]]
            fresh["turns"].append(_turn("ai", f"{evaluation['feedback']} {upcoming['question']}", upcoming["topic"], at))
        else:
            fresh["turns"].append(_turn("ai", live.CLOSING, None, at))
        await conn.execute("UPDATE mentor_live_interviews SET details=$2, resume_deadline=$3 WHERE id=$1",
                           interview_id, json.dumps(fresh), at + timedelta(hours=live.RESUME_HOURS))
        updated = await conn.fetchrow("SELECT * FROM mentor_live_interviews WHERE id=$1", interview_id)
    return live.interview_view(updated, fresh)


async def heartbeat(user: AuthUser, interview_id: UUID, remaining: float) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn, conn.transaction():
        interview = await _owned_interview(conn, interview_id, user.user_id, lock=True)
        if interview["status"] != "IN_PROGRESS":
            return
        details = json.loads(interview["details"])
        # Đồng hồ chỉ được giảm: chặn client gửi số lớn hơn để kéo dài buổi.
        details["remaining"] = max(0, min(details["remaining"], remaining))
        at = live.now()
        await conn.execute("UPDATE mentor_live_interviews SET details=$2, resume_deadline=$3 WHERE id=$1",
                           interview_id, json.dumps(details), at + timedelta(hours=live.RESUME_HOURS))


def result_view(row) -> dict:
    details = json.loads(row["details"])
    return dict(id=row["id"], trackId=row["track_id"], domain=details["domain"], outcome=row["outcome"],
                totalScore=float(row["total_score"]), passScore=live.PASS_SCORE, criteria=details["criteria"],
                improvements=details["improvements"], summary=details["summary"],
                retryAt=row["retry_at"].isoformat() if row["retry_at"] else None,
                submittedAt=row["submitted_at"].isoformat(), decidedBy=row["decided_by"],
                adminNote=row["admin_note"])


async def submit(user: AuthUser, interview_id: UUID) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn, conn.transaction():
        interview = await _owned_interview(conn, interview_id, user.user_id, lock=True)
        existing = await conn.fetchrow("SELECT * FROM mentor_live_results WHERE interview_id=$1", interview_id)
        if existing is not None:
            return result_view(existing)
        if interview["status"] != "IN_PROGRESS":
            raise conflict("Buổi phỏng vấn đã kết thúc hoặc quá hạn.", "INTERVIEW_CLOSED")
        details = json.loads(interview["details"])
        rows = await conn.fetch("SELECT * FROM mentor_live_answers WHERE interview_id=$1 ORDER BY position", interview_id)
        if not rows:
            raise conflict("Bạn chưa trả lời câu nào.", "NO_ANSWERS")
        graded = [dict(topic=r["topic"], transcript=r["transcript"], **json.loads(r["evaluation"])) for r in rows]
        grading = live.grade(graded, len(details["plan"]))
        track = await find_track(conn, interview["track_id"], lock=True)
        state = json.loads(track["details"])
        at = live.now()
        outcome = grading["outcome"]
        retry = live.retry_at(at) if outcome == "FAILED" else None
        result_id = uuid4()
        body = dict(domain=details["domain"], criteria=grading["criteria"], improvements=grading["improvements"],
                    summary=grading["summary"], recommendation=grading["recommendation"],
                    confidence=grading["confidence"], flags=grading["flags"],
                    reason=live.ai_reason(grading, graded, len(details["plan"])))
        await conn.execute("""INSERT INTO mentor_live_results(id, interview_id, track_id, mentor_id, outcome, total_score,
                              details, decided_by, decided_at, retry_at, submitted_at)
                              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)""",
                           result_id, interview_id, interview["track_id"], user.user_id, outcome, grading["total"],
                           json.dumps(body), None if outcome == "UNCLEAR" else "AI",
                           None if outcome == "UNCLEAR" else at, retry, at)
        await conn.execute("UPDATE mentor_live_interviews SET status='SUBMITTED', submitted_at=$2 WHERE id=$1",
                           interview_id, at)
        state.pop("interviewId", None)
        state.update(stage={"PASSED": "PASSED", "FAILED": "FAILED", "UNCLEAR": "PENDING_REVIEW"}[outcome],
                     lastScore=grading["total"], submittedAt=at.isoformat(), resultId=str(result_id))
        if retry:
            state["retryAt"] = retry.isoformat()
        await save_track(conn, track, state, sync=True)
        created = await conn.fetchrow("SELECT * FROM mentor_live_results WHERE id=$1", result_id)
    await try_sync(interview["track_id"])
    if outcome == "UNCLEAR":
        await mentoring.notify_role("ADMIN", "VERIFICATION_REVIEW", "Hồ sơ xác thực cần xem xét",
                                    f"{state.get('name', 'Một mentor')} có kết quả phỏng vấn AI chưa rõ ràng "
                                    f"({details['domain']}).", "/admin/verification")
    return result_view(created)


async def get_result(user: AuthUser, result_id: UUID) -> dict:
    pool = await get_pool()
    row = await pool.fetchrow("SELECT * FROM mentor_live_results WHERE id=$1", result_id)
    if row is None or row["mentor_id"] != user.user_id:
        raise errors.not_found("RESULT_NOT_FOUND", "Không tìm thấy kết quả.")
    return result_view(row)


async def history(user: AuthUser) -> list[dict]:
    pool = await get_pool()
    results = await pool.fetch("""SELECT r.id, r.outcome, r.total_score, r.submitted_at, r.details
                                  FROM mentor_live_results r JOIN mentor_assessment_tracks t ON t.id=r.track_id
                                  WHERE r.mentor_id=$1 AND t.cancelled_at IS NULL""", user.user_id)
    incomplete = await pool.fetch("""SELECT i.id, i.started_at, i.details FROM mentor_live_interviews i
                                     JOIN mentor_assessment_tracks t ON t.id=i.track_id
                                     WHERE i.mentor_id=$1 AND i.status='EXPIRED' AND t.cancelled_at IS NULL""",
                                  user.user_id)
    items = [dict(id=r["id"], domain=json.loads(r["details"])["domain"], at=r["submitted_at"].isoformat(),
                  outcome=r["outcome"], totalScore=float(r["total_score"])) for r in results]
    items += [dict(id=i["id"], domain=json.loads(i["details"])["domain"], at=i["started_at"].isoformat(),
                   outcome="INCOMPLETE", totalScore=None) for i in incomplete]
    return sorted(items, key=lambda item: item["at"], reverse=True)

