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
Toàn bộ 20 script e2e pass trên stack Docker (AI rule-based như CI): **652/652** — `e2e_acceptance` 69/69.
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
- Interview: "xin nâng hạng sau 90 ngày" (một phần FR-7.6).
- Email nhắc số dư sắp hết hạn (hiện chỉ có thông báo trong app).
- Trang admin xem `contact_violations` (hiện chỉ báo qua notification).
- Frontend: ghi chú cho người dùng rằng liên hệ luôn bị che.

### 2.3 Docs — ✅ xong (22/10/2026)
SRD (FR-5.8–5.12, 6.4–6.6, 6.10, D13–D20, DoD v2.0), `api-reference.md` (đường dẫn thật), `database-design.md`
(ví, lô khuyến mãi, `mentor_referrals`, `contact_violations`, `mock_*`), `README.md`.

### 2.4 Chưa kiểm chứng
- Jitsi video/chat chưa chạy trong trình duyệt (compose profile Jitsi chưa thử cùng frontend). Chỉ JWT + nhật ký vào phòng được test.
- Frontend chưa được duyệt bằng trình duyệt thật (chỉ tsc/lint).
- Cổng MoMo/VNPay thật chưa thử (chỉ sandbox).

## 3. Lưu ý vận hành
- Windows: chạy payment-service jar cần `-Duser.timezone=Asia/Ho_Chi_Minh`; build dùng `mvn clean` để tránh compile gia tăng bỏ sót import.
- Endpoint `/internal/dev/**` (dịch thời gian, ép job) chỉ dùng cho e2e — không bật ở production.
- Gọi nội bộ cần header `X-Internal-Token` = `INTERNAL_API_KEY` trong `.env`.
