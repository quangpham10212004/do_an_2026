"""PROTOTYPE — phỏng vấn giọng nói: tạo phiên OpenAI Realtime, gộp bản ghi theo chủ đề, chấm bằng engine hiện có."""
import asyncio
import json
import uuid

import httpx
import pytest

from app import config
from app.interview import voice
from app.interview.voice import TranscriptItem
from app.security import AuthUser
from tests.conftest import auth
from tests.test_interview_flow import STRONG_ANSWER, WEAK_ANSWER


def items(*raw):
    return [TranscriptItem(**r) for r in raw]


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
    topics = voice.plan_topics(mentor)
    text = voice.build_instructions(mentor, topics)
    assert len(topics) == config.VOICE_INTERVIEW_TOPICS
    assert all(t.question in text for t in topics)
    assert "begin_topic" in text and "end_interview" in text and "KHÔNG gợi ý đáp án" in text


def test_session_needs_an_openai_key(client, fake_profile, monkeypatch):
    monkeypatch.setattr(config, "OPENAI_API_KEY", "")
    res = client.post("/api/ai/voice-interviews/session", headers=auth(uuid.uuid4(), "MENTOR"))
    assert res.status_code == 503 and res.json()["error"]["code"] == "VOICE_UNAVAILABLE"


def test_session_mints_a_client_secret_without_leaking_the_key(fake_profile, monkeypatch):
    monkeypatch.setattr(config, "OPENAI_API_KEY", "sk-test")
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["path"], seen["auth"] = request.url.path, request.headers["Authorization"]
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"value": "ek_123", "expires_at": 1792000000, "session": {}})

    user = AuthUser(user_id=uuid.uuid4(), email="m@test.local", role="MENTOR")
    view = asyncio.run(voice.create_session(user, httpx.MockTransport(handler)))
    assert view.client_secret == "ek_123" and len(view.topics) == config.VOICE_INTERVIEW_TOPICS
    assert seen["path"] == "/v1/realtime/client_secrets" and seen["auth"] == "Bearer sk-test"
    session = seen["body"]["session"]
    assert session["type"] == "realtime" and {t["name"] for t in session["tools"]} == {"begin_topic", "end_interview"}
    assert session["audio"]["input"]["transcription"]["model"] == config.OPENAI_TRANSCRIBE_MODEL


def test_session_reports_openai_errors_as_502(fake_profile, monkeypatch):
    monkeypatch.setattr(config, "OPENAI_API_KEY", "sk-test")
    user = AuthUser(user_id=uuid.uuid4(), email="m@test.local", role="MENTOR")
    with pytest.raises(Exception) as e:
        asyncio.run(voice.create_session(user, httpx.MockTransport(lambda r: httpx.Response(401, json={}))))
    assert e.value.code == "VOICE_UNAVAILABLE" and e.value.status == 502


def test_grade_scores_each_topic_with_the_existing_engine(client, fake_profile):
    body = {"items": [
        {"role": "marker", "topicNo": 1}, {"role": "assistant", "text": "Câu hỏi 1"}, {"role": "user", "text": STRONG_ANSWER},
        {"role": "marker", "topicNo": 2}, {"role": "assistant", "text": "Câu hỏi 2"}, {"role": "user", "text": WEAK_ANSWER},
        {"role": "marker", "topicNo": 3}, {"role": "assistant", "text": "Câu hỏi 3"},
    ]}
    res = client.post("/api/ai/voice-interviews/grade", json=body, headers=auth(uuid.uuid4(), "MENTOR"))
    assert res.status_code == 200, res.text
    out = res.json()
    assert out["engine"] == "RULE_BASED" and len(out["turns"]) == 3
    assert out["turns"][0]["score"] > out["turns"][1]["score"]
    assert out["turns"][2]["answer"] == voice.NO_ANSWER
    assert 0 <= out["assessment"]["overallScore"] <= 100 and out["assessment"]["recommendation"]


def test_grade_rejects_a_transcript_without_topics(client, fake_profile):
    res = client.post("/api/ai/voice-interviews/grade", json={"items": [{"role": "user", "text": "xin chào"}]},
                      headers=auth(uuid.uuid4(), "MENTOR"))
    assert res.status_code == 400 and res.json()["error"]["code"] == "EMPTY_TRANSCRIPT"
