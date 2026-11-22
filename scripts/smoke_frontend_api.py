#!/usr/bin/env python3
"""
Smoke test các endpoint frontend gọi (qua proxy Next.js, đúng như trình duyệt), gồm những phần trước đây chạy mock.
Cần stack đang chạy và đã seed (scripts/seed_demo.py, seed_content.py, seed_verification_demo.py).

    FRONTEND=http://localhost:3001 python3 scripts/smoke_frontend_api.py
"""
import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.getenv("FRONTEND", "http://localhost:3001")
PW = "Demo@123"
results = []


def req(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Accept": "application/json"}
    if data:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as res:
            text = res.read().decode()
            try:
                return res.status, (json.loads(text) if text else None)
            except ValueError:
                return res.status, text  # video / nhị phân
    except urllib.error.HTTPError as e:
        text = e.read().decode()
        try:
            return e.code, json.loads(text)
        except ValueError:
            return e.code, text


def login(email, password=PW):
    status, body = req("POST", "/api/auth/login", {"email": email, "password": password})
    assert status == 200, (email, status, body)
    return body


def check(name, method, path, token, expect=(200, 204), body=None, shape=None):
    status, data = req(method, path, body, token)
    ok = status in expect
    if ok and shape:
        try:
            ok = bool(shape(data))
        except Exception:  # noqa: BLE001
            ok = False
    results.append(ok)
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}  ({method} {path.split('?')[0]} -> {status})" + ("" if ok else f"  {str(data)[:160]}"))
    return data


