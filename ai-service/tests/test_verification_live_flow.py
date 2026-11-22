import asyncio
from uuid import uuid4

import asyncpg
import pytest

from app import config
from app.clients import profile
from tests.conftest import auth

ADMIN_ID = uuid4()
ADMIN = auth(ADMIN_ID, "ADMIN")
STRONG = ("Mình thiết kế REST API với resource là danh từ số nhiều, dùng status code 201 và 404 đúng nghĩa, có phân trang "
          "và version trong đường dẫn. Ví dụ trong dự án thực tế của công ty, đầu tiên mình định nghĩa idempotent key, "
          "sau đó đo benchmark giảm 40% thời gian phản hồi. Mình hướng dẫn junior bằng bài tập và code review.")


class FakeDomains:
    def __init__(self, mentor_id):
        self.mentor_id = mentor_id
        self.state = "PENDING"
        self.enrollment = str(uuid4())
        self.calls: list[dict] = []

    async def mentor_domains(self, mentor_id):
        return {"max": 3, "domains": [{"domain": "backend", "state": self.state}],
                "records": [{"domain": "backend", "id": self.enrollment}]}

    async def update_domain_verification(self, mentor_id, domain, body):
        self.calls.append(body)
        if body.get("state") == "VERIFIED":
            self.state = "VERIFIED"


@pytest.fixture
def live(db, fake_profile, fake_mentoring, monkeypatch):
    async def wipe():
        conn = await asyncpg.connect(config.AI_DB_URL)
        try:
            await conn.execute("TRUNCATE mentor_live_results, mentor_live_answers, mentor_live_interviews, "
                               "mentor_assessment_tracks RESTART IDENTITY CASCADE")
        finally:
            await conn.close()
    asyncio.run(wipe())
    mentor_id = uuid4()
    domains = FakeDomains(mentor_id)
    monkeypatch.setattr(profile, "mentor_domains", domains.mentor_domains)
    monkeypatch.setattr(profile, "update_domain_verification", domains.update_domain_verification)
    return mentor_id, domains


def headers(mentor_id):
    return auth(mentor_id, "MENTOR")


def begin(client, mentor_id):
    status = client.get("/api/ai/verification/status", headers=headers(mentor_id))
    assert status.status_code == 200, status.text
    body = status.json()
    track = body["tracks"][0]
    started = client.post("/api/ai/verification/interviews", headers=headers(mentor_id),
                          json={"trackId": track["id"], "consent": True})
    assert started.status_code == 200, started.text
    return body, track, started.json()


def answer_all(client, mentor_id, interview, transcript, media=b"fake-webm-bytes"):
    current = interview
    while current["question"]:
        files = {"media": ("answer.webm", media, "video/webm")} if media else None
        res = client.post(f"/api/ai/verification/interviews/{current['id']}/answers", headers=headers(mentor_id),
                          data={"questionId": current["question"]["id"], "transcript": transcript,
                                "durationSeconds": "42"}, files=files)
        assert res.status_code == 200, res.text
        current = res.json()
    return current


def test_status_lists_the_domain_with_rules_and_ready_stage(client, live):
    mentor_id, _ = live
    body = client.get("/api/ai/verification/status", headers=headers(mentor_id)).json()
    assert [t["stage"] for t in body["tracks"]] == ["READY"]
    assert body["maxDomains"] == 3 and "mobile" in body["availableDomains"] and "backend" not in body["availableDomains"]
    assert body["rules"]["passScore"] == 3.5 and len(body["rules"]["topics"]) == 5


def test_start_requires_consent_and_resumes_the_open_interview(client, live):
    mentor_id, _ = live
    track = client.get("/api/ai/verification/status", headers=headers(mentor_id)).json()["tracks"][0]
    refused = client.post("/api/ai/verification/interviews", headers=headers(mentor_id),
                          json={"trackId": track["id"], "consent": False})
    assert refused.status_code == 400 and refused.json()["error"]["code"] == "VIDEO_CONSENT_REQUIRED"
    first = client.post("/api/ai/verification/interviews", headers=headers(mentor_id),
                        json={"trackId": track["id"], "consent": True}).json()
    again = client.post("/api/ai/verification/interviews", headers=headers(mentor_id),
                        json={"trackId": track["id"], "consent": True}).json()
    assert again["id"] == first["id"] and first["status"] == "IN_PROGRESS"
    assert first["question"]["topic"] == first["topics"][0] and first["turns"][0]["role"] == "ai"
    stage = client.get("/api/ai/verification/status", headers=headers(mentor_id)).json()["tracks"][0]
    assert stage["stage"] == "IN_PROGRESS" and stage["interviewId"] == first["id"] and stage["progressLabel"] == "Chủ đề 1/5"


