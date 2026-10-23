# Handoff v2.0 — trạng thái triển khai

Nhánh: `feature/v2-wallet-and-pricing` (từ `main`). Nguồn nghiệp vụ: `docs/ban-chot-nghiep-vu.md`.

## 1. Đã làm (theo bước)

| Bước | Nội dung | Kiểm chứng |
|---|---|---|
| 0 | Thông số thời gian v2.0 (reset 15m, resume phỏng vấn 24h, lead 3h, hold 15m, confirm 24h, attendance 24h, release 72h, nhắc 15m) | e2e |
| 1 | Hạng mentor JUNIOR/SENIOR/EXPERT + khung giá; ai-service gợi ý hạng; bỏ lọc "miễn phí" | `e2e_v2_tier`, unit |
| 2 | Ví VND (payment-service): nạp, trả từ ví, hoàn về nguồn, lô khuyến mãi (hạn 12 tháng), DORMANT, FROZEN; ledger append-only | smoke 35 check |
| 3 | Đặt buổi bằng ví, mentor xác nhận từng buổi, hủy 3 mức, buổi cố định 60 phút | `e2e_v2_booking` 28/28 |
| 4 | Buổi trải nghiệm 15 phút (30.000đ), khóa tài khoản huỷ buổi + đóng băng ví | `e2e_v2_trial` 18/18 |
| 5 | Phòng Jitsi (JWT HS256), nhật ký vào phòng quyết định vắng mặt, báo vắng | `e2e_v2_room_referral` 31/31 (chỉ JWT/log, chưa chạy video) |
| 6 | Giới thiệu theo mentor (mã theo cặp, thưởng 30.000đ khuyến mãi sau 7 ngày, tối đa 5/tháng, UNDER_REVIEW) | `e2e_v2_room_referral` |
| 7 | Frontend: ví, thanh toán bằng ví, đặt buổi/trải nghiệm/mã giới thiệu, phòng học, referral, admin ví, admin phỏng vấn | `tsc` + `next lint` sạch (lần kiểm cuối) |
| 8 | Che liên hệ luôn bật (SĐT, email, link, MXH), bảng `contact_violations`, báo admin khi ≥3 lần/30 ngày | unit (mentoring 274/274) |
| — | Contracts YAML, docker-compose (profile Jitsi), `.env.example`, CI glob `e2e_v2_*.py` | parse OK |

## 2. Việc còn lại (giao cho người làm tiếp)

### 2.1 Sửa e2e cũ — ✅ xong (22/10/2026)
Toàn bộ 20 script e2e pass trên stack Docker (AI rule-based như CI): **663/663** — `e2e_acceptance` 69/69.
Chạy: `PYTHONIOENCODING=utf-8 INTERNAL_API_KEY=$(grep '^INTERNAL_API_KEY' .env | cut -d= -f2) python3 scripts/<file>.py`

- Script cũ dời phiên về quá khứ phải ghi nhật ký vào phòng (`/internal/dev/sessions/{id}/joined`), nếu không job kết luận
  `BOTH_ABSENT` trước khi luồng xác nhận tham dự chạy. Kịch bản "một bên báo vắng" nay do nhật ký quyết định; mâu thuẫn còn lại
  là `HELD` vs `CANCELLED_ON_CALL`.
- Huỷ muộn hoàn 0% nay là < 4 giờ (dời phiên bằng `startsInMinutes`); thu nhập giải phóng sau 72 giờ.
- `e2e_acceptance` DoD 10 viết lại theo referral theo mentor (mã sau buổi đã học xong → dùng ở buổi đầu → +30.000đ sau 7 ngày).
- `e2e_s4_ai_auth` US-39 kiểm tra chặn email chưa xác thực ở `wallet/topups` và `wallet/pay`.
- `e2e_s3_ai_auth` "engine RULE_BASED" chỉ pass khi **không** có `DEEPSEEK_API_KEY` (máy có key sẽ FAIL — không phải lỗi).
- `seed_demo.py`: chạy lại được; mentor Python đổi giá 0 → 150.000 (giá 0 không đặt được và PUT lại sẽ 400 `RATE_OUT_OF_TIER`).
- Sửa kèm: `EmailClient` còn map `SESSION_REMINDER_1H` → nhắc 15 phút không có email; đã đổi sang `SESSION_REMINDER_15M`.
- Merge `main` (US-58 phỏng vấn thử): migration mentoring `V19__wallet_booking_trial_room` đổi thành **`V20`** vì `V19__mock_interviews`
  đã có trên main. CSDL dev đã chạy nhánh này với V19 cũ → `docker compose down -v` cho mentoring-db (hoặc sửa `flyway_schema_history`).

