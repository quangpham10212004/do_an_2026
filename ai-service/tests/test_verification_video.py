"""Vòng 1 có camera: đồng ý, tải đoạn, chốt, cờ camera, chép lời kép, phát lại, xoá, hạn lưu (docs/design-mentor-verification.md §5)."""
import asyncio
import uuid

import asyncpg
import httpx
import pytest

from app import config
from app.interview import voice
from app.verification import video_service
from tests.conftest import auth
from tests.test_interview_flow import STRONG_ANSWER, finish_video, start, start_iv, submit, transcript, upload_video

ADMIN = auth(uuid.uuid4(), "ADMIN")


@pytest.fixture
def mentor_id():
    return uuid.uuid4()


def status_of(client, mentor_id):
    return client.get("/api/ai/verification/status", headers=auth(mentor_id, "MENTOR")).json()


def post_transcript(client, mentor_id, interview, text=STRONG_ANSWER):
    res = client.post(f"/api/ai/interviews/{interview['id']}/voice-transcript", json=transcript(interview["maxTurns"], text),
                      headers=auth(mentor_id, "MENTOR"))
    assert res.status_code == 200, res.text
    return res.json()


def admin_view(client, interview_id):
    return client.get(f"/api/ai/interviews/{interview_id}", headers=ADMIN).json()


async def _sql(sql, *args):
    conn = await asyncpg.connect(config.AI_DB_URL)
    try:
        return await conn.fetchval(sql, *args)
    finally:
        await conn.close()


# ---------- đồng ý và tải lên ----------

def test_camera_consent_is_required_and_nothing_is_created_without_it(client, db, fake_profile, mentor_id):
    res = start(client, mentor_id, video=False)
    assert res.status_code == 400 and res.json()["error"]["code"] == "VIDEO_CONSENT_REQUIRED"
    assert asyncio.run(_sql("SELECT COUNT(*) FROM interviews")) == 0
    assert asyncio.run(_sql("SELECT COUNT(*) FROM verification_applications")) == 0


def test_starting_creates_the_video_record_with_consent(client, db, fake_profile, mentor_id):
    iv = start_iv(client, mentor_id)
    assert iv["video"]["consentVideo"] is True and iv["video"]["finished"] is False and iv["video"]["available"] is False
    assert iv["video"]["flags"] == [] and iv["video"]["serverTranscript"] is None


def test_only_the_owner_can_upload_and_only_valid_chunks(client, db, fake_profile, mentor_id, monkeypatch):
    iv = start_iv(client, mentor_id)
    url = f"/api/ai/verification/videos/{iv['id']}/chunks/0"
    params = {"startMs": 0, "durMs": 10_000}
    assert client.put(url, params=params, content=b"x", headers=auth(uuid.uuid4(), "MENTOR")).status_code == 403
    assert client.put(url, params=params, content=b"x", headers=auth(mentor_id, "MENTEE")).status_code == 403
    empty = client.put(url, params=params, content=b"", headers=auth(mentor_id, "MENTOR"))
    assert empty.status_code == 400 and empty.json()["error"]["code"] == "EMPTY_CHUNK"
    assert client.put(url, params={"startMs": -1, "durMs": 10_000}, content=b"x", headers=auth(mentor_id, "MENTOR")).status_code == 400
    monkeypatch.setattr(config, "VIDEO_MAX_CHUNK_BYTES", 4)
    big = client.put(url, params=params, content=b"too-big", headers=auth(mentor_id, "MENTOR"))
    assert big.status_code == 413 and big.json()["error"]["code"] == "CHUNK_TOO_LARGE"
    missing = client.put(f"/api/ai/verification/videos/{uuid.uuid4()}/chunks/0", params=params, content=b"x",
                         headers=auth(mentor_id, "MENTOR"))
    assert missing.status_code == 404


def test_uploading_the_same_chunk_again_replaces_it_and_finish_closes_the_video(client, db, fake_profile, mentor_id):
    iv = start_iv(client, mentor_id)
    headers = auth(mentor_id, "MENTOR")
    for body in (b"first", b"second"):
        res = client.put(f"/api/ai/verification/videos/{iv['id']}/chunks/0", params={"startMs": 0, "durMs": 10_000},
                         content=body, headers=headers)
        assert res.status_code == 204
    video = finish_video(client, mentor_id, iv["id"])
    assert video["finished"] is True and video["chunkCount"] == 1 and video["durationSeconds"] == 10
    late = client.put(f"/api/ai/verification/videos/{iv['id']}/chunks/1", params={"startMs": 10_000, "durMs": 10_000},
                      content=b"late", headers=headers)
    assert late.status_code == 409 and late.json()["error"]["code"] == "VIDEO_FINISHED"
    assert finish_video(client, mentor_id, iv["id"])["finished"] is True  # chốt lại không lỗi


