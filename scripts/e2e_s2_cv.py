#!/usr/bin/env python3
"""
Kiểm thử e2e Sprint 2 cho ai-service — CV Parsing + Chatbot enrichment:

- US-19 (PRD-CV-1) đồng ý gửi CV tới AI bên ngoài: bắt buộc khai báo, lưu theo CV, không đồng ý => rule-based.
- US-20 (PRD-CV-2) xem lại thông tin trích xuất: upload không mở chatbot, không ghi hồ sơ; chatbot dùng trường
  đã duyệt.
- US-21 (PRD-CV-4) xác nhận mục tiêu: goal là bản nháp; "Dùng mục tiêu này" mới ghi hồ sơ (một lần), "Bỏ qua"
  không đổi gì.

Chạy trên hệ thống đang chạy (docker compose up):

    python3 scripts/e2e_s2_cv.py          # AUTH_URL, PROFILE_URL, AI_URL đọc từ biến môi trường (common.py)
"""
import sys
import uuid

from common import AI, AUTH, PROFILE, SAMPLE_CV_LINES, ApiError, call, make_pdf, multipart_file

RUN = uuid.uuid4().hex[:6]
ANSWERS = ["Toi muon lam backend developer Go trong 6 thang toi", "System design va microservices",
           "Chua tu tin khi thiet ke database", "Muon review code va luyen phong van, 2 buoi moi thang",
           "Khong co gi them"]
EDITED_GOAL = f"Tro thanh backend developer Go trong 6 thang, tap trung system design (e2e {RUN})."
results = []


def check(name, condition, detail=""):
    results.append((name, bool(condition)))
    print(f"  [{'PASS' if condition else 'FAIL'}] {name}" + (f" — {detail}" if detail and not condition else ""))


def error_of(fn):
    try:
        fn()
    except ApiError as e:
        return e.status, (e.body.get("error") or {}).get("code") if isinstance(e.body, dict) else None
    return None, None


def register(role, name):
    return call("POST", f"{AUTH}/api/auth/register", {
        "email": f"e2e.s2cv.{name}.{RUN}@test.local", "password": "Passw0rd!", "role": role, "fullName": f"E2E {name}"})


def upload(user, consent, path=None):
    fields = {} if consent is None else {"consentExternalAi": consent}
    body, ctype = multipart_file("file", "cv.pdf", make_pdf(SAMPLE_CV_LINES), fields=fields)
    return call("POST", f"{AI}{path or f'/api/ai/mentee/{user['userId']}/cv-upload'}", token=user["accessToken"],
                raw_body=body, content_type=ctype)


def get_profile(user):
    return call("GET", f"{PROFILE}/api/profile/mentee/{user['userId']}", token=user["accessToken"])


def chat(user, conversation):
    turns = 0
    while conversation["status"] == "IN_PROGRESS":
        conversation = call("POST", f"{AI}/api/ai/enrichment/conversations/{conversation['id']}/answers",
                            {"answer": ANSWERS[turns]}, token=user["accessToken"])
        turns += 1
    return conversation