def test_other_mentors_cannot_read_or_answer(client, live):
    mentor_id, _ = live
    _, _, interview = begin(client, mentor_id)
    stranger = headers(uuid4())
    assert client.get(f"/api/ai/verification/interviews/{interview['id']}", headers=stranger).status_code == 404
    wrong = client.post(f"/api/ai/verification/interviews/{interview['id']}/answers", headers=headers(mentor_id),
                        data={"questionId": str(uuid4()), "transcript": "x", "durationSeconds": "5"})
    assert wrong.status_code == 409 and wrong.json()["error"]["code"] == "QUESTION_MISMATCH"


def test_heartbeat_only_lowers_the_clock(client, live):
    mentor_id, _ = live
    _, _, interview = begin(client, mentor_id)
    url = f"/api/ai/verification/interviews/{interview['id']}"
    assert client.post(url + "/heartbeat", headers=headers(mentor_id), json={"remainingSeconds": 900}).status_code == 204
    assert client.get(url, headers=headers(mentor_id)).json()["remainingSeconds"] == 900
    client.post(url + "/heartbeat", headers=headers(mentor_id), json={"remainingSeconds": 5000})
    assert client.get(url, headers=headers(mentor_id)).json()["remainingSeconds"] == 900


def test_unreadable_answers_go_to_admin_who_approves(client, live):
    mentor_id, domains = live
    _, track, interview = begin(client, mentor_id)
    finished = answer_all(client, mentor_id, interview, "")
    assert finished["question"] is None and finished["turns"][-1]["role"] == "ai"
    result = client.post(f"/api/ai/verification/interviews/{interview['id']}/submit", headers=headers(mentor_id))
    assert result.status_code == 200, result.text
    result = result.json()
    assert result["outcome"] == "UNCLEAR" and result["decidedBy"] is None and result["totalScore"] == 0
    assert client.post(f"/api/ai/verification/interviews/{interview['id']}/submit",
                       headers=headers(mentor_id)).json()["id"] == result["id"]  # nộp lại không tạo kết quả mới
    assert domains.calls[-1] == {"state": "PENDING", "stage": "ADMIN", "testScore": 0.0, **{
        k: v for k, v in domains.calls[-1].items() if k == "profileDomainId"}}
    blocked = client.post("/api/ai/verification/interviews", headers=headers(mentor_id),
                          json={"trackId": track["id"], "consent": True})
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "INTERVIEW_PENDING_REVIEW"

    queue = client.get("/api/ai/admin/verification/queue?filter=UNCLEAR", headers=ADMIN).json()
    assert queue["stats"]["unclear"] == 1 and queue["counts"] == {"UNCLEAR": 1, "DECIDED": 0}
    item = queue["items"][0]
    assert item["id"] == result["id"] and item["status"] == "UNCLEAR" and item["recommendation"] == "REVIEW"

    detail = client.get(f"/api/ai/admin/verification/{item['id']}", headers=ADMIN).json()
    assert len(detail["answers"]) == 5 and detail["attempt"] == "Lần 1" and detail["decision"] is None
    video = detail["answers"][0]["videoUrl"]
    assert video and "token=" in video
    streamed = client.get(video, headers={"Range": "bytes=0-3"})
    assert streamed.status_code == 206 and streamed.content == b"fake"
    assert client.get(video.split("?")[0] + "?token=bad").status_code == 401

    no_video = client.post(f"/api/ai/admin/verification/{item['id']}/decision", headers=ADMIN,
                           json={"decision": "APPROVE", "note": "", "reviewedVideo": False})
    assert no_video.status_code == 422
    short = client.post(f"/api/ai/admin/verification/{item['id']}/decision", headers=ADMIN,
                        json={"decision": "REJECT", "note": "ngắn", "reviewedVideo": True})
    assert short.status_code == 422
    approved = client.post(f"/api/ai/admin/verification/{item['id']}/decision", headers=ADMIN,
                           json={"decision": "APPROVE", "note": "Đã nghe video, đạt.", "reviewedVideo": True})
    assert approved.status_code == 204
    assert client.post(f"/api/ai/admin/verification/{item['id']}/decision", headers=ADMIN,
                       json={"decision": "APPROVE", "note": "", "reviewedVideo": True}).status_code == 204
    assert client.post(f"/api/ai/admin/verification/{item['id']}/decision", headers=ADMIN,
                       json={"decision": "REJECT", "note": "Đổi ý sau khi quyết định", "reviewedVideo": True}
                       ).status_code == 409

    assert domains.calls[-1]["state"] == "VERIFIED"
    final = client.get(f"/api/ai/verification/results/{result['id']}", headers=headers(mentor_id)).json()
    assert final["outcome"] == "PASSED" and final["decidedBy"] == "ADMIN" and final["adminNote"] == "Đã nghe video, đạt."
    status = client.get("/api/ai/verification/status", headers=headers(mentor_id)).json()["tracks"][0]
    assert status["stage"] == "PASSED" and status["resultId"] == result["id"]
    history = client.get("/api/ai/verification/history", headers=headers(mentor_id)).json()
    assert [(h["outcome"], h["domain"]) for h in history] == [("PASSED", "backend")]
    decided = client.get("/api/ai/admin/verification/queue?filter=DECIDED", headers=ADMIN).json()
    assert decided["stats"]["approvedThisMonth"] == 1 and decided["items"][0]["status"] == "APPROVED"


