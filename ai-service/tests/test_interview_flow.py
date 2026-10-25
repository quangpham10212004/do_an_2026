"""Luồng AI Interview của mentor (phỏng vấn giọng nói) end-to-end trong ai-service."""
import uuid

import pytest

from tests.conftest import auth

STRONG_ANSWER = (
    "Toi dung Redis theo cache-aside voi TTL va invalidation khi ghi. Trong du an thuc te latency giam tu 300ms "
    "xuong 40ms. Toi can nhac trade-off giua consistency va hieu nang, dung index, transaction, REST API "
    "versioning, status code 201/404, pagination va idempotent. Vi du cu the o production."
)
WEAK_ANSWER = "Khong biet, em chua lam bao gio va cung khong nho gi ca."


@pytest.fixture
def mentor_id():
    return uuid.uuid4()


def start(client, mentor_id, ack=True, consent=True, video=True):
    """POST /api/ai/interviews/voice — trả response ({interview, voice})."""
    return client.post("/api/ai/interviews/voice",
                       json={"selfAnswerAcknowledged": ack, "consentExternalAi": consent, "consentVideo": video},
                       headers=auth(mentor_id, "MENTOR"))


def start_iv(client, mentor_id):
    res = start(client, mentor_id)
    assert res.status_code == 200, res.text
    return res.json()["interview"]


def transcript(topics, text=STRONG_ANSWER):
    """Bản ghi như trình duyệt gửi: mỗi chủ đề = marker + câu hỏi + câu trả lời."""
    items = [{"role": "assistant", "text": "Xin chào, chúng ta bắt đầu buổi phỏng vấn nhé."}]
    for n in range(1, topics + 1):
        items += [{"role": "marker", "topicNo": n}, {"role": "assistant", "text": f"Câu hỏi chủ đề {n}?"},
                  {"role": "user", "text": text}]
    return {"items": items}


def upload_video(client, mentor_id, interview_id, chunks=2, start_at=0):
    """Tải `chunks` đoạn video + âm thanh liên tiếp (mỗi đoạn 10 giây) như trình duyệt, bắt đầu từ `start_at` ms."""
    headers = {**auth(mentor_id, "MENTOR"), "Content-Type": "video/webm"}
    for n in range(chunks):
        params = {"startMs": start_at + n * 10_000, "durMs": 10_000}
        for kind in ("chunks", "audio-chunks"):
            res = client.put(f"/api/ai/verification/videos/{interview_id}/{kind}/{n}", params=params,
                             content=b"webm-bytes-%d" % n, headers=headers)
            assert res.status_code == 204, res.text


def finish_video(client, mentor_id, interview_id):
    res = client.post(f"/api/ai/verification/videos/{interview_id}/finish", headers=auth(mentor_id, "MENTOR"))
    assert res.status_code == 200, res.text
    return res.json()


def submit(client, interview, mentor_id, text=STRONG_ANSWER, body=None, video=True):
    """Nộp bản chép lời rồi (mặc định) tải + chốt video như trình duyệt => đợt sang ROUND1_REVIEW."""
    res = client.post(f"/api/ai/interviews/{interview['id']}/voice-transcript",
                      json=body or transcript(interview["maxTurns"], text), headers=auth(mentor_id, "MENTOR"))
    assert res.status_code == 200, res.text
    if video:
        upload_video(client, mentor_id, interview["id"])
        finish_video(client, mentor_id, interview["id"])
    return client.get(f"/api/ai/interviews/{interview['id']}", headers=auth(mentor_id, "MENTOR")).json()


def finish(client, mentor_id, text=STRONG_ANSWER):
    """Bắt đầu rồi nộp bản ghi => buổi PENDING_REVIEW."""
    return submit(client, start_iv(client, mentor_id), mentor_id, text)


