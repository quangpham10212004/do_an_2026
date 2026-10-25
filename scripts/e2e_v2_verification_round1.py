#!/usr/bin/env python3
"""
E2E xác thực mentor — mô hình đợt + duyệt vòng 1 (docs/design-mentor-verification.md §3, §4, §7).

    python3 scripts/e2e_v2_verification_round1.py

Không có OPENAI_API_KEY (CI / docker mặc định) => `voice: null`, script gửi bản chép lời giả lập thay trình duyệt.
Kiểm tra: số lần làm vòng 1 (2 lần), đóng đợt + chờ 15 ngày (dev endpoint lùi mốc), admin RETAKE tối đa 2 lần và không tính
vào số lần làm, REJECT chờ 15 ngày, PASS => mentor được kích hoạt (vòng 2 chưa bật), quyền admin.
"""
import sys
import time
import uuid

from common import (AI, AUTH, PROFILE, ApiError, call, complete_voice_interview, round1_review, start_voice_interview,
                    voice_transcript)

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
    m = call("POST", f"{AUTH}/api/auth/register", {"email": f"v2.verify.{name}.{RUN}@test.local", "password": "Passw0rd!",
                                                    "role": "MENTOR", "fullName": f"V2 Verify {name}"})
    call("PUT", f"{PROFILE}/api/profile/mentor/{m['userId']}", {
        "displayName": f"V2 Verify {name} {RUN}", "domain": "backend", "skills": ["Java", "Redis"],
        "bio": "Backend engineer 8 nam, huong dan junior xay dung REST API.", "yearsExperience": 8,
        "hourlyRate": 100000, "capacity": 3, "isAvailable": True, "portfolioLinks": []}, token=m["accessToken"])
    return m


def status_of(token):
    return call("GET", f"{AI}/api/ai/verification/status", token=token)


def profile_status(m):
    return call("GET", f"{PROFILE}/api/profile/mentor/{m['userId']}", token=m["accessToken"])["verificationStatus"]


def abandon_attempt(token):
    iv = start_voice_interview(token)["interview"]
    call("POST", f"{AI}/internal/dev/interviews/{iv['id']}/age?hours=1", internal=True)
    return iv


def two_failed_attempts_close_the_application():
    print("Hai lần không hoàn thành → đóng đợt, chờ 15 ngày")
    m = new_mentor("fail")
    t = m["accessToken"]
    s = status_of(t)
    check("Mentor mới: chưa có đợt, 2 lần, bắt đầu được", s["applicationId"] is None and s["attemptsLeft"] == 2 and s["canStart"], s)
    iv1 = abandon_attempt(t)
    s = status_of(t)
    check("Lần 1 bỏ dở: còn 1 lần, đợt vẫn ROUND1", s["attemptsUsed"] == 1 and s["attemptsLeft"] == 1 and s["status"] == "ROUND1"
          and s["applicationId"] == iv1["applicationId"], s)
    abandon_attempt(t)
    s = status_of(t)
    check("Lần 2 bỏ dở: đóng đợt CLOSED, chờ (COOLDOWN), không bắt đầu được",
          s["status"] == "CLOSED" and s["reason"] == "COOLDOWN" and not s["canStart"] and s["retryAfter"], s)
    check("Hồ sơ mentor đồng bộ REJECTED", profile_status(m) == "REJECTED")
    status, err = error_of(lambda: start_voice_interview(t))
    check("Bắt đầu lại trong thời gian chờ → 409 INTERVIEW_COOLDOWN kèm retryAfter",
          status == 409 and err.get("code") == "INTERVIEW_COOLDOWN" and err.get("retryAfter") == s["retryAfter"], (status, err))
    call("POST", f"{AI}/internal/dev/verification/{s['applicationId']}/age?days=16", internal=True)
    s2 = status_of(t)
    check("Sau 16 ngày (dev): bắt đầu được đợt mới từ vòng 1", s2["canStart"] and s2["status"] is None and s2["attemptsLeft"] == 2, s2)
    again = start_voice_interview(t)["interview"]
    check("Đợt mới là đợt khác, hồ sơ quay về PENDING_INTERVIEW", again["applicationId"] != s["applicationId"]
          and profile_status(m) == "PENDING_INTERVIEW")