# ---------- đợt chỉ sang ROUND1_REVIEW khi đủ bản chép lời và video ----------

def test_application_waits_for_both_transcript_and_video_in_either_order(client, db, fake_profile, fake_mentoring, mentor_id):
    iv = start_iv(client, mentor_id)
    post_transcript(client, mentor_id, iv)
    s = status_of(client, mentor_id)
    assert s["status"] == "ROUND1"  # đã nộp bản chép lời nhưng video chưa chốt
    assert ("ADMIN", "INTERVIEW_PENDING_REVIEW") not in fake_mentoring.notifications
    assert client.post(f"/api/ai/admin/verification/applications/{iv['applicationId']}/round1-review",
                       json={"decision": "PASS"}, headers=ADMIN).status_code == 409
    upload_video(client, mentor_id, iv["id"])
    finish_video(client, mentor_id, iv["id"])
    assert status_of(client, mentor_id)["status"] == "ROUND1_REVIEW"
    assert ("ADMIN", "INTERVIEW_PENDING_REVIEW") in fake_mentoring.notifications

    other = uuid.uuid4()
    iv2 = start_iv(client, other)
    upload_video(client, other, iv2["id"])
    finish_video(client, other, iv2["id"])
    assert status_of(client, other)["status"] == "ROUND1"  # video xong trước, chờ bản chép lời
    post_transcript(client, other, iv2)
    assert status_of(client, other)["status"] == "ROUND1_REVIEW"


def test_forgotten_finish_is_closed_by_the_maintenance_job(client, db, fake_profile, fake_mentoring, mentor_id):
    iv = start_iv(client, mentor_id)
    post_transcript(client, mentor_id, iv)
    upload_video(client, mentor_id, iv["id"])
    assert client.portal.call(video_service.maintenance_once) == (0, 0)  # chưa quá thời gian chờ
    asyncio.run(_sql("UPDATE interviews SET completed_at = now() - interval '1 hour' WHERE id = $1::uuid", iv["id"]))
    assert client.portal.call(video_service.maintenance_once) == (1, 0)
    assert status_of(client, mentor_id)["status"] == "ROUND1_REVIEW"
    assert admin_view(client, iv["id"])["video"]["finished"] is True


# ---------- cờ camera ----------

def test_camera_gap_flags_the_interview_and_forces_needs_review(client, db, fake_profile, fake_mentoring, mentor_id):
    iv = start_iv(client, mentor_id)
    headers = auth(mentor_id, "MENTOR")
    for n, start_ms in enumerate((0, 10_000, 50_000, 60_000)):  # trống 30 giây giữa đoạn 2 và 3
        client.put(f"/api/ai/verification/videos/{iv['id']}/chunks/{n}", params={"startMs": start_ms, "durMs": 10_000},
                   content=b"v%d" % n, headers=headers)
    post_transcript(client, mentor_id, iv)
    finish_video(client, mentor_id, iv["id"])
    view = admin_view(client, iv["id"])
    assert view["video"]["gapDetected"] is True and view["video"]["gapTotalSeconds"] == 30
    assert view["video"]["flags"] == ["CAMERA_OFF"] and view["flagged"] is True
    assert view["recommendation"] == "NEEDS_REVIEW"  # điểm cao nhưng có cờ
    assert status_of(client, mentor_id)["status"] == "ROUND1_REVIEW"
    mine = client.get(f"/api/ai/interviews/{iv['id']}", headers=headers).json()
    assert mine["video"]["flags"] == [] and mine["video"]["serverTranscript"] is None  # cờ chỉ admin


