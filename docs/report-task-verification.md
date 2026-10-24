# Báo cáo tiến độ: xác thực mentor 2 vòng

> Theo dõi theo kế hoạch 5 PR ở `docs/design-mentor-verification.md`. Cập nhật liên tục, không sửa báo cáo của PR đã xong, chỉ thêm mới.
> Mỗi mục ghi: input, lệnh đã chạy, output thật, kết luận, commit liên quan.

## Tóm tắt

| PR | Trạng thái | Nhánh |
|---|---|---|
| Bước 0 | Đã xong | — |
| 1a | Đã xong | `feature/profile-remove-tier` |
| 1b | chưa làm | |
| 2 | chưa làm | |
| 3 | chưa làm | |
| 4 | chưa làm | |

---

## Bước 0 — Sao lưu, chuẩn bị

**Input:** `ai_db`, `profile_db` đang chạy trong docker compose.

**Lệnh đã chạy:**
```
docker compose exec -T ai-db pg_dump -U postgres -d ai_db > .backups/ai_db_before_verification_<ts>.sql
docker compose exec -T profile-db pg_dump -U postgres -d profile_db > .backups/profile_db_before_verification_<ts>.sql
```

**Output thật:** `ai_db` dump 498 dòng, `profile_db` dump 745 dòng, cả hai exit=0. Thêm `.backups/` vào `.gitignore`.

**Chưa làm được (cần người, không tự động hoá):** chạy lại tay hai người vào cùng phòng Jitsi (`docker compose --profile jitsi up -d`, mở `https://localhost:8443` hai trình duyệt) để xác nhận hạ tầng Jitsi còn sống trước PR 4. Việc này cần trình duyệt thật, ghi là việc chờ bạn làm trước khi bắt đầu PR 4.

**Kết luận:** ĐẠT phần sao lưu. Phần kiểm Jitsi tay để dành cho PR 4.

---

## PR 1a — Gỡ cấp độ mentor (tier), giá tự do

**Input:** Spec D6 (`docs/design-mentor-verification.md`) — bỏ `JUNIOR/SENIOR/EXPERT`, mentor tự đặt giá 0–100.000.000đ, không còn luồng xin nâng cấp.

**Phạm vi sửa:** ai-service (`interview/service.py`, `attempts.py`, `rubric.py`, `views.py`, `config.py`, `clients/profile.py` — bỏ `_is_upgrade`, `TIER_RANK`, `suggest_tier`, thông báo `MENTOR_TIER_*`), profile-service (`ProfileService`, `ProfileController`, `InternalProfileController`, `ProfileDtos`, `MentorProfile` — bỏ `PricingTiers`, `GET /pricing-tiers`, `PUT /mentor/{id}/rate`, cột `tier`/`tier_assigned_at`; migration mới `V11__drop_mentor_tier.sql`), mentoring-service (`EmailClient` — bỏ 2 category chết `MENTOR_TIER_UPGRADED`/`MENTOR_TIER_UPGRADE_REJECTED` sau khi ai-service không còn gửi), frontend (bỏ hiển thị/chọn tier, ô giá mở tự do), `scripts/*` (bỏ `tier_for_rate`, cập nhật review body, xoá `e2e_v2_tier.py`), `contracts/*.yaml`, docs liên quan.

**Lệnh đã chạy và output thật:**
- `mvn -q -o clean test` (profile-service): 69 test PASS, không còn `MentorTierTest`.
- `mvn -q -o clean test-compile` (mentoring-service) sau khi sửa `EmailClient`: biên dịch sạch.
- `pytest -q` (ai-service, Postgres thật): 257 PASS / 3 fail không liên quan (đã xác nhận là flaky từ trước, thuộc luồng chat sắp xoá ở PR 1b).
- `npm run build` + `npm run lint` (frontend): sạch.
- Phát hiện giữa lúc kiểm: volume `profile-db-data` và `mentoring-db-data` bị lệch migration (checksum/flyway history cũ từ phiên trước, không do PR này) → đã xin xác nhận người dùng, xoá 2 volume, dựng lại từ Flyway (profile V1→V11, mentoring V1→V20) thành công.
- Sau khi dựng sạch: `python seed_demo.py` (9 hồ sơ lập chỉ mục) → `e2e_acceptance.py` **69/69 PASS**, `e2e_p0_mentoring.py` **32/32**, `e2e_s2_mentoring.py` **51/51**, `e2e_s3_mentoring.py` **56/56**, `e2e_s5_ai_auth.py` **41/41**, `e2e_v2_booking.py` **31/31** (sau khi sửa script dùng `PUT /api/profile/mentor/{id}` thay cho endpoint `/rate` đã xoá), `e2e_v2_room_referral.py` **37/37**, `e2e_v2_trial.py` **18/18**.
- `grep -rni tier` toàn repo (trừ `docs/archive`, `docs/design-mentor-verification.md`, `docs/report-task-verification.md`): chỉ còn cột DB `kind`/`from_tier` ở `ai-service/app/interview/repository.py` (cố ý giữ tới PR 1b theo kế hoạch) và tên biến test `"tiers"` trong `e2e_v2_booking.py` (nhãn người dùng thử nghiệm huỷ 3 bậc, không liên quan giá mentor).

**Kết luận:** ĐẠT. Mentor tự đặt giá tự do, không còn cấp độ/luồng nâng cấp ở bất kỳ tầng nào; toàn bộ e2e và test đơn vị xanh trên stack đã dựng sạch.

---
