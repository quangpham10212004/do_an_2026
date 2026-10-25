"""
Video vòng 1 (docs/design-mentor-verification.md §5): nhận đoạn video / âm thanh từ trình duyệt, chốt khi kết thúc, chép lời lại
phía server để đối chiếu với bản của trình duyệt (D12), gắn cờ, phát lại cho admin / mentor và xoá theo hạn lưu 60 ngày.

Quy trình xử lý chạy ĐÚNG MỘT LẦN khi đủ cả hai điều kiện: bản chép lời đã nộp (buổi PENDING_REVIEW) và video đã chốt.
Bên nào đến sau thì chạy; đợt chỉ sang ROUND1_REVIEW (admin duyệt được) khi xong. Video không đưa cho LLM (không phân tích hình ảnh).
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

import httpx
import jwt
from fastapi.responses import Response, StreamingResponse

from app import config, errors
from app.clients import audit, mentoring, profile
from app.db import get_pool
from app.interview import repository as irepo
from app.interview import voice
from app.interview.views import VideoView, video_view
from app.security import AuthUser
from app.verification import media_storage, rules
from app.verification import service as verification
from app.verification import video_repository as vrepo
from app.verification import video_rules

log = logging.getLogger(__name__)

_AUDIO_EXTENSIONS = {"audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav"}


# ---------- tải lên ----------

async def create(db, interview_id: UUID, mentor_id: UUID, consent_video: bool) -> None:
    await vrepo.insert(db, interview_id, mentor_id, consent_video)


async def _own_interview(user: AuthUser, interview_id: UUID):
    pool = await get_pool()
    interview = await irepo.find(pool, interview_id)
    if interview is None:
        raise errors.not_found("INTERVIEW_NOT_FOUND", "Không tìm thấy buổi phỏng vấn")
    if interview["mentor_id"] != user.user_id:
        raise errors.forbidden("Đây không phải buổi phỏng vấn của bạn")
    return pool, interview


async def upload_chunk(user: AuthUser, interview_id: UUID, kind: str, n: int, start_ms: int, dur_ms: int,
                       body: bytes, content_type: str | None) -> None:
    if kind not in media_storage.KINDS:
        raise errors.bad_request("VALIDATION_ERROR", "Loại đoạn không hợp lệ")
    if not 0 <= n < 10_000 or start_ms < 0 or not 0 <= dur_ms <= 120_000:
        raise errors.bad_request("VALIDATION_ERROR", "Chỉ số hoặc thời gian của đoạn không hợp lệ")
    if not body:
        raise errors.bad_request("EMPTY_CHUNK", "Đoạn tải lên rỗng")
    if len(body) > config.VIDEO_MAX_CHUNK_BYTES:
        raise errors.AiError("CHUNK_TOO_LARGE", f"Đoạn tải lên vượt {config.VIDEO_MAX_CHUNK_BYTES} byte", status=413)
    pool, interview = await _own_interview(user, interview_id)
    if interview["status"] not in ("IN_PROGRESS", "PENDING_REVIEW"):
        raise errors.conflict("VIDEO_UPLOAD_CLOSED", "Buổi phỏng vấn đã kết thúc, không nhận thêm video")
    video = await vrepo.find_by_interview(pool, interview_id)
    if video is None:
        raise errors.not_found("VIDEO_NOT_FOUND", "Buổi phỏng vấn này không có video")
    if video["finished_at"] is not None:
        raise errors.conflict("VIDEO_FINISHED", "Video đã được chốt, không nhận thêm đoạn")
    media_storage.write_chunk(video["storage_dir"], kind, n, body)
    saved = await vrepo.add_chunk(pool, interview_id, kind,
                                  {"n": n, "startMs": start_ms, "durMs": dur_ms, "size": len(body)}, content_type)
    if saved is None:
        raise errors.conflict("VIDEO_FINISHED", "Video đã được chốt, không nhận thêm đoạn")


async def _finish_video(video):
    """Ghép đoạn → file, tính khoảng trống camera, chốt (một lần). Gọi lại trên video đã chốt trả lại nguyên trạng."""
    if video["finished_at"] is not None:
        return video
    pool = await get_pool()
    chunks = vrepo.chunk_list(video, "video")
    gaps = video_rules.analyze_gaps(chunks, config.VIDEO_MAX_GAP_SECONDS)
    media_storage.assemble(video["storage_dir"], "audio", [c["n"] for c in vrepo.chunk_list(video, "audio")])
    size = media_storage.assemble(video["storage_dir"], "video", [c["n"] for c in chunks])
    done = await vrepo.finish(pool, video["interview_id"], size + (media_storage.file_size(video["storage_dir"], "audio") or 0),
                              video_rules.duration_seconds(chunks), gaps.detected, gaps.total_seconds)
    return done or await vrepo.find_by_interview(pool, video["interview_id"])


async def finish(user: AuthUser, interview_id: UUID) -> VideoView:
    pool, _ = await _own_interview(user, interview_id)
    video = await vrepo.find_by_interview(pool, interview_id)
    if video is None:
        raise errors.not_found("VIDEO_NOT_FOUND", "Buổi phỏng vấn này không có video")
    video = await _finish_video(video)
    await try_process(interview_id)
    return video_view(await vrepo.find_by_interview(pool, interview_id), for_admin=False)


# ---------- xử lý sau khi đủ bản chép lời và video ----------

async def try_process(interview_id: UUID) -> bool:
    """Chạy xử lý nếu đủ điều kiện và chưa ai chạy. Trả True khi lần gọi này đã xử lý."""
    pool = await get_pool()
    interview = await irepo.find(pool, interview_id)
    if interview is None or interview["status"] != "PENDING_REVIEW":
        return False
    video = await vrepo.claim_processing(pool, interview_id)
    if video is None:
        return False
    await _process(interview, video)
    return True


async def _transcribe(audio: bytes, mime: str | None) -> str:
    mime = (mime or "audio/webm").split(";")[0].strip()
    name = f"audio.{_AUDIO_EXTENSIONS.get(mime, 'webm')}"
    async with httpx.AsyncClient(base_url=config.OPENAI_BASE_URL, timeout=config.TRANSCRIBE_TIMEOUT_SECONDS,
                                 transport=voice.TRANSPORT, headers={"Authorization": f"Bearer {config.OPENAI_API_KEY}"}) as http:
        res = await http.post("/audio/transcriptions", data={"model": config.OPENAI_TRANSCRIBE_MODEL},
                              files={"file": (name, audio, mime)})
    res.raise_for_status()
    return str(res.json()["text"])


async def _recheck(video, browser_text: str) -> tuple[str | None, str, float | None]:
    """(bản chép lời của server, OK | MISMATCH | UNAVAILABLE, tỉ lệ khác biệt). Mọi lỗi => UNAVAILABLE, không chặn quy trình."""
    if not config.OPENAI_API_KEY:
        return None, "UNAVAILABLE", None
    audio = media_storage.read_all(video["storage_dir"], "audio")
    if not audio or len(audio) > config.TRANSCRIBE_MAX_BYTES:
        return None, "UNAVAILABLE", None
    try:
        text = await _transcribe(audio, video["audio_mime"])
    except (httpx.HTTPError, KeyError, ValueError) as e:
        log.warning("Server-side transcription failed for interview %s: %s", video["interview_id"], e)
        return None, "UNAVAILABLE", None
    diff = video_rules.transcript_diff(browser_text, text)
    return text, ("MISMATCH" if video_rules.transcript_mismatch(diff, config.TRANSCRIPT_MISMATCH_THRESHOLD) else "OK"), diff


async def _process(interview, video) -> None:
    pool = await get_pool()
    turns = await irepo.turns_of(pool, interview["id"])
    browser_text = " ".join(t["answer"] for t in turns if t["answer"] and t["answer"] != voice.NO_ANSWER)
    server_text, check, diff = await _recheck(video, browser_text)
    flags = ([video_rules.FLAG_CAMERA_OFF] if video["gap_detected"] else []) \
        + ([video_rules.FLAG_TRANSCRIPT_MISMATCH] if check == "MISMATCH" else [])
    invalid = video_rules.invalidated(video_rules.Gaps(video["gap_detected"], video["gap_total_seconds"]),
                                      config.VIDEO_RECONNECT_SECONDS)
    async with pool.acquire() as conn, conn.transaction():
        await vrepo.save_result(conn, interview["id"], server_text, diff, check, flags)
        if invalid:
            await conn.execute("UPDATE interviews SET status = 'INVALIDATED', abandoned_at = now() "
                               "WHERE id = $1 AND status = 'PENDING_REVIEW'", interview["id"])
        else:
            if flags:  # cờ chỉ là tín hiệu cho admin: buộc khuyến nghị NEEDS_REVIEW, không tự loại mentor
                await conn.execute("UPDATE interviews SET recommendation = 'NEEDS_REVIEW' "
                                   "WHERE id = $1 AND recommendation IN ('APPROVE', 'REJECT')", interview["id"])
            await verification.on_round1_completed(conn, interview["application_id"])
    mentor_id = interview["mentor_id"]
    if invalid:
        await profile.update_verification(mentor_id, rules.profile_status(rules.ROUND1))
        await mentoring.notify_user(
            mentor_id, "INTERVIEW_RETAKE_REQUESTED", "Buổi phỏng vấn không hợp lệ",
            f"Camera bị gián đoạn tổng cộng {video['gap_total_seconds']:g} giây (tối đa {config.VIDEO_RECONNECT_SECONDS:g} giây). "
            "Lần này tính là một lần không hoàn thành; bạn có thể làm lại nếu còn lượt.", "/interview")
        await audit.record(None, "SYSTEM", "INTERVIEW_INVALIDATED", "INTERVIEW", str(interview["id"]), None,
                           {"mentorId": str(mentor_id), "gapTotalSeconds": video["gap_total_seconds"]})
        await verification.on_attempt_failed(interview["application_id"], mentor_id)
        return
    await verification.notify_ready_for_review(await irepo.find(pool, interview["id"]))


# ---------- phát lại, xoá, bảo trì ----------

def _token_claims(token: str, interview_id: UUID) -> dict:
    try:
        claims = jwt.decode(token, config.JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise errors.AiError("UNAUTHORIZED", "Liên kết xem video không hợp lệ hoặc đã hết hạn", status=401) from None
    if claims.get("typ") != "video" or claims.get("vid") != str(interview_id):
        raise errors.AiError("UNAUTHORIZED", "Liên kết xem video không hợp lệ", status=401)
    return claims


async def play_token(user: AuthUser, interview_id: UUID) -> dict:
    """Admin xem được mọi video, mentor chỉ video của mình. Token ngắn hạn gắn video + người dùng (thẻ <video> không gửi được header)."""
    pool = await get_pool()
    interview = await irepo.find(pool, interview_id)
    if interview is None:
        raise errors.not_found("INTERVIEW_NOT_FOUND", "Không tìm thấy buổi phỏng vấn")
    if not user.is_admin and interview["mentor_id"] != user.user_id:
        raise errors.forbidden("Bạn không có quyền xem video này")
    video = await vrepo.find_by_interview(pool, interview_id)
    if video is None or video["finished_at"] is None:
        raise errors.not_found("VIDEO_NOT_FOUND", "Video chưa sẵn sàng")
    if video["deleted_at"] is not None:
        raise errors.AiError("VIDEO_DELETED", "Video đã bị xoá", status=410)
    expires = datetime.now(timezone.utc) + timedelta(seconds=config.VIDEO_PLAY_TOKEN_SECONDS)
    token = jwt.encode({"typ": "video", "sub": str(user.user_id), "vid": str(interview_id), "exp": expires},
                       config.JWT_SECRET, algorithm="HS256")
    if user.is_admin:
        await audit.record(user.user_id, "ADMIN", "VIDEO_VIEWED", "INTERVIEW", str(interview_id), None,
                           {"mentorId": str(interview["mentor_id"])})
    return {"url": f"/api/ai/verification/videos/{interview_id}/stream?token={token}", "expires_at": expires}


def _parse_range(header: str | None, size: int) -> tuple[int, int] | None:
    """'bytes=a-b' | 'bytes=a-' | 'bytes=-n' → (start, end) bao gồm hai đầu; không hợp lệ => None (trả cả file)."""
    if not header or not header.startswith("bytes=") or "," in header:
        return None
    first, _, last = header[6:].partition("-")
    try:
        if first == "":
            n = int(last)
            return (max(0, size - n), size - 1) if n > 0 else None
        start = int(first)
        end = int(last) if last else size - 1
    except ValueError:
        return None
    return (start, min(end, size - 1)) if 0 <= start <= end and start < size else None


async def stream(interview_id: UUID, token: str, range_header: str | None) -> Response:
    _token_claims(token, interview_id)
    pool = await get_pool()
    video = await vrepo.find_by_interview(pool, interview_id)
    if video is None or video["finished_at"] is None:
        raise errors.not_found("VIDEO_NOT_FOUND", "Video chưa sẵn sàng")
    if video["deleted_at"] is not None:
        raise errors.AiError("VIDEO_DELETED", "Video đã bị xoá", status=410)
    size = media_storage.file_size(video["storage_dir"], "video")
    if size is None:
        raise errors.not_found("VIDEO_NOT_FOUND", "Không có file video (camera chưa gửi đoạn nào)")
    mime = (video["video_mime"] or "video/webm").split(";")[0].strip()
    rng = _parse_range(range_header, size)
    start, end = rng if rng else (0, size - 1)
    headers = {"Accept-Ranges": "bytes", "Content-Length": str(end - start + 1), "Cache-Control": "private, no-store"}
    if rng:
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    return StreamingResponse(media_storage.iter_range(video["storage_dir"], "video", start, end), status_code=206 if rng else 200,
                             media_type=mime, headers=headers)


async def delete_video(admin: AuthUser, interview_id: UUID) -> VideoView:
    """Admin xoá sớm: file bị xoá vĩnh viễn; bản ghi, cờ và hai bản chép lời vẫn giữ làm căn cứ."""
    pool = await get_pool()
    video = await vrepo.find_by_interview(pool, interview_id)
    if video is None:
        raise errors.not_found("VIDEO_NOT_FOUND", "Buổi phỏng vấn này không có video")
    if video["deleted_at"] is None:
        media_storage.delete(video["storage_dir"])
        video = await vrepo.mark_deleted(pool, interview_id, admin.user_id)
        await audit.record(admin.user_id, "ADMIN", "VIDEO_DELETED", "INTERVIEW", str(interview_id), None,
                           {"mentorId": str(video["mentor_id"])})
    return video_view(video, for_admin=True)


async def maintenance_once() -> tuple[int, int]:
    """(số video tự chốt, số video xoá vì hết hạn): mentor nộp bản chép lời mà không chốt video, và hạn lưu 60 ngày."""
    pool = await get_pool()
    finalized = purged = 0
    for video in await vrepo.unfinished_after_submit(pool, config.VIDEO_FINISH_GRACE_MINUTES):
        await _finish_video(video)
        await try_process(video["interview_id"])
        finalized += 1
    for video in await vrepo.expired(pool):
        media_storage.delete(video["storage_dir"])
        await vrepo.mark_deleted(pool, video["interview_id"], None)
        await audit.record(None, "SYSTEM", "VIDEO_EXPIRED", "INTERVIEW", str(video["interview_id"]), None,
                           {"mentorId": str(video["mentor_id"])})
        purged += 1
    return finalized, purged


async def maintenance_forever(interval_seconds: float = 600) -> None:
    """Job nền: chốt video bị bỏ quên và xoá video quá hạn lưu (cùng khuôn purge_expired_cvs_forever)."""
    while True:
        try:
            finalized, purged = await maintenance_once()
            if finalized or purged:
                log.info("Video maintenance: finalized %d, purged %d", finalized, purged)
        except Exception as e:  # noqa: BLE001 — job nền không được chết
            log.warning("Video maintenance failed: %s", e)
        await asyncio.sleep(interval_seconds)
