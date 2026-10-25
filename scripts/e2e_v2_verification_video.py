#!/usr/bin/env python3
"""
E2E xác thực mentor — vòng 1 có camera (docs/design-mentor-verification.md §5).

    python3 scripts/e2e_v2_verification_video.py

Không có OPENAI_API_KEY (CI / docker mặc định): chép lời lại phía server là UNAVAILABLE (không chặn); logic so sánh hai bản chép lời
được phủ bằng unit/API test với OpenAI giả lập. Script gửi đoạn video / âm thanh giả lập thay cho trình duyệt.
Kiểm tra: bắt buộc đồng ý camera, đợt chỉ sang ROUND1_REVIEW khi video đã chốt, cờ CAMERA_OFF, mất camera quá 60 giây → lần làm
bị vô hiệu, phát video có Range, quyền xem, admin xoá (410).
"""
import sys
import time
import urllib.error
import urllib.request
import uuid

from common import (AI, AUTH, PROFILE, ApiError, call, complete_voice_interview, finish_video, start_voice_interview,
                    upload_video_chunks, voice_transcript)

RUN = uuid.uuid4().hex[:6]
results = []


def check(name, condition, detail=""):
    results.append((name, bool(condition)))
    print(f"  [{'PASS' if condition else 'FAIL'}] {name}" + (f" — {detail}" if detail and not condition else ""))
    return condition


def error_of(fn):
    try:
        fn()
    except ApiError as e:
        return e.status, (e.body.get("error") or {}) if isinstance(e.body, dict) else {}
    return None, {}


def new_mentor(name):
    m = call("POST", f"{AUTH}/api/auth/register", {"email": f"v2.video.{name}.{RUN}@test.local", "password": "Passw0rd!",
                                                    "role": "MENTOR", "fullName": f"V2 Video {name}"})
    call("PUT", f"{PROFILE}/api/profile/mentor/{m['userId']}", {
        "displayName": f"V2 Video {name} {RUN}", "domain": "backend", "skills": ["Java", "Redis"],
        "bio": "Backend engineer 8 nam, huong dan junior xay dung REST API.", "yearsExperience": 8,
        "hourlyRate": 100000, "capacity": 3, "isAvailable": True, "portfolioLinks": []}, token=m["accessToken"])
    return m


def status_of(token):
    return call("GET", f"{AI}/api/ai/verification/status", token=token)


def fetch(url, headers=None):
    """GET không JSON (video nhị phân): trả (status, header, body)."""
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return res.status, res.headers, res.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read()


def consent_and_flow(admin):
    print("Đồng ý camera, đợt chỉ sang ROUND1_REVIEW khi video đã chốt")
    m = new_mentor("flow")
    t = m["accessToken"]
    status, err = error_of(lambda: start_voice_interview(t, video=False))
    check("Không đồng ý camera → 400 VIDEO_CONSENT_REQUIRED", status == 400 and err.get("code") == "VIDEO_CONSENT_REQUIRED", (status, err))
    check("…và không tạo đợt hay buổi nào", status_of(t)["applicationId"] is None)

    iv = start_voice_interview(t)["interview"]
    check("Bắt đầu có đồng ý → có bản ghi video chưa chốt", iv["video"] and iv["video"]["consentVideo"] and not iv["video"]["finished"], iv.get("video"))
    call("POST", f"{AI}/api/ai/interviews/{iv['id']}/voice-transcript", voice_transcript(iv["maxTurns"]), token=t)
    s = status_of(t)
    check("Nộp bản chép lời nhưng chưa chốt video → đợt vẫn ROUND1, admin chưa duyệt được",
          s["status"] == "ROUND1" and not any(a["id"] == iv["applicationId"] for a in
                                              call("GET", f"{AI}/api/ai/admin/verification/applications?status=ROUND1_REVIEW", token=admin)), s)
    upload_video_chunks(t, iv["id"], starts_ms=(0, 10_000, 20_000))
    video = finish_video(t, iv["id"])
    check("Chốt video → đợt sang ROUND1_REVIEW, video có 3 đoạn dài 30 giây", status_of(t)["status"] == "ROUND1_REVIEW"
          and video["finished"] and video["chunkCount"] == 3 and video["durationSeconds"] == 30, video)
    view = call("GET", f"{AI}/api/ai/interviews/{iv['id']}", token=admin)
    check("Admin thấy video hợp lệ: không cờ, chép lời lại UNAVAILABLE khi chưa có khoá OpenAI",
          view["video"]["flags"] == [] and view["video"]["transcriptCheck"] in ("UNAVAILABLE", "OK") and view["video"]["available"], view["video"])
    mine = call("GET", f"{AI}/api/ai/interviews/{iv['id']}", token=t)
    check("Mentor không thấy cờ / bản chép lời của server", mine["video"]["flags"] == [] and mine["video"]["serverTranscript"] is None)
    return m, iv