def main():
    print(f"E2E Sprint 2 CV/AI run {RUN}")
    health = call("GET", f"{AI}/health")
    mentee, other, mentor = register("MENTEE", "mentee"), register("MENTEE", "other"), register("MENTOR", "mentor")
    token = mentee["accessToken"]
    call("PUT", f"{PROFILE}/api/profile/mentee/{mentee['userId']}", {
        "displayName": "E2E S2 Mentee", "domain": "backend", "currentLevel": "BEGINNER", "skills": ["Java"],
        "goal": "Hoc backend Java", "portfolioLinks": []}, token=token)
    before = get_profile(mentee)

    # ---------------- US-19 ----------------
    print("\nUS-19 — Đồng ý gửi CV tới AI bên ngoài")
    check("Thiếu consentExternalAi khi upload → 400 CONSENT_REQUIRED",
          error_of(lambda: upload(mentee, None)) == (400, "CONSENT_REQUIRED"))
    check("Thiếu consentExternalAi khi mentor parse → 400 CONSENT_REQUIRED",
          error_of(lambda: upload(mentor, None, path="/api/ai/cv/parse")) == (400, "CONSENT_REQUIRED"))
    check("consentExternalAi không phải boolean → 400 VALIDATION_ERROR",
          error_of(lambda: upload(mentee, "co le")) == (400, "VALIDATION_ERROR"))
    check("Upload bị từ chối không lưu CV nào",
          call("GET", f"{AI}/api/ai/cv/mine", token=token) == [])
    consented = upload(mentee, "true")["cv"]
    expected_engine = "DEEPSEEK" if health.get("llmEnabled") else "RULE_BASED"
    check(f"Đồng ý: lưu consentExternalAi = true, engine theo cấu hình server ({expected_engine})",
          consented["consentExternalAi"] is True and consented["engine"] == expected_engine, consented["engine"])
    uploaded = upload(mentee, "false")
    cv = uploaded["cv"]
    check("Không đồng ý: lưu consentExternalAi = false, parse bằng RULE_BASED",
          cv["consentExternalAi"] is False and cv["engine"] == "RULE_BASED", cv)
    mine = {c["id"]: c["consentExternalAi"] for c in call("GET", f"{AI}/api/ai/cv/mine", token=token)}
    check("'CV của tôi' hiển thị lựa chọn đồng ý của từng CV", mine == {consented["id"]: True, cv["id"]: False}, mine)
    parsed_by_mentor = upload(mentor, "false", path="/api/ai/cv/parse")
    check("Mentor điền nhanh hồ sơ không đồng ý → RULE_BASED", parsed_by_mentor["engine"] == "RULE_BASED")

    # ---------------- US-20 ----------------
    print("\nUS-20 — Xem lại thông tin trích xuất trước khi dùng")
    check("Upload chỉ parse: chưa mở chatbot, confirmedFields = null",
          uploaded["conversation"] is None and cv["confirmedFields"] is None)
    check("Parse không ghi gì vào hồ sơ (goal, kỹ năng, cvFileUrl giữ nguyên)",
          get_profile(mentee) == before, get_profile(mentee))
    start = f"{AI}/api/ai/cv/{cv['id']}/enrichment-conversation"
    check("Bắt đầu chatbot trước khi duyệt → 409 CV_NOT_REVIEWED",
          error_of(lambda: call("POST", start, token=token)) == (409, "CV_NOT_REVIEWED"))
    fields_url = f"{AI}/api/ai/cv/{cv['id']}/confirmed-fields"
    edited = {"role": "Junior Backend Developer", "skills": ["Go", "Kubernetes", "go", " "], "yearsExperience": 1,
              "projects": [], "education": cv["parsed"]["education"]}
    check("Trường không hợp lệ (yearsExperience 99) → 400 VALIDATION_ERROR",
          error_of(lambda: call("PUT", fields_url, {**edited, "yearsExperience": 99}, token=token))
          == (400, "VALIDATION_ERROR"))
    check("Người khác không duyệt được CV (403)", error_of(lambda: call(
        "PUT", fields_url, edited, token=other["accessToken"]))[0] == 403)
    check("Mentor không duyệt được CV của mentee (403)", error_of(lambda: call(
        "PUT", fields_url, edited, token=mentor["accessToken"]))[0] == 403)
    confirmed = call("PUT", fields_url, edited, token=token)
    check("Lưu trường đã sửa/bỏ (cắt khoảng trắng, bỏ trùng/rỗng); parse gốc giữ nguyên",
          confirmed["confirmedFields"]["skills"] == ["Go", "Kubernetes"] and confirmed["confirmedFields"]["projects"] == []
          and "Docker" in confirmed["parsed"]["skills"], confirmed["confirmedFields"])
    check("Duyệt xong hồ sơ vẫn chưa đổi", get_profile(mentee) == before)
    started = call("POST", start, token=token)
    conversation = started["conversation"]
    first_q = conversation["currentQuestion"]["question"]
    check("Chatbot dùng trường đã duyệt (nhắc Go, không nhắc Docker đã bỏ)",
          "Go" in first_q and "Docker" not in first_q, first_q)
    check("Bắt đầu lại trả về cùng hội thoại",
          call("POST", start, token=token)["conversation"]["id"] == conversation["id"])
    latest = call("GET", f"{AI}/api/ai/mentee/{mentee['userId']}/enrichment/latest", token=token)
    check("enrichment/latest trả CV mới nhất + hội thoại của nó", latest["cv"]["id"] == cv["id"]
          and latest["conversation"]["id"] == conversation["id"])

    # ---------------- US-21 ----------------
    print("\nUS-21 — Xác nhận mục tiêu")
    conv_url = f"{AI}/api/ai/enrichment/conversations/{conversation['id']}"
    check("Xác nhận khi hội thoại chưa xong → 409 CONVERSATION_NOT_COMPLETED", error_of(lambda: call(
        "POST", f"{conv_url}/confirm-goal", {"goal": EDITED_GOAL}, token=token)) == (409, "CONVERSATION_NOT_COMPLETED"))
    done = chat(mentee, conversation)
    check("Hội thoại xong: goal là bản nháp (DRAFT), chưa đồng bộ",
          done["goalStatus"] == "DRAFT" and not done["profileSynced"] and done["enrichedGoal"], done["goalStatus"])
    check("Hồ sơ chưa đổi khi goal còn là bản nháp", get_profile(mentee) == before)
    check("Goal quá ngắn → 400 VALIDATION_ERROR", error_of(lambda: call(
        "POST", f"{conv_url}/confirm-goal", {"goal": "ngan"}, token=token)) == (400, "VALIDATION_ERROR"))
    check("Người khác không xác nhận/bỏ qua được (403)",
          error_of(lambda: call("POST", f"{conv_url}/confirm-goal", {"goal": EDITED_GOAL},
                                token=other["accessToken"]))[0] == 403
          and error_of(lambda: call("POST", f"{conv_url}/discard-goal", token=other["accessToken"]))[0] == 403)
    confirmed_conv = call("POST", f"{conv_url}/confirm-goal", {"goal": EDITED_GOAL}, token=token)
    after = get_profile(mentee)
    check("'Dùng mục tiêu này' (đã sửa): CONFIRMED, đồng bộ ngay",
          confirmed_conv["goalStatus"] == "CONFIRMED" and confirmed_conv["profileSynced"]
          and confirmed_conv["confirmedGoal"] == EDITED_GOAL, confirmed_conv)
    check("Hồ sơ nhận goal đã sửa + chỉ kỹ năng đã duyệt (Go, Kubernetes; không có Docker đã bỏ)",
          after["goal"] == EDITED_GOAL and {"Go", "Kubernetes"} <= set(after["skills"])
          and "Docker" not in after["skills"] and after["cvFileUrl"] == f"/api/ai/cv/{cv['id']}/file", after)
    again = call("POST", f"{conv_url}/confirm-goal", {"goal": EDITED_GOAL + " (lan 2)"}, token=token)
    check("Xác nhận lần hai: 200, không đồng bộ lại (goal trong hồ sơ giữ bản lần đầu)",
          again["confirmedGoal"] == EDITED_GOAL and get_profile(mentee)["goal"] == EDITED_GOAL)
    check("Bỏ qua sau khi đã dùng → 409 GOAL_ALREADY_CONFIRMED", error_of(lambda: call(
        "POST", f"{conv_url}/discard-goal", token=token)) == (409, "GOAL_ALREADY_CONFIRMED"))

    # Luồng "Bỏ qua" trên một CV khác
    second = upload(mentee, "false")["cv"]
    call("PUT", f"{AI}/api/ai/cv/{second['id']}/confirmed-fields", {"skills": ["Rust"]}, token=token)
    second_conv = chat(mentee, call("POST", f"{AI}/api/ai/cv/{second['id']}/enrichment-conversation",
                                    token=token)["conversation"])
    second_url = f"{AI}/api/ai/enrichment/conversations/{second_conv['id']}"
    discarded = call("POST", f"{second_url}/discard-goal", token=token)
    profile_now = get_profile(mentee)
    check("'Bỏ qua': DISCARDED, hồ sơ giữ nguyên goal cũ và không nhận kỹ năng mới",
          discarded["goalStatus"] == "DISCARDED" and not discarded["profileSynced"]
          and profile_now["goal"] == EDITED_GOAL and "Rust" not in profile_now["skills"], profile_now)
    check("Xác nhận sau khi đã bỏ qua → 409 GOAL_DISCARDED", error_of(lambda: call(
        "POST", f"{second_url}/confirm-goal", {"goal": EDITED_GOAL}, token=token)) == (409, "GOAL_DISCARDED"))

    failed = [n for n, ok in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} PASS")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