def test_full_interview_flow(client, db, fake_profile, fake_mentoring, mentor_id):
    started = start(client, mentor_id)
    assert started.status_code == 200, started.text
    interview = started.json()["interview"]
    assert interview["status"] == "IN_PROGRESS" and interview["mode"] == "VOICE"
    assert interview["engine"] == "RULE_BASED"

    final = submit(client, interview, mentor_id)
    assert len(final["turns"]) == final["maxTurns"]
    assert final["status"] == "PENDING_REVIEW"
    assert final["overallScore"] is not None and final["summary"]
    # US-43 (PRD-AIV-5): hoàn thành nhưng chờ admin → điểm từng câu vẫn ẩn với mentor (tổng điểm thì có).
    assert all(t["score"] is None and t["feedback"] is None for t in final["turns"])
    assert final["feedbackVisible"] is False and final["resumeDeadline"] is None
    assert (mentor_id, "PENDING_REVIEW") in fake_profile.verifications
    assert ("ADMIN", "INTERVIEW_PENDING_REVIEW") in fake_mentoring.notifications  # sau khi video xử lý xong


def test_admin_review_syncs_verification(client, db, fake_profile, fake_mentoring, mentor_id):
    interview = finish(client, mentor_id)

    admin = auth(uuid.uuid4(), "ADMIN")
    pending = client.get("/api/ai/admin/verification/applications?status=ROUND1_REVIEW", headers=admin).json()
    assert [a["id"] for a in pending] == [interview["applicationId"]]
    assert pending[0]["mentorName"] == "Mentor Test" and pending[0]["interview"]["id"] == interview["id"]

    path = f"/api/ai/admin/verification/applications/{interview['applicationId']}/round1-review"
    reviewed = client.post(path, json={"decision": "PASS", "note": "Tra loi tot"}, headers=admin)
    assert reviewed.status_code == 200, reviewed.text
    assert reviewed.json()["status"] == "APPROVED" and reviewed.json()["round1Decision"] == "PASS"
    assert fake_profile.verifications[-1] == (mentor_id, "APPROVED")
    assert client.get(f"/api/ai/interviews/{interview['id']}", headers=admin).json()["status"] == "PASSED"

    again = client.post(path, json={"decision": "PASS"}, headers=admin)
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "VERIFICATION_NOT_PENDING_REVIEW"


def test_stats_count_by_status(client, db, fake_profile, fake_mentoring, mentor_id):
    start(client, mentor_id)
    stats = client.get("/api/ai/admin/stats", headers=auth(uuid.uuid4(), "ADMIN")).json()
    assert stats == {"interviewsInProgress": 1, "interviewsPendingReview": 0,
                     "mentorsApproved": 0, "mentorsRejected": 0, "retakesRequested": 0,
                     "decisionsTotal": 0, "decisionsComparable": 0, "decisionsAgreeing": 0,
                     "decisionsOnNeedsReview": 0, "agreementRate": None}


def test_start_requires_mentor_profile(client, db, fake_profile, mentor_id):
    fake_profile.mentor = None
    res = start(client, mentor_id)
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "PROFILE_REQUIRED"


def test_start_twice_returns_the_open_interview(client, db, fake_profile, mentor_id):
    assert start_iv(client, mentor_id)["id"] == start_iv(client, mentor_id)["id"]


def test_cannot_submit_someone_elses_interview(client, db, fake_profile, mentor_id):
    interview = start_iv(client, mentor_id)
    res = client.post(f"/api/ai/interviews/{interview['id']}/voice-transcript", json=transcript(2),
                      headers=auth(uuid.uuid4(), "MENTOR"))
    assert res.status_code == 403


def test_chat_endpoints_are_gone(client, db, fake_profile, mentor_id):
    headers = auth(mentor_id, "MENTOR")
    assert client.post("/api/ai/interviews", json={"selfAnswerAcknowledged": True}, headers=headers).status_code in (404, 405)
    assert client.post(f"/api/ai/interviews/{uuid.uuid4()}/answers", json={"answer": "x"}, headers=headers).status_code == 404


def test_latest_for_mentor_is_204_when_empty(client, db, fake_profile, mentor_id):
    assert client.get("/api/ai/interviews/me", headers=auth(mentor_id, "MENTOR")).status_code == 204