def playback(admin, m, iv):
    print("Phát video: token ngắn hạn, Range, quyền xem")
    play = call("POST", f"{AI}/api/ai/verification/videos/{iv['id']}/play-token", token=admin)
    url = AI + play["url"]
    status, headers, body = fetch(url)
    check("Admin phát được video (200, Accept-Ranges)", status == 200 and headers.get("Accept-Ranges") == "bytes" and body.startswith(b"webm-chunk-0"), (status, body[:20]))
    status, headers, part = fetch(url, {"Range": "bytes=0-5"})
    check("Range → 206 + Content-Range", status == 206 and len(part) == 6 and headers.get("Content-Range", "").startswith("bytes 0-5/"), (status, headers.get("Content-Range")))
    own = call("POST", f"{AI}/api/ai/verification/videos/{iv['id']}/play-token", token=m["accessToken"])
    check("Mentor xem được video của chính mình", fetch(AI + own["url"])[0] == 200)
    other = new_mentor("other")
    status, _ = error_of(lambda: call("POST", f"{AI}/api/ai/verification/videos/{iv['id']}/play-token", token=other["accessToken"]))
    check("Mentor khác không xem được → 403", status == 403, status)
    check("Token sai → 401", fetch(f"{AI}/api/ai/verification/videos/{iv['id']}/stream?token=garbage")[0] == 401)
    status, _ = error_of(lambda: call("DELETE", f"{AI}/api/ai/admin/verification/videos/{iv['id']}", token=m["accessToken"]))
    check("Mentor không xoá được video → 403", status == 403, status)


def flags_and_invalidation(admin):
    print("Cờ CAMERA_OFF và mất camera quá 60 giây")
    m = new_mentor("gap")
    iv = complete_voice_interview(m["accessToken"], starts_ms=(0, 10_000, 50_000, 60_000))
    view = call("GET", f"{AI}/api/ai/interviews/{iv['id']}", token=admin)
    check("Trống 30 giây giữa các đoạn → CAMERA_OFF, khuyến nghị buộc NEEDS_REVIEW",
          view["video"]["gapDetected"] and view["video"]["flags"] == ["CAMERA_OFF"] and view["recommendation"] == "NEEDS_REVIEW"
          and view["flagged"], view["video"])
    check("Cờ không tự loại mentor: đợt vẫn ROUND1_REVIEW", status_of(m["accessToken"])["status"] == "ROUND1_REVIEW")

    bad = new_mentor("lost")
    iv2 = complete_voice_interview(bad["accessToken"], starts_ms=(0, 10_000, 100_000))
    s = status_of(bad["accessToken"])
    check("Mất camera 80 giây (> 60) → lần làm INVALIDATED, tính 1 lần, đợt vẫn ROUND1",
          iv2["status"] == "INVALIDATED" and s["status"] == "ROUND1" and s["attemptsUsed"] == 1 and s["canStart"], (iv2["status"], s))
    pending = call("GET", f"{AI}/api/ai/admin/verification/applications?status=ROUND1_REVIEW", token=admin)
    check("Lần bị vô hiệu không vào hàng chờ admin", not any(a["id"] == iv2["applicationId"] for a in pending))


def delete_video(admin, iv):
    print("Admin xoá video")
    play = call("POST", f"{AI}/api/ai/verification/videos/{iv['id']}/play-token", token=admin)
    deleted = call("DELETE", f"{AI}/api/ai/admin/verification/videos/{iv['id']}", token=admin)
    check("Xoá → deletedAt, không còn phát được", deleted["deletedAt"] and not deleted["available"])
    check("Phát sau khi xoá → 410", fetch(AI + play["url"])[0] == 410)
    status, err = error_of(lambda: call("POST", f"{AI}/api/ai/verification/videos/{iv['id']}/play-token", token=admin))
    check("Lấy token sau khi xoá → 410 VIDEO_DELETED", status == 410 and err.get("code") == "VIDEO_DELETED", (status, err))
    view = call("GET", f"{AI}/api/ai/interviews/{iv['id']}", token=admin)
    check("Bản ghi, cờ và điểm vẫn còn làm căn cứ", view["overallScore"] is not None and view["video"]["deletedAt"])


def main():
    t0 = time.time()
    print(f"E2E verification video run {RUN}\n")
    admin = call("POST", f"{AUTH}/api/auth/login", {"email": "admin@mmp.local", "password": "Admin@123"})["accessToken"]
    m, iv = consent_and_flow(admin)
    playback(admin, m, iv)
    flags_and_invalidation(admin)
    delete_video(admin, iv)
    passed = sum(1 for _, ok in results if ok)
    print(f"\n{passed}/{len(results)} kiểm tra PASS trong {time.time() - t0:.1f}s")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ApiError as e:
        print("Unexpected API error:", e, file=sys.stderr)
        sys.exit(2)