def test_admin_rejection_sets_retry_date_and_blocks_restart(client, live):
    mentor_id, domains = live
    _, track, interview = begin(client, mentor_id)
    answer_all(client, mentor_id, interview, "", media=None)
    result = client.post(f"/api/ai/verification/interviews/{interview['id']}/submit", headers=headers(mentor_id)).json()
    detail = client.get(f"/api/ai/admin/verification/{result['id']}", headers=ADMIN).json()
    assert all(a["videoUrl"] is None for a in detail["answers"])
    rejected = client.post(f"/api/ai/admin/verification/{result['id']}/decision", headers=ADMIN,
                           json={"decision": "REJECT", "note": "Thiếu ví dụ thực tế ở mọi chủ đề.", "reviewedVideo": False})
    assert rejected.status_code == 204
    final = client.get(f"/api/ai/verification/results/{result['id']}", headers=headers(mentor_id)).json()
    assert final["outcome"] == "FAILED" and final["retryAt"] and final["improvements"]
    assert domains.calls[-1]["state"] == "REJECTED"
    again = client.post("/api/ai/verification/interviews", headers=headers(mentor_id),
                        json={"trackId": track["id"], "consent": True})
    assert again.status_code == 409 and again.json()["error"]["code"] == "INTERVIEW_COOLDOWN"
    assert again.json()["error"]["retryAt"] == final["retryAt"]


def test_a_good_spoken_interview_can_pass_without_an_admin(client, live):
    mentor_id, domains = live
    _, _, interview = begin(client, mentor_id)
    answer_all(client, mentor_id, interview, STRONG, media=None)
    result = client.post(f"/api/ai/verification/interviews/{interview['id']}/submit", headers=headers(mentor_id)).json()
    assert result["outcome"] in {"PASSED", "UNCLEAR"} and result["totalScore"] > 2.5
    if result["outcome"] == "PASSED":
        assert result["decidedBy"] == "AI" and domains.calls[-1]["state"] == "VERIFIED"
    assert {c["key"] for c in result["criteria"]} == {"knowledge", "depth", "communication", "mentoring"}


def test_expired_interview_is_closed_and_listed_as_incomplete(client, live):
    mentor_id, _ = live
    _, track, interview = begin(client, mentor_id)

    async def age():
        conn = await asyncpg.connect(config.AI_DB_URL)
        try:
            await conn.execute("UPDATE mentor_live_interviews SET resume_deadline=now()-interval '1 minute'")
        finally:
            await conn.close()
    asyncio.run(age())
    expired = client.get(f"/api/ai/verification/interviews/{interview['id']}", headers=headers(mentor_id)).json()
    assert expired["status"] == "EXPIRED" and expired["question"] is None
    stage = client.get("/api/ai/verification/status", headers=headers(mentor_id)).json()["tracks"][0]
    assert stage["stage"] == "EXPIRED"
    history = client.get("/api/ai/verification/history", headers=headers(mentor_id)).json()
    assert [h["outcome"] for h in history] == ["INCOMPLETE"] and history[0]["totalScore"] is None
    restart = client.post("/api/ai/verification/interviews", headers=headers(mentor_id),
                          json={"trackId": track["id"], "consent": True})
    assert restart.status_code == 200 and restart.json()["id"] != interview["id"]


def test_mentors_and_admins_are_separated(client, live):
    mentor_id, _ = live
    assert client.get("/api/ai/admin/verification/queue", headers=headers(mentor_id)).status_code == 403
    assert client.get("/api/ai/verification/status", headers=ADMIN).status_code == 403