def test_losing_the_camera_for_over_a_minute_invalidates_the_attempt(client, db, fake_profile, fake_mentoring, fake_audit, mentor_id):
    iv = start_iv(client, mentor_id)
    headers = auth(mentor_id, "MENTOR")
    for n, start_ms in enumerate((0, 10_000, 100_000)):  # trống 80 giây > VIDEO_RECONNECT_SECONDS
        client.put(f"/api/ai/verification/videos/{iv['id']}/chunks/{n}", params={"startMs": start_ms, "durMs": 10_000},
                   content=b"v%d" % n, headers=headers)
    post_transcript(client, mentor_id, iv)
    finish_video(client, mentor_id, iv["id"])
    assert admin_view(client, iv["id"])["status"] == "INVALIDATED"
    s = status_of(client, mentor_id)
    assert s["status"] == "ROUND1" and s["attemptsUsed"] == 1 and s["attemptsLeft"] == 1 and s["canStart"]
    assert fake_profile.verifications[-1] == (mentor_id, "PENDING_INTERVIEW")
    assert any(r["action"] == "INTERVIEW_INVALIDATED" for r in fake_audit.records)
    assert ("ADMIN", "INTERVIEW_PENDING_REVIEW") not in fake_mentoring.notifications


# ---------- chép lời lại phía server ----------

class FakeTranscriber:
    def __init__(self, text=None, status=200):
        self.text, self.status = text, status
        self.requests: list[httpx.Request] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.status != 200:
            return httpx.Response(self.status, json={"error": {"message": "nope"}})
        return httpx.Response(200, json={"text": self.text})


@pytest.fixture
def transcriber(monkeypatch):
    def install(text=None, status=200) -> FakeTranscriber:
        fake = FakeTranscriber(text, status)
        monkeypatch.setattr(config, "OPENAI_API_KEY", "sk-test")
        monkeypatch.setattr(voice, "TRANSPORT", httpx.MockTransport(fake.handler))
        return fake
    return install


def test_matching_server_transcript_is_ok(client, db, fake_profile, fake_mentoring, mentor_id, transcriber):
    iv = start_iv(client, mentor_id)
    fake = transcriber(" ".join([STRONG_ANSWER] * iv["maxTurns"]))
    submit(client, iv, mentor_id)
    video = admin_view(client, iv["id"])["video"]
    assert video["transcriptCheck"] == "OK" and video["transcriptDiff"] == 0 and video["flags"] == []
    assert video["serverTranscript"].startswith("Toi dung Redis")
    req = fake.requests[0]
    assert req.url.path.endswith("/audio/transcriptions") and req.headers["Authorization"] == "Bearer sk-test"
    assert b"audio.webm" in req.content and b"gpt-4o-transcribe" in req.content


def test_different_server_transcript_raises_a_mismatch_flag(client, db, fake_profile, fake_mentoring, mentor_id, transcriber):
    iv = start_iv(client, mentor_id)
    transcriber("nội dung hoàn toàn khác với những gì trình duyệt đã gửi lên ai-service trước đó")
    submit(client, iv, mentor_id)
    view = admin_view(client, iv["id"])
    assert view["video"]["transcriptCheck"] == "MISMATCH" and view["video"]["transcriptDiff"] > config.TRANSCRIPT_MISMATCH_THRESHOLD
    assert view["video"]["flags"] == ["TRANSCRIPT_MISMATCH"] and view["recommendation"] == "NEEDS_REVIEW" and view["flagged"]
    assert status_of(client, mentor_id)["status"] == "ROUND1_REVIEW"  # cờ không tự loại mentor


def test_transcription_failure_is_unavailable_and_does_not_block(client, db, fake_profile, fake_mentoring, mentor_id, transcriber):
    iv = start_iv(client, mentor_id)
    transcriber(status=500)
    submit(client, iv, mentor_id)
    video = admin_view(client, iv["id"])["video"]
    assert video["transcriptCheck"] == "UNAVAILABLE" and video["flags"] == [] and video["serverTranscript"] is None
    assert status_of(client, mentor_id)["status"] == "ROUND1_REVIEW"


def test_without_an_openai_key_the_recheck_is_unavailable(client, db, fake_profile, fake_mentoring, mentor_id):
    iv = start_iv(client, mentor_id)
    submit(client, iv, mentor_id)
    assert admin_view(client, iv["id"])["video"]["transcriptCheck"] == "UNAVAILABLE"


# ---------- phát lại ----------

def play_url(client, headers, interview_id):
    res = client.post(f"/api/ai/verification/videos/{interview_id}/play-token", headers=headers)
    assert res.status_code == 200, res.text
    return res.json()["url"]