def retake_pass_and_reject(admin):
    print("Admin duyệt vòng 1: RETAKE (tối đa 2), PASS, REJECT")
    m = new_mentor("pass")
    t = m["accessToken"]
    iv = complete_voice_interview(t)
    s = status_of(t)
    check("Nộp bản chép lời → đợt ROUND1_REVIEW, hồ sơ PENDING_REVIEW, không bắt đầu lại được",
          iv["status"] == "PENDING_REVIEW" and s["status"] == "ROUND1_REVIEW" and s["reason"] == "PENDING_REVIEW"
          and not s["canStart"] and profile_status(m) == "PENDING_REVIEW", s)
    status, err = error_of(lambda: start_voice_interview(t))
    check("Đang chờ admin → 409 INTERVIEW_PENDING_REVIEW", status == 409 and err.get("code") == "INTERVIEW_PENDING_REVIEW", (status, err))
    pending = call("GET", f"{AI}/api/ai/admin/verification/applications?status=ROUND1_REVIEW", token=admin)
    check("Admin thấy đợt chờ duyệt kèm điểm và khuyến nghị", any(a["id"] == iv["applicationId"] and a["interview"]["recommendation"]
                                                                   for a in pending))
    status, err = error_of(lambda: round1_review(admin, iv, "RETAKE", "ngắn"))
    check("RETAKE ghi chú < 10 ký tự → 400 REVIEW_NOTE_REQUIRED", status == 400 and err.get("code") == "REVIEW_NOTE_REQUIRED", (status, err))
    status, _ = error_of(lambda: round1_review(t, iv, "PASS", "mentor tự duyệt"))
    check("Mentor không duyệt được → 403", status == 403, status)

    for n in (1, 2):
        r = round1_review(admin, iv, "RETAKE", f"Video bị mờ lần {n}, vui lòng làm lại")
        s = status_of(t)
        check(f"RETAKE lần {n}: đợt về ROUND1, không tính vào số lần làm",
              r["status"] == "ROUND1" and r["retakeCount"] == n and s["attemptsUsed"] == 0 and s["canStart"], s)
        iv = complete_voice_interview(t)
    status, err = error_of(lambda: round1_review(admin, iv, "RETAKE", "Thêm một lần nữa cho chắc"))
    check("RETAKE lần 3 → 409 RETAKE_LIMIT_REACHED", status == 409 and err.get("code") == "RETAKE_LIMIT_REACHED", (status, err))
    done = round1_review(admin, iv, "PASS", "Đã xem video, đạt yêu cầu")
    check("PASS → đợt ROUND2_PENDING_SLOTS, hồ sơ vẫn PENDING_REVIEW (chưa kích hoạt)", done["status"] == "ROUND2_PENDING_SLOTS" and profile_status(m) == "PENDING_REVIEW", done["status"])
    status, err = error_of(lambda: start_voice_interview(t))
    check("Đang chờ vòng 2 không phỏng vấn lại → 409 INTERVIEW_PENDING_REVIEW", status == 409 and err.get("code") == "INTERVIEW_PENDING_REVIEW", (status, err))
    status, err = error_of(lambda: round1_review(admin, iv, "PASS", "duyệt lần hai"))
    check("Duyệt lần hai → 409 VERIFICATION_NOT_PENDING_REVIEW", status == 409 and err.get("code") == "VERIFICATION_NOT_PENDING_REVIEW", (status, err))

    r = new_mentor("reject")
    rt = r["accessToken"]
    weak = complete_voice_interview(rt, "Khong biet, em chua lam bao gio.")
    done = round1_review(admin, weak, "REJECT")
    s = status_of(rt)
    check("REJECT → đợt REJECTED, chờ 15 ngày, hồ sơ REJECTED", done["status"] == "REJECTED" and s["reason"] == "COOLDOWN"
          and s["retryAfter"] and profile_status(r) == "REJECTED", s)
    stats = call("GET", f"{AI}/api/ai/admin/stats", token=admin)
    check("Thống kê có mentor bị từ chối và tỉ lệ đồng thuận",
          stats["mentorsRejected"] >= 1 and stats["decisionsTotal"] >= 4, stats)


def main():
    t0 = time.time()
    print(f"E2E verification round 1 run {RUN}\n")
    admin = call("POST", f"{AUTH}/api/auth/login", {"email": "admin@mmp.local", "password": "Admin@123"})["accessToken"]
    two_failed_attempts_close_the_application()
    retake_pass_and_reject(admin)
    passed = sum(1 for _, ok in results if ok)
    print(f"\n{passed}/{len(results)} kiểm tra PASS trong {time.time() - t0:.1f}s")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ApiError as e:
        print("Unexpected API error:", e, file=sys.stderr)
        sys.exit(2)