def main():
    mentee = login("mentee@demo.local")
    mentor = login("mentor.java@demo.local")
    admin = login("admin@mmp.local", "Admin@123")
    mt, mr, ad = mentee["accessToken"], mentor["accessToken"], admin["accessToken"]
    print("Thông báo")
    prefs = check("đọc tuỳ chọn mặc định", "GET", "/api/notifications/preferences", mt,
                  shape=lambda d: set(d["channels"]) == {"session", "request", "payment", "blog", "message"})
    prefs["channels"]["blog"] = {"inApp": False, "email": False}
    prefs["reminders"]["h1"] = False
    check("lưu tuỳ chọn", "PUT", "/api/notifications/preferences", mt, body=prefs,
          shape=lambda d: d["channels"]["blog"] == {"inApp": False, "email": False})
    check("đọc lại đúng giá trị đã lưu", "GET", "/api/notifications/preferences", mt,
          shape=lambda d: d["channels"]["blog"]["inApp"] is False and d["reminders"]["h1"] is False)

    print("Trang cá nhân")
    check("classmates của mentor", "GET", f"/api/profile/mentors/{mentor['userId']}/classmates", mt,
          shape=lambda d: isinstance(d["names"], list) and "total" in d)
    check("extras của mentee (chính mình)", "GET", f"/api/profile/mentee/{mentee['userId']}/extras", mt,
          shape=lambda d: {"joinedAt", "sessionsCompleted", "mentors", "feedbacks", "wantedSkills"} <= set(d))
    check("extras của mentee khác bị chặn", "GET", f"/api/profile/mentee/{mentor['userId']}/extras", mt, expect=(403, 404))
    check("extras mentor xem được", "GET", f"/api/profile/mentee/{mentee['userId']}/extras", mr)
    check("mentors/extras (thẻ mentor)", "GET", f"/api/profile/mentors/extras?ids={mentor['userId']}", mt, shape=lambda d: len(d) == 1)
    check("completed-counts", "GET", f"/api/mentoring/mentors/completed-counts?ids={mentor['userId']}", mt)

    print("Blog")
    posts = check("danh sách blog", "GET", "/api/learning/blog/posts?size=5", mt, shape=lambda d: d["items"])
    ids = ",".join(p["id"] for p in posts["items"][:3])
    check("lượt xem", "GET", f"/api/learning/blog/posts/views?ids={ids}", mt, shape=lambda d: isinstance(d, dict))
    pid = posts["items"][0]["id"]
    check("ghi lượt xem", "POST", f"/api/learning/blog/posts/{pid}/view", mt)
    check("chế độ hiển thị", "GET", f"/api/learning/blog/posts/{pid}/visibility", mt, shape=lambda d: d["visibility"] in ("PUBLIC", "UNLISTED"))
    check("admin: bài đã gỡ", "GET", "/api/learning/admin/blog/removed", ad, shape=lambda d: isinstance(d, list))
    check("admin: báo cáo blog", "GET", "/api/learning/admin/blog/reports?status=OPEN", ad)

    print("Tin nhắn / phòng học")
    reqs = check("yêu cầu của mentee", "GET", "/api/mentoring/requests", mt)
    convs = check("danh sách hội thoại", "GET", "/api/mentoring/conversations", mt)
    if convs:
        cid = convs[0]["id"] if isinstance(convs, list) else None
        if cid:
            other = convs[0].get("otherUserId") or mentor["userId"]
            check("hiện diện", "GET", f"/api/mentoring/conversations/{cid}/presence/{other}", mt, shape=lambda d: "online" in d)
            check("đính kèm", "GET", f"/api/mentoring/conversations/{cid}/attachments", mt, shape=lambda d: isinstance(d, list))
            check("trạng thái tắt thông báo", "GET", f"/api/mentoring/conversations/{cid}/mute", mt, shape=lambda d: "muted" in d)
            check("tắt thông báo", "PUT", f"/api/mentoring/conversations/{cid}/mute", mt, body={"muted": True})
            check("bật lại thông báo", "PUT", f"/api/mentoring/conversations/{cid}/mute", mt, body={"muted": False})
    else:
        print("  (chưa có hội thoại: bỏ qua nhóm tin nhắn)")
    _ = reqs
    check("tiến độ: điểm", "GET", f"/api/mentoring/mentees/{mentee['userId']}/scores", mt, shape=lambda d: isinstance(d, list))
    check("tiến độ: tổng hợp nhận xét", "GET", f"/api/mentoring/mentees/{mentee['userId']}/feedback-summary", mt)

    print("Referral / voucher")
    check("kho voucher", "GET", "/api/payment/vouchers/me", mt, shape=lambda d: isinstance(d, list))
    check("mã giới thiệu của tôi", "GET", "/api/payment/referrals/me", mt)
    check("voucher quote (mã không tồn tại)", "POST", "/api/payment/vouchers/quote", mt, expect=(200, 404),
          body={"code": "NOPE-0000", "tuition": 200000})

    print("CV / onboarding")
    check("cv privacy", "GET", "/api/ai/cv/privacy", mt, shape=lambda d: "allowExternalAi" in d)
    check("cv privacy lưu", "PUT", "/api/ai/cv/privacy", mt, body={"allowExternalAi": False})
    check("danh sách CV", "GET", "/api/ai/cv/mine", mt)

    print("Kiểm duyệt (admin)")
    check("tranh chấp", "GET", "/api/mentoring/admin/disputes", ad, shape=lambda d: isinstance(d, list))
    check("báo cáo tin nhắn", "GET", "/api/mentoring/admin/message-reports", ad, shape=lambda d: isinstance(d, list))
    check("vi phạm liên hệ", "GET", "/api/mentoring/admin/contact-violations?days=30", ad)
    check("nhật ký", "GET", "/api/auth/admin/audit", ad)
    check("danh sách admin", "GET", "/api/auth/admin/users?role=ADMIN&page=0", ad)
    check("context tranh chấp không tồn tại", "GET", "/api/mentoring/admin/disputes/00000000-0000-4000-8000-000000000000/context", ad, expect=(404,))

    print("Xác thực mentor")
    ready = login("verify.ready@demo.local")["accessToken"]
    st = check("mentor: trạng thái", "GET", "/api/ai/verification/status", ready,
               shape=lambda d: d["tracks"] and d["rules"]["topics"] and d["maxDomains"] >= 1)
    check("mentor: lịch sử", "GET", "/api/ai/verification/history", ready, shape=lambda d: isinstance(d, list))
    prog = login("verify.progress@demo.local")["accessToken"]
    pst = check("mentor dở dang: có buổi đang chạy", "GET", "/api/ai/verification/status", prog,
                shape=lambda d: d["tracks"][0]["stage"] == "IN_PROGRESS")
    iv = check("tiếp tục buổi dở", "GET", f"/api/ai/verification/interviews/{pst['tracks'][0]['interviewId']}", prog,
               shape=lambda d: d["status"] == "IN_PROGRESS" and d["question"])
    check("heartbeat", "POST", f"/api/ai/verification/interviews/{iv['id']}/heartbeat", prog, body={"remainingSeconds": 1000})
    queue = check("admin: hàng đợi chưa rõ", "GET", "/api/ai/admin/verification/queue?filter=UNCLEAR&q=", ad,
                  shape=lambda d: d["counts"]["UNCLEAR"] >= 1)
    check("admin: đã quyết", "GET", "/api/ai/admin/verification/queue?filter=DECIDED&q=", ad, shape=lambda d: d["items"])
    item = queue["items"][0]
    detail = check("admin: chi tiết ca", "GET", f"/api/ai/admin/verification/{item['id']}", ad,
                   shape=lambda d: len(d["answers"]) == 5 and d["criteria"] and d["ai"]["reason"])
    video = detail["answers"][0]["videoUrl"]
    if video:
        status, _ = req("GET", video)
        results.append(status in (200, 206))
        print(f"  [{'PASS' if status in (200, 206) else 'FAIL'}] phát video qua proxy ({status})")
    _ = st

    ok = sum(results)
    print(f"\n{ok}/{len(results)} kiểm tra đạt")
    sys.exit(0 if ok == len(results) else 1)


if __name__ == "__main__":
    main()
