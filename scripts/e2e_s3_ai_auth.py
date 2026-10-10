#!/usr/bin/env python3
"""
Kiểm thử e2e Sprint 3 — Team C (ai-service + auth-service):
  US-22 màn hình giới thiệu + quy tắc số lần phỏng vấn, US-23 rubric + REQUEST_RETAKE + ghi chú khi bác AI,
  US-24 chỉ số đồng thuận admin–AI, US-30 nhật ký kiểm toán.

Chạy trên hệ thống đang chạy (docker compose up), engine AI Interview = rule-based (không có DEEPSEEK_API_KEY):

    python3 scripts/e2e_s3_ai_auth.py
"""
import datetime
import json
import subprocess
import sys
import urllib.parse
import uuid
from zoneinfo import ZoneInfo

from common import AI, AUTH, PROFILE, ApiError, call

RUN = uuid.uuid4().hex[:6]
ADMIN_EMAIL, ADMIN_PASSWORD = "admin@mmp.local", "Admin@123"
WEAK = "Khong biet, em chua lam bao gio."
results = []


def check(name, condition, detail=""):
    results.append((name, bool(condition)))
    print(f"  [{'PASS' if condition else 'FAIL'}] {name}" + (f" — {detail}" if detail and not condition else ""))


def error_of(fn):
    """(status, body["error"]) của lời gọi lỗi; (None, None) nếu thành công."""
    try:
        fn()
    except ApiError as e:
        return e.status, (e.body.get("error") or {}) if isinstance(e.body, dict) else {}
    return None, None


def mentor(name):
    m = call("POST", f"{AUTH}/api/auth/register", {"email": f"s3c.{name}.{RUN}@test.local", "password": "Passw0rd!",
                                                   "role": "MENTOR", "fullName": f"S3C {name}"})
    call("PUT", f"{PROFILE}/api/profile/mentor/{m['userId']}", {
        "displayName": f"S3C Mentor {name} {RUN}", "domain": "backend", "skills": ["Java", "Spring Boot", "Redis"],
        "bio": "Backend engineer, huong dan junior.", "yearsExperience": 5, "hourlyRate": 0, "capacity": 3,
        "isAvailable": True, "portfolioLinks": []}, token=m["accessToken"])
    return m


def start(token, ack=True):
    return call("POST", f"{AI}/api/ai/interviews", {"selfAnswerAcknowledged": ack}, token=token)


def finish(token, answer=WEAK):
    interview = start(token)
    while interview["status"] == "IN_PROGRESS":
        interview = call("POST", f"{AI}/api/ai/interviews/{interview['id']}/answers", {"answer": answer}, token=token)
    return interview


def eligibility(token):
    return call("GET", f"{AI}/api/ai/interviews/eligibility", token=token)


def review(admin, interview_id, decision, note=None):
    return call("POST", f"{AI}/api/ai/admin/interviews/{interview_id}/review", {"decision": decision, "note": note},
                token=admin)


def audit(admin, **filters):
    query = urllib.parse.urlencode({k: v for k, v in filters.items() if v is not None})
    return call("GET", f"{AUTH}/api/auth/admin/audit?{query}", token=admin)


