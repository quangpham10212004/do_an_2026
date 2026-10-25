"""FR-7.7 — AI Interview của mentor bằng giọng nói."""
import asyncio
import json
import uuid

import asyncpg
import httpx
import pytest

from app import config
from app.interview import planner, voice
from app.interview.voice import TranscriptItem
from tests.conftest import auth
from tests.test_interview_flow import STRONG_ANSWER, WEAK_ANSWER, finish


def items(*raw):
    return [TranscriptItem(**r) for r in raw]


@pytest.fixture
def mentor_id():
    return uuid.uuid4()


def start_voice(client, mentor_id, ack=True, consent=True):
    return client.post("/api/ai/interviews/voice", json={"selfAnswerAcknowledged": ack, "consentExternalAi": consent},
                       headers=auth(mentor_id, "MENTOR"))


TRANSCRIPT = {"items": [
    {"role": "assistant", "text": "Xin chào, buổi phỏng vấn gồm 4 chủ đề."},
    {"role": "marker", "topicNo": 1}, {"role": "assistant", "text": "Câu hỏi 1"}, {"role": "user", "text": STRONG_ANSWER},
    {"role": "assistant", "text": "Câu đào sâu 1"}, {"role": "user", "text": "Toi dung ETag va versioning."},
    {"role": "marker", "topicNo": 2}, {"role": "assistant", "text": "Câu hỏi 2"}, {"role": "user", "text": WEAK_ANSWER},
    {"role": "marker", "topicNo": 3}, {"role": "assistant", "text": "Câu hỏi 3"},
]}


def post_transcript(client, mentor_id, interview_id, body=TRANSCRIPT):
    return client.post(f"/api/ai/interviews/{interview_id}/voice-transcript", json=body,
                       headers=auth(mentor_id, "MENTOR"))


async def _count(sql, *args):
    conn = await asyncpg.connect(config.AI_DB_URL)
    try:
        return await conn.fetchval(sql, *args)
    finally:
        await conn.close()


async def _age(interview_id, minutes):
    conn = await asyncpg.connect(config.AI_DB_URL)
    try:
        await conn.execute("UPDATE interviews SET created_at = created_at - make_interval(mins => $2) WHERE id = $1::uuid",
                           interview_id, minutes)
    finally:
        await conn.close()


class FakeOpenAI:
    def __init__(self, status=200):
        self.status = status
        self.requests: list[httpx.Request] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.status != 200:
            return httpx.Response(self.status, json={"error": {"message": "nope"}})
        return httpx.Response(200, json={"value": f"ek_{len(self.requests)}", "expires_at": 1792000000, "session": {}})