### 2.2 Chưa cài đặt
- ✅ (23/10) Interview: xin nâng cấp sau 90 ngày (FR-7.6) — chốt: không đạt thì giữ APPROVED + cấp cũ; không tính vào 3 lượt /
  chờ 7 ngày; chỉ duyệt lên cấp cao hơn (400 `TIER_NOT_HIGHER`); vẫn nhận đặt lịch trong lúc chờ duyệt. Buổi `kind = UPGRADE`
  (migration ai 009), mốc 90 ngày = max(`tier_assigned_at`, lần xin gần nhất đã có kết quả). `test_interview_upgrade.py`, `e2e_v2_tier`.
- ✅ Email nhắc khuyến mãi sắp hết hạn / ví sắp ngủ (`WALLET_PROMO_EXPIRING`, `WALLET_DORMANT_SOON` → nhóm ACCOUNT, luôn gửi; số tiền
  dạng `30.000đ`) — `e2e_v2_booking` mục 8.
- ✅ Trang admin `/admin/contact-violations` + `GET /api/mentoring/admin/contact-violations?days=` (gộp theo người gửi, số lần,
  loại liên hệ, đã báo admin chưa); thông báo `CONTACT_VIOLATIONS` trỏ tới trang này — `e2e_s4_mentoring` US-33.
- ✅ Khung thông báo trong trang tin nhắn ghi đúng quy tắc v2.0 (liên hệ luôn bị che).

### 2.3 Docs — ✅ xong (22/10/2026)
SRD (FR-5.8–5.12, 6.4–6.6, 6.10, D13–D20, DoD v2.0), `api-reference.md` (đường dẫn thật), `database-design.md`
(ví, lô khuyến mãi, `mentor_referrals`, `contact_violations`, `mock_*`), `README.md`.

### 2.5 Khoá tài khoản (§2.1) — ✅ xong (22/10/2026)
Khoá bắt buộc lý do ≥ 10 ký tự (400 `LOCK_REASON_REQUIRED`); khoá mentor → thu nhập đang chờ của buổi đã học / bị mentee huỷ muộn được
giữ bằng tranh chấp hệ thống (giao dịch ON_HOLD) để admin kết luận giải phóng hoặc hoàn cho mentee; người bị khoá / mở khoá nhận thông
báo + email (`ACCOUNT_LOCKED` vẫn gửi cho tài khoản đang bị khoá). `e2e_v2_room_referral` §5, `AccountLockServiceTest`.
Chưa làm (cần chốt): referral bất thường "trùng tài khoản nhận tiền / thiết bị" — hệ thống không thu thập dữ liệu thiết bị (Q75).

### 2.4 Kiểm chứng
- ✅ (22/10) Jitsi chạy cùng frontend trên Chromium: mentor + mentee vào cùng một phòng (mỗi bên thấy 1 người còn lại), không còn màn
  "Join meeting", nhật ký vào phòng ghi cả hai. Sửa kèm: JWT thiếu header `typ: JWT` → prosody từ chối ("Invalid typ"); Jitsi
  stable-9823 đọc `prejoinConfig.enabled`. Chưa thử: chat trong phòng (tính năng có sẵn của Jitsi), media thật qua UDP 10000 giữa hai máy.
  Trình duyệt phải chấp nhận chứng chỉ tự ký của https://localhost:8443 một lần.
- ✅ (22/10) Duyệt trên trình duyệt: ví, đặt buổi trải nghiệm, mentor xác nhận, phòng học, admin khoá / vi phạm liên hệ / tranh chấp.
  Sửa: số dư 0 hiện "Miễn phí" → "0 đ"; giá 0 hiện "Chưa đặt giá"; gợi ý ngân sách "0 = mentor miễn phí"; chữ 48 giờ → 24 giờ ở
  xác nhận tham dự; nhãn kết luận theo nhật ký phòng (`BOTH_ABSENT`, `JOIN_LOG_*`); chính sách huỷ riêng của buổi trải nghiệm.
- Cổng MoMo/VNPay thật chưa thử (chỉ sandbox).

