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

### 2.1 Sửa e2e cũ (kỳ vọng lệch bản chốt v2)
Chạy: `PYTHONIOENCODING=utf-8 INTERNAL_API_KEY=$(grep '^INTERNAL_API_KEY' .env | cut -d= -f2) python scripts/<file>.py`

- `e2e_acceptance.py`: crash `KeyError: 'code'` (referral cũ → dùng `/api/payment/referrals/codes` theo mentor); còn kiểm điểm referral và nhánh interview DEEPEN/PIVOT.
- `e2e_p0_mentoring.py`: crash `KeyError: 'pointsBalance'` — điểm xin lỗi đã bỏ; xoá các check liên quan.
- `e2e_s2_mentoring.py`: US-12 "mentee tự báo mình vắng" nay trả 409 `ABSENCE_CONTRADICTS_LOG` (không còn 400 `INVALID_ATTENDANCE_ANSWER`) → sửa kỳ vọng hoặc dựng tình huống mentee chưa vào phòng.
- `e2e_s2_profile_matching.py`: 2 lỗi (`excludedBy` chỉ còn `maxRate`; test `freeOnly` đã bỏ filter).
- `e2e_s3_ai_auth.py`: lỗi lưu engine/prompt version/fallback (có thể lỗi từ trước) và thứ tự audit khoá/mở khoá (nay có thêm `ACCOUNT_SESSIONS_CANCELLED`).
- `e2e_s4_ai_auth.py`: US-39 nay trả 409 `USE_WALLET` thay vì 403 `EMAIL_NOT_VERIFIED` → kiểm tra xác thực email ở đường trả từ ví.
- `e2e_s4_mentoring.py`: US-34 nhắc 1 giờ không bắn (đối chiếu `SessionScheduler` với mốc nhắc 15 phút mới).
- `e2e_s2_cv`, `e2e_p0_auth_ai`, `e2e_s3_mentoring`, `e2e_s3_profile_matching`: chạy lại và xem dòng tổng (lần chạy trước lọc grep nên không thấy kết quả).
- Đã pass: `p0_profile_matching` 28/28, `s4_profile_matching` 34/34, `s5_ai_auth` 41/41, `s5_mentoring` 30/30.
- Kiểm `scripts/seed_demo.py` còn chạy được (approval không có tier thì suy từ rate).

### 2.2 Chưa cài đặt
- Interview: "xin nâng hạng sau 90 ngày" (một phần FR-7.6).
- Email nhắc số dư sắp hết hạn (hiện chỉ có thông báo trong app).
- Trang admin xem `contact_violations` (hiện chỉ báo qua notification).
- Frontend: ghi chú cho người dùng rằng liên hệ luôn bị che.

### 2.3 Docs
- `docs/SRD-Mentor-Mentee-Platform.md`: tick ✅ FR-5.8–5.12, 6.4–6.6, 6.10 và các DoD trial/room/referral/lock (bước 4–8 chưa tick).
- `docs/api-reference.md`: ghi đúng đường dẫn thật (`/api/mentoring/sessions/{id}/room`, `/report-absent`, `/api/payment/referrals/codes`, `/internal/wallet/*`, `/internal/referrals/*`).
- `docs/database-design.md`: thêm `wallet_entries`, promo lots/allocations, `mentor_referrals`, `contact_violations`, cột mới của `sessions`/`transactions`.
- `README.md`: cập nhật số liệu.

### 2.4 Chưa kiểm chứng
- Jitsi video/chat chưa chạy trong trình duyệt (compose profile Jitsi chưa thử cùng frontend). Chỉ JWT + nhật ký vào phòng được test.
- Frontend chưa được duyệt bằng trình duyệt thật (chỉ tsc/lint).
- Cổng MoMo/VNPay thật chưa thử (chỉ sandbox).

## 3. Lưu ý vận hành
- Windows: chạy payment-service jar cần `-Duser.timezone=Asia/Ho_Chi_Minh`; build dùng `mvn clean` để tránh compile gia tăng bỏ sót import.
- Endpoint `/internal/dev/**` (dịch thời gian, ép job) chỉ dùng cho e2e — không bật ở production.
- Gọi nội bộ cần header `X-Internal-Token` = `INTERNAL_API_KEY` trong `.env`.