@pytest.fixture
def openai(monkeypatch) -> FakeOpenAI:
    fake = FakeOpenAI()
    monkeypatch.setattr(config, "OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(voice, "TRANSPORT", httpx.MockTransport(fake.handler))
    return fake


# ---------- gộp bản ghi & lời dặn ----------

def test_group_by_topic_keeps_follow_ups_inside_their_topic():
    grouped = voice.group_by_topic(items(
        {"role": "assistant", "text": "Xin chào, buổi phỏng vấn gồm 4 chủ đề."},
        {"role": "user", "text": "Chào bạn."},
        {"role": "marker", "topic_no": 1},
        {"role": "assistant", "text": "Bạn thiết kế REST API thế nào?"},
        {"role": "user", "text": "Tôi dùng resource số nhiều."},
        {"role": "assistant", "text": "Còn versioning?"},
        {"role": "user", "text": "Tôi để version trong URL."},
        {"role": "marker", "topic_no": 2},
        {"role": "assistant", "text": "Bạn chọn index thế nào?"},
        {"role": "user", "text": "   "},
    ))
    assert [(t.topic_no, t.questions, t.answers) for t in grouped] == [
        (1, ["Bạn thiết kế REST API thế nào?", "Còn versioning?"], ["Tôi dùng resource số nhiều.", "Tôi để version trong URL."]),
        (2, ["Bạn chọn index thế nào?"], []),
    ]


def test_group_by_topic_merges_a_repeated_marker_and_drops_topics_never_asked():
    grouped = voice.group_by_topic(items(
        {"role": "marker", "topic_no": 1}, {"role": "assistant", "text": "Câu 1"}, {"role": "user", "text": "A"},
        {"role": "marker", "topic_no": 1}, {"role": "user", "text": "B"},
        {"role": "marker", "topic_no": 3},
    ))
    assert [(t.topic_no, t.answers) for t in grouped] == [(1, ["A", "B"])]


def test_instructions_carry_the_plan_and_the_no_help_rules():
    mentor = {"domain": "backend", "skills": ["Java"], "yearsExperience": 8}
    topics = planner.mentor_bank_plan("backend", ["Java"]).topics
    text = voice.build_instructions(mentor, topics)
    assert len(topics) == config.VOICE_INTERVIEW_TOPICS
    assert all(t.question in text for t in topics)
    assert "begin_topic" in text and "end_interview" in text and "KHÔNG gợi ý đáp án" in text


def test_prototype_routes_are_gone(client, fake_profile):
    for path in ("/api/ai/voice-interviews/session", "/api/ai/voice-interviews/grade"):
        assert client.post(path, json={}, headers=auth(uuid.uuid4(), "MENTOR")).status_code in (404, 405)


# ---------- bắt đầu ----------

def test_voice_requires_consent_and_self_answer(client, db, fake_profile, mentor_id):
    res = start_voice(client, mentor_id, consent=False)
    assert res.status_code == 400 and res.json()["error"]["code"] == "VOICE_CONSENT_REQUIRED"
    res = start_voice(client, mentor_id, ack=False)
    assert res.status_code == 400 and res.json()["error"]["code"] == "SELF_ANSWER_ACK_REQUIRED"
    assert asyncio.run(_count("SELECT COUNT(*) FROM interviews")) == 0


def test_without_openai_key_outside_prod_the_interview_is_created_with_voice_null(client, db, fake_profile, mentor_id):
    res = start_voice(client, mentor_id)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["voice"] is None
    iv = body["interview"]
    assert iv["mode"] == "VOICE" and iv["status"] == "IN_PROGRESS" and iv["consentExternalAi"] is True
    assert iv["maxTurns"] == config.VOICE_INTERVIEW_TOPICS and iv["turns"] == [] and iv["resumeDeadline"]
    assert client.get("/api/ai/verification/status", headers=auth(mentor_id, "MENTOR")).json()["voiceAvailable"] is False


def test_without_openai_key_in_prod_returns_503_and_creates_nothing(client, db, fake_profile, mentor_id, monkeypatch):
    monkeypatch.setenv("APP_ENV", "prod")
    res = start_voice(client, mentor_id)
    assert res.status_code == 503 and res.json()["error"]["code"] == "VOICE_UNAVAILABLE"
    assert asyncio.run(_count("SELECT COUNT(*) FROM interviews")) == 0


def test_client_secret_is_minted_without_leaking_the_key(client, db, fake_profile, openai, mentor_id):
    res = start_voice(client, mentor_id)
    assert res.status_code == 200, res.text
    v = res.json()["voice"]
    assert v["clientSecret"] == "ek_1" and len(v["topics"]) == config.VOICE_INTERVIEW_TOPICS and v["model"] == config.OPENAI_REALTIME_MODEL
    assert "sk-test" not in res.text
    req = openai.requests[0]
    assert req.url.path == "/v1/realtime/client_secrets" and req.headers["Authorization"] == "Bearer sk-test"
    session = json.loads(req.content)["session"]
    assert {t["name"] for t in session["tools"]} == {"begin_topic", "end_interview"}
    assert session["audio"]["input"]["transcription"]["model"] == config.OPENAI_TRANSCRIBE_MODEL


def test_openai_error_is_502_and_no_attempt_is_used(client, db, fake_profile, openai, mentor_id):
    openai.status = 401
    res = start_voice(client, mentor_id)
    assert res.status_code == 502 and res.json()["error"]["code"] == "VOICE_UNAVAILABLE"
    assert asyncio.run(_count("SELECT COUNT(*) FROM interviews")) == 0


def test_calling_again_within_30_minutes_reconnects_to_the_same_interview(client, db, fake_profile, openai, mentor_id):
    first = start_voice(client, mentor_id).json()
    again = start_voice(client, mentor_id).json()
    assert again["interview"]["id"] == first["interview"]["id"]
    assert again["voice"]["clientSecret"] == "ek_2" and again["voice"]["topics"] == first["voice"]["topics"]


def test_voice_after_30_minutes_without_transcript_is_abandoned_and_counts(client, db, fake_profile, fake_audit, mentor_id):
    first = start_voice(client, mentor_id).json()["interview"]
    asyncio.run(_age(first["id"], config.VOICE_SESSION_MINUTES + 1))
    e = client.get("/api/ai/verification/status", headers=auth(mentor_id, "MENTOR")).json()
    assert e["attemptsUsed"] == 1 and e["attemptsLeft"] == 1
    assert fake_audit.records[-1]["action"] == "INTERVIEW_ABANDONED"
    res = post_transcript(client, mentor_id, first["id"])
    assert res.status_code == 409 and res.json()["error"]["code"] == "INTERVIEW_ABANDONED"
    second = start_voice(client, mentor_id).json()["interview"]
    assert second["id"] != first["id"]


def test_voice_in_cooldown_after_rejection_is_blocked(client, db, fake_profile, fake_mentoring, mentor_id):
    interview = finish(client, mentor_id, text=WEAK_ANSWER)
    admin = auth(uuid.uuid4(), "ADMIN")
    res = client.post(f"/api/ai/admin/verification/applications/{interview['applicationId']}/round1-review",
                      json={"decision": "REJECT", "note": "Cần trả lời chi tiết hơn"}, headers=admin)
    assert res.status_code == 200, res.text
    res = start_voice(client, mentor_id)
    assert res.status_code == 409 and res.json()["error"]["code"] == "INTERVIEW_COOLDOWN" and res.json()["error"]["retryAfter"]


def test_voice_while_pending_review_is_blocked(client, db, fake_profile, fake_mentoring, mentor_id):
    finish(client, mentor_id)
    res = start_voice(client, mentor_id)
    assert res.status_code == 409 and res.json()["error"]["code"] == "INTERVIEW_PENDING_REVIEW"


def test_approved_mentor_cannot_start_another_voice_interview(client, db, fake_profile, fake_mentoring, mentor_id):
    """D6/D10 — bỏ luồng xin nâng cấp: mentor đã APPROVED không mở được buổi phỏng vấn mới."""
    interview = finish(client, mentor_id)
    admin = auth(uuid.uuid4(), "ADMIN")
    approved = client.post(f"/api/ai/admin/verification/applications/{interview['applicationId']}/round1-review",
                           json={"decision": "PASS", "note": None}, headers=admin)
    assert approved.status_code == 200 and approved.json()["status"] == "APPROVED"
    res = start_voice(client, mentor_id)
    assert res.status_code == 409 and res.json()["error"]["code"] == "ALREADY_APPROVED"


# ---------- bản ghi → PENDING_REVIEW ----------

def test_transcript_goes_to_pending_review(client, db, fake_profile, fake_mentoring, mentor_id):
    iv = start_voice(client, mentor_id).json()["interview"]
    res = post_transcript(client, mentor_id, iv["id"])
    assert res.status_code == 200, res.text
    done = res.json()
    assert done["status"] == "PENDING_REVIEW" and done["mode"] == "VOICE"
    assert done["overallScore"] is not None and done["summary"] and done["recommendation"]
    assert len(done["turns"]) == 3 and done["currentTurn"] == 3
    # PRD-AIV-5: mentor chưa thấy điểm từng câu khi admin chưa quyết định.
    assert all(t["score"] is None and t["feedback"] is None for t in done["turns"])
    assert done["turns"][0]["question"] == "Câu hỏi 1 / Câu đào sâu 1"
    assert done["turns"][0]["answer"] == STRONG_ANSWER + " Toi dung ETag va versioning."
    assert done["turns"][2]["answer"] == voice.NO_ANSWER
    assert (mentor_id, "PENDING_REVIEW") in fake_profile.verifications
    assert ("ADMIN", "INTERVIEW_PENDING_REVIEW") in fake_mentoring.notifications
    assert (str(mentor_id), "INTERVIEW_COMPLETED") in fake_mentoring.notifications

    admin_view = client.get(f"/api/ai/interviews/{iv['id']}", headers=auth(uuid.uuid4(), "ADMIN")).json()
    turns = admin_view["turns"]
    assert turns[0]["score"] > turns[1]["score"] and all(t["rubric"] for t in turns)
    assert turns[0]["engine"] == "RULE_BASED" and turns[0]["promptVersion"]
    assert admin_view["mode"] == "VOICE"
    # Gửi lại => buổi đã kết thúc.
    again = post_transcript(client, mentor_id, iv["id"])
    assert again.status_code == 409 and again.json()["error"]["code"] == "INTERVIEW_NOT_IN_PROGRESS"


def test_transcript_without_any_topic_is_rejected(client, db, fake_profile, mentor_id):
    iv = start_voice(client, mentor_id).json()["interview"]
    res = post_transcript(client, mentor_id, iv["id"], {"items": [{"role": "user", "text": "xin chào"},
                                                                 {"role": "marker", "topicNo": 9},
                                                                 {"role": "assistant", "text": "Câu ngoài kế hoạch"}]})
    assert res.status_code == 400 and res.json()["error"]["code"] == "EMPTY_TRANSCRIPT"


def test_transcript_rules_owner(client, db, fake_profile, fake_mentoring, mentor_id):
    iv = start_voice(client, mentor_id).json()["interview"]
    assert post_transcript(client, uuid.uuid4(), iv["id"]).status_code == 403


def test_transcript_after_session_window_is_rejected_without_waiting_for_the_sweep(client, db, fake_profile, fake_mentoring, mentor_id):
    iv = start_voice(client, mentor_id).json()["interview"]
    asyncio.run(_age(iv["id"], config.VOICE_SESSION_MINUTES + 1))
    res = post_transcript(client, mentor_id, iv["id"])
    assert res.status_code == 409 and res.json()["error"]["code"] == "INTERVIEW_ABANDONED"