## 3. Lưu ý vận hành
- Windows: chạy payment-service jar cần `-Duser.timezone=Asia/Ho_Chi_Minh`; build dùng `mvn clean` để tránh compile gia tăng bỏ sót import.
- Endpoint `/internal/dev/**` (dịch thời gian, ép job) chỉ dùng cho e2e — không bật ở production.
- Gọi nội bộ cần header `X-Internal-Token` = `INTERNAL_API_KEY` trong `.env`.

## 4. Phỏng vấn giọng nói (v2.1)

Nhánh: `feature/voice-interview-prototype` (xếp chồng trên PR #15 `feature/v2-tier-upgrade`). Chốt 23/10/2026. Nghiệp vụ:
`ban-chot-nghiep-vu.md` §16; yêu cầu: SRD FR-7.7, FR-10.1–10.7, D21; kỹ thuật: `ai-features.md` §2.11–2.12.

**Trạng thái: ⚒ đang hiện thực** (chưa nghiệm thu).
- Mentor: chọn chat hoặc giọng nói trên `/interview`; `POST /api/ai/interviews/voice` + `POST /api/ai/interviews/{id}/voice-transcript`,
  cột `interviews.mode` / `interviews.consent_external_ai`. Route thử nghiệm `/api/ai/voice-interviews/session|grade` và trang
  `/interview/voice` bị gỡ.
- Mentee: "Luyện phỏng vấn với AI" — 1 lượt miễn phí trọn đời, kết quả + báo cáo nói hiện ngay; `/api/ai/practice-interviews/**`,
  bảng `practice_interviews`. Migration ai `010_voice_interviews.sql`.
- Câu hỏi do AI soạn (phương án A, 23/10): DeepSeek soạn kế hoạch một lần lúc bắt đầu từ hồ sơ / mục tiêu / CV đã xác nhận +
  đồng ý gửi AI bên ngoài, lưu `plan` (migration `011_interview_plans.sql`); không có `DEEPSEEK_API_KEY` → ngân hàng câu hỏi.
  `app/interview/planner.py`, `tests/test_interview_planner.py`. Chưa kiểm với DeepSeek thật (chỉ client giả lập).

**Bật**: điền `OPENAI_API_KEY` vào `.env` rồi `docker compose up -d ai-service` (tuỳ chọn: `OPENAI_REALTIME_MODEL=gpt-realtime`,
`OPENAI_REALTIME_VOICE=marin`, `OPENAI_TRANSCRIBE_MODEL=gpt-4o-transcribe`, `VOICE_INTERVIEW_TOPICS=4`, `VOICE_SESSION_MINUTES=30`,
`PRACTICE_FREE_LIMIT=1`). Trình duyệt chỉ cho dùng micro trên **HTTPS hoặc `localhost`**. Không có key: production 503
`VOICE_UNAVAILABLE`; dev vẫn tạo buổi và trả `voice: null` (giao diện hiện "Phỏng vấn giọng nói chưa được bật").

**Kiểm thử**:
- Unit / luồng: `cd ai-service && pytest -q tests` (gồm `test_voice_interview.py`). **Lưu ý**: pytest xoá dữ liệu ở `AI_DB_URL`
  (mặc định trỏ vào ai-db của docker) — chạy với một Postgres dùng một lần.
- Không cần key / micro: ngoài production gọi endpoint bắt đầu (nhận `voice: null`) rồi gửi bản chép lời tổng hợp
  `{items: [{role: "marker", topicNo: 1}, {role: "assistant", text: "..."}, {role: "user", text: "..."}, ...]}` tới
  `voice-transcript` (mentor → `PENDING_REVIEW`) hoặc `complete` (mentee → kết quả ngay). Lần luyện thứ hai → 409 `PRACTICE_FREE_USED`.
- Có key + micro: mở `/interview` (mentor, chọn giọng nói) hoặc trang luyện phỏng vấn (mentee) trên `http://localhost:3000`.

**Chưa kiểm chứng**:
- Cuộc gọi giọng nói thật (cần `OPENAI_API_KEY` + micro) — CI và e2e chỉ dùng bản chép lời tổng hợp.
- Chất lượng tiếng Việt của Realtime (nghe hiểu, chép lời, giọng đọc) — chưa đánh giá, chưa so với ElevenLabs.
- Chưa ghi âm / phát lại cho admin (bước tiếp theo); chưa có luyện phỏng vấn có phí.
- Chi phí thực tế mỗi buổi — xem bảng giá OpenAI hiện hành.