def test_admin_and_owner_can_stream_with_range_and_others_cannot(client, db, fake_profile, fake_mentoring, fake_audit, mentor_id):
    iv = start_iv(client, mentor_id)
    submit(client, iv, mentor_id)
    mine = auth(mentor_id, "MENTOR")

    url = play_url(client, ADMIN, iv["id"])
    full = client.get(url)
    assert full.status_code == 200 and full.content == b"webm-bytes-0webm-bytes-1" and full.headers["accept-ranges"] == "bytes"
    part = client.get(url, headers={"Range": "bytes=2-6"})
    assert part.status_code == 206 and part.content == b"bm-by" and part.headers["content-range"] == "bytes 2-6/24"
    assert any(r["action"] == "VIDEO_VIEWED" and r["actorRole"] == "ADMIN" for r in fake_audit.records)

    assert client.get(play_url(client, mine, iv["id"])).status_code == 200  # mentor xem video của chính mình
    assert client.post(f"/api/ai/verification/videos/{iv['id']}/play-token", headers=auth(uuid.uuid4(), "MENTOR")).status_code == 403
    assert client.get(f"/api/ai/verification/videos/{iv['id']}/stream", params={"token": "garbage"}).status_code == 401
    other = start_iv(client, uuid.uuid4())
    token = url.split("token=")[1]
    assert client.get(f"/api/ai/verification/videos/{other['id']}/stream", params={"token": token}).status_code == 401  # token của video khác


def test_video_must_be_finished_before_it_can_be_played(client, db, fake_profile, mentor_id):
    iv = start_iv(client, mentor_id)
    res = client.post(f"/api/ai/verification/videos/{iv['id']}/play-token", headers=ADMIN)
    assert res.status_code == 404 and res.json()["error"]["code"] == "VIDEO_NOT_FOUND"


# ---------- xoá và hạn lưu ----------

def test_admin_deletes_the_video_but_the_evidence_stays(client, db, fake_profile, fake_mentoring, fake_audit, mentor_id, transcriber):
    iv = start_iv(client, mentor_id)
    transcriber(" ".join([STRONG_ANSWER] * iv["maxTurns"]))
    submit(client, iv, mentor_id)
    url = play_url(client, ADMIN, iv["id"])
    assert client.delete(f"/api/ai/admin/verification/videos/{iv['id']}", headers=auth(mentor_id, "MENTOR")).status_code == 403
    res = client.delete(f"/api/ai/admin/verification/videos/{iv['id']}", headers=ADMIN)
    assert res.status_code == 200 and res.json()["deletedAt"] and res.json()["available"] is False
    assert res.json()["transcriptCheck"] == "OK" and res.json()["serverTranscript"]  # căn cứ vẫn còn
    assert client.get(url).status_code == 410
    assert client.post(f"/api/ai/verification/videos/{iv['id']}/play-token", headers=ADMIN).status_code == 410
    assert any(r["action"] == "VIDEO_DELETED" for r in fake_audit.records)
    assert client.delete(f"/api/ai/admin/verification/videos/{iv['id']}", headers=ADMIN).status_code == 200  # xoá lại: không lỗi


def test_expired_videos_are_purged_by_the_job(client, db, fake_profile, fake_mentoring, fake_audit, mentor_id):
    iv = start_iv(client, mentor_id)
    submit(client, iv, mentor_id)
    url = play_url(client, ADMIN, iv["id"])
    asyncio.run(_sql("UPDATE interview_videos SET expires_at = now() - interval '1 day' WHERE interview_id = $1::uuid", iv["id"]))
    assert client.portal.call(video_service.maintenance_once) == (0, 1)
    assert admin_view(client, iv["id"])["video"]["deletedAt"] is not None
    assert client.get(url).status_code == 410
    assert any(r["action"] == "VIDEO_EXPIRED" for r in fake_audit.records)


def test_retention_is_60_days_from_finish(client, db, fake_profile, fake_mentoring, mentor_id):
    iv = start_iv(client, mentor_id)
    submit(client, iv, mentor_id)
    days = asyncio.run(_sql("SELECT EXTRACT(EPOCH FROM (expires_at - finished_at)) / 86400 FROM interview_videos WHERE interview_id = $1::uuid", iv["id"]))
    assert round(days) == 60