def main():
    print(f"E2E Sprint 3 — Team C (AI Interview + audit) run {RUN}")
    admin_login = call("POST", f"{AUTH}/api/auth/login", {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    admin, admin_id = admin_login["accessToken"], admin_login["userId"]

    print("\nUS-30 — POST /internal/audit")
    body = {"actorId": None, "actorRole": "SYSTEM", "action": "E2E_PING", "targetType": "E2E", "targetId": RUN,
            "before": None, "after": {"run": RUN}}
    check("/internal/audit không có X-Internal-Token → bị từ chối (401/403)",
          error_of(lambda: call("POST", f"{AUTH}/internal/audit", body))[0] in (401, 403))
    check("/internal/audit với token → 202", call("POST", f"{AUTH}/internal/audit", body, internal=True) is None)
    status, err = error_of(lambda: call("POST", f"{AUTH}/internal/audit", {**body, "action": "lower case"}, internal=True))
    check("action không phải UPPER_SNAKE → 400", status == 400, err)
    check("Không phải ADMIN thì không xem được nhật ký",
          error_of(lambda: call("GET", f"{AUTH}/api/auth/admin/audit", token=mentor("viewer")["accessToken"]))[0] == 403)

    print("\nUS-22 — xác nhận tự trả lời + số lần phỏng vấn")
    m1 = mentor("a")
    t1 = m1["accessToken"]
    for ack, label in ((False, "false"), (None, "không có trong body {}")):
        fn = (lambda: start(t1, False)) if ack is False else (lambda: call(
            "POST", f"{AI}/api/ai/interviews", token=t1, raw_body=b"{}", content_type="application/json"))
        status, err = error_of(fn)
        check(f"Bắt đầu khi selfAnswerAcknowledged {label} → 400 SELF_ANSWER_ACK_REQUIRED",
              status == 400 and err.get("code") == "SELF_ANSWER_ACK_REQUIRED", (status, err))
    e = eligibility(t1)
    check("Eligibility ban đầu: 0 đã dùng / 3 còn lại, không khoá, không chờ",
          (e["attemptsUsed"], e["attemptsLeft"], e["maxAttempts"], e["locked"], e["cooldownUntil"], e["canStart"])
          == (0, 3, 3, False, None, True), e)

    print("\nUS-23 — rubric từng câu, ghi chú khi bác AI, REQUEST_RETAKE")
    first = finish(t1)
    check("Buổi phỏng vấn kết thúc sau 5 câu, chờ admin", first["status"] == "PENDING_REVIEW" and len(first["turns"]) == 5)
    detail = call("GET", f"{AI}/api/ai/interviews/{first['id']}", token=admin)
    keys = {"technical", "depth", "communication", "mentoring"}
    check("Mỗi câu trả lời có đủ 4 điểm rubric (engine rule-based)",
          all(t["rubric"] and set(t["rubric"]) == keys for t in detail["turns"]), detail["turns"][0])
    t0 = detail["turns"][0]
    weighted = round(0.4 * t0["rubric"]["technical"] + 0.3 * t0["rubric"]["depth"]
                     + 0.15 * t0["rubric"]["communication"] + 0.15 * t0["rubric"]["mentoring"], 1)
    check("Điểm câu = tổng có trọng số 40/30/15/15", abs(t0["score"] - weighted) <= 0.051, (t0["score"], weighted))
    check("Lưu engine / prompt version / fallback từng lượt (PRD-AIV-7)",
          all(t["engine"] == "RULE_BASED" and t["promptVersion"] and t["fallbackUsed"] is False for t in detail["turns"]))
    check("Câu trả lời yếu → AI khuyến nghị REJECT (< 50)", detail["recommendation"] == "REJECT"
          and detail["overallScore"] < 50, (detail["overallScore"], detail["recommendation"]))
    # raw_body: bỏ qua lớp tương thích của common.py (nó tự bổ sung ghi chú cho các script seed)
    status, err = error_of(lambda: call("POST", f"{AI}/api/ai/admin/interviews/{first['id']}/review", token=admin,
                                        raw_body=json.dumps({"decision": "APPROVE", "note": "ok"}).encode(),
                                        content_type="application/json"))
    check("Duyệt ngược khuyến nghị AI với ghi chú < 10 ký tự → 400 REVIEW_NOTE_REQUIRED",
          status == 400 and err.get("code") == "REVIEW_NOTE_REQUIRED", (status, err))
    retake = review(admin, first["id"], "REQUEST_RETAKE", "Mentor bi mat ket noi giua chung, cho lam lai")
    check("REQUEST_RETAKE → RETAKE_REQUESTED", retake["status"] == "RETAKE_REQUESTED")
    e = eligibility(t1)
    check("REQUEST_RETAKE không tính vào số lần, không phải chờ", e["attemptsUsed"] == 0 and e["canStart"]
          and e["cooldownUntil"] is None, e)
    second = start(t1)
    check("Sau REQUEST_RETAKE bắt đầu lại được ngay (buổi mới)", second["status"] == "IN_PROGRESS"
          and second["id"] != first["id"] and second["selfAnswerAcknowledged"] is True)

    print("\nUS-22 — thời gian chờ sau khi bị từ chối")
    second = finish(t1)
    review(admin, second["id"], "REJECT")  # trùng khuyến nghị AI => không cần ghi chú
    e = eligibility(t1)
    check("Bị từ chối: 1 lần đã dùng, còn 2, có cooldownUntil ~7 ngày", e["attemptsUsed"] == 1 and e["attemptsLeft"] == 2
          and e["cooldownUntil"] and e["reason"] == "COOLDOWN", e)
    status, err = error_of(lambda: start(t1))
    check("Bắt đầu lại trong thời gian chờ → 409 INTERVIEW_COOLDOWN kèm retryAfter",
          status == 409 and err.get("code") == "INTERVIEW_COOLDOWN" and err.get("retryAfter") == e["cooldownUntil"],
          (status, err))
    if e["cooldownUntil"]:
        until = datetime.datetime.fromisoformat(e["cooldownUntil"].replace("Z", "+00:00"))
        days = (until - datetime.datetime.now(datetime.timezone.utc)).total_seconds() / 86400
        check("Thời gian chờ ≈ 7 ngày", 6.9 < days <= 7.01, days)

    print("\nUS-30 — nhật ký kiểm toán")
    rows = audit(admin, targetType="INTERVIEW", targetId=second["id"])["items"]
    check("Quyết định của admin có dòng nhật ký (INTERVIEW_REJECTED, actor = admin, before/after)",
          len(rows) == 1 and rows[0]["action"] == "INTERVIEW_REJECTED" and rows[0]["actorId"] == admin_id
          and rows[0]["actorRole"] == "ADMIN" and rows[0]["before"]["status"] == "PENDING_REVIEW"
          and rows[0]["after"]["status"] == "REJECTED", rows)
    retake_rows = audit(admin, action="interview_retake_requested", targetId=first["id"])["items"]
    check("Lọc theo action (không phân biệt hoa thường) + targetId", [r["action"] for r in retake_rows]
          == ["INTERVIEW_RETAKE_REQUESTED"], retake_rows)
    by_actor = audit(admin, actorId=admin_id, size=2)
    check("Lọc theo actorId + phân trang (size=2)", len(by_actor["items"]) <= 2 and by_actor["size"] == 2
          and all(r["actorId"] == admin_id for r in by_actor["items"]) and by_actor["totalItems"] >= 2, by_actor)
    # Bộ lọc from/to của audit tính theo ngày Việt Nam (AuditService.ZONE), không theo đồng hồ máy chạy test
    # (CI chạy UTC: 17:00–24:00 UTC đã là ngày hôm sau ở Việt Nam).
    vn_today = datetime.datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).date()
    tomorrow = (vn_today + datetime.timedelta(days=1)).isoformat()
    today = vn_today.isoformat()
    check("Lọc khoảng ngày: từ ngày mai → 0 dòng", audit(admin, targetId=RUN, **{"from": tomorrow})["totalItems"] == 0)
    check("Lọc khoảng ngày: hôm nay → thấy dòng vừa ghi", audit(admin, targetId=RUN, **{"from": today, "to": today})
          ["items"][0]["after"] == {"run": RUN})
    check("Ngày sai định dạng → 400 INVALID_DATE",
          error_of(lambda: audit(admin, **{"from": "10/11/2026"}))[1].get("code") == "INVALID_DATE")

    victim = call("POST", f"{AUTH}/api/auth/register", {"email": f"s3c.lock.{RUN}@test.local", "password": "Passw0rd!",
                                                        "role": "MENTEE", "fullName": "S3C Lock"})
    call("PATCH", f"{AUTH}/api/auth/admin/users/{victim['userId']}/status", {"status": "LOCKED"}, token=admin)
    call("PATCH", f"{AUTH}/api/auth/admin/users/{victim['userId']}/status", {"status": "ACTIVE"}, token=admin)
    actions = [r["action"] for r in audit(admin, targetType="USER", targetId=victim["userId"])["items"]]
    check("Khoá / mở khoá tài khoản được ghi nhật ký (mới nhất trước)", actions == ["USER_UNLOCKED", "USER_LOCKED"], actions)

    try:
        out = subprocess.run(["docker", "exec", "do_an_2026-auth-db-1", "psql", "-U", "postgres", "-d", "auth_db", "-c",
                              f"UPDATE audit_log SET action = 'X' WHERE target_id = '{RUN}'"],
                             capture_output=True, text=True, timeout=30)
        check("audit_log append-only: UPDATE trực tiếp trong DB bị trigger chặn",
              out.returncode != 0 and "append-only" in out.stderr, out.stderr.strip()[:200])
    except (OSError, subprocess.SubprocessError) as ex:
        print(f"  [SKIP] Không kiểm tra được trigger qua docker exec: {ex}")

    print("\nUS-24 — chỉ số online")
    stats = call("GET", f"{AI}/api/ai/admin/stats", token=admin)
    check("/api/ai/admin/stats có tỉ lệ đồng thuận admin–AI",
          {"decisionsTotal", "decisionsComparable", "decisionsAgreeing", "agreementRate"} <= set(stats)
          and stats["decisionsComparable"] >= 2 and 0 <= stats["agreementRate"] <= 1, stats)

    failed = [n for n, ok in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} PASS")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
