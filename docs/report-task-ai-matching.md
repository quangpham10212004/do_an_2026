# Báo cáo tiến độ: hoàn thiện AI Matching

> Theo dõi theo task ở [design-ai-matching-spec.md](design-ai-matching-spec.md) §11. Cập nhật liên tục khi xong từng task; không sửa lại báo cáo của task đã xong, chỉ thêm mới.
> Mỗi mục ghi: input dùng để verify, lệnh đã chạy, output thật, kết luận đạt/không đạt, commit liên quan.

## Tóm tắt

| Task | Trạng thái | Commit |
|---|---|---|
| T0 | ĐẠT | `270b2e2` (code), `7a20457` (tài liệu) |
| T1 | ĐẠT | `(xem §T1)` |
| T2 | ĐẠT | (xem §T2) |
| T2b | chưa làm | |
| T2c | chưa làm | |
| T3 | chưa làm | |
| T4 | chưa làm | |
| T5 | chưa làm | |
| T6 | chưa làm | |
| T7 | chưa làm | |
| T8 | chưa làm | |
| T9–T16 | chưa làm (cần người chấm/dữ liệu thật, hoặc tuỳ chọn) | |

---

## T0 — Hoàn tất ngân sách mềm (C11)

**Input:**
- `pytest matching-service/tests` chạy trên Postgres thật (docker compose đang chạy sẵn: `matching-db` cổng 5439, `profile-db` cổng 5434).
- Biến môi trường: `MATCHING_DB_URL`, `PROFILE_DB_URL` (role `matching_reader`), `PROFILE_DB_ADMIN_URL` (role admin, cần cho `test_matching_db.py` seed dữ liệu).
- `scripts/e2e_s2_profile_matching.py` gọi API thật của docker compose (`profile-service:8082`, `matching-service:8090`). Script dùng `INTERNAL_API_KEY` mặc định `dev-internal-key`, nhưng container đang chạy với `change-me-internal-service-key` (đặt qua biến môi trường compose) — phải export đúng giá trị này trước khi chạy, nếu không bước duyệt mentor nội bộ trả 401.

**Lệnh đã chạy:**
```
cd matching-service
MATCHING_DB_URL=postgresql://postgres:postgres@localhost:5439/matching_db \
PROFILE_DB_URL=postgresql://matching_reader:matching_reader@localhost:5434/profile_db \
PROFILE_DB_ADMIN_URL=postgresql://postgres:postgres@localhost:5434/profile_db \
python -m pytest tests/ -q

cd scripts
PYTHONIOENCODING=utf-8 INTERNAL_API_KEY=change-me-internal-service-key \
python e2e_s2_profile_matching.py
```

**Output thật:**
- pytest: `104 passed, 1 failed in 21.58s`. Lỗi duy nhất là `test_migrations.py::test_baseline_matches_db_init_schema` — `UnicodeDecodeError` khi đọc `001_baseline.sql` bằng `Path.read_text()` không chỉ định `encoding="utf-8"` trên Windows (mặc định dùng cp1252 theo locale máy). Lỗi này **không liên quan ngân sách mềm** (file không nằm trong các file đã sửa), là lỗi môi trường của Windows host, không phải lỗi logic. 3 test gọi riêng theo từ khoá `budget`/`over_budget` đều PASS: `test_api.py` (1), `test_match_filters.py` (2), `test_matching_db.py` (4, cần DB thật — ban đầu bị SKIP vì thiếu `PROFILE_DB_ADMIN_URL`, sau khi thêm biến thì PASS hết).
- e2e: `35/35 kiểm tra PASS trong 9.6s`, gồm đúng 3 check ngân sách mềm nêu ở spec: "Mềm: 10 mentor trong ngân sách đứng đầu, 3 mentor vượt ngân sách đứng cuối", "Mềm: mentor vượt ngân sách là mentor 300.000đ, overBudgetBy = 150.000", "Mềm: maxRate không còn loại ai (excludedBy rỗng), pipeline.overBudget = 6".

**Kết luận:** ĐẠT theo output mong đợi ở §11.1. Mentor vượt ngân sách luôn đứng sau nhóm trong ngân sách; `overBudgetBy` đúng bằng `hourly_rate - maxRate`; `includeOverBudget=false` loại hẳn (dùng trong `search()` mặc định của e2e này, xác nhận chế độ cứng vẫn hoạt động).

**Phát hiện phụ (không thuộc T0, ghi nhận cho T1/T2):**
- `test_migrations.py` có lỗi mã hoá khi chạy trên Windows — không sửa trong phạm vi các task này (ngoài 16 task đã liệt kê), chỉ ghi nhận.
- Test case "US-17 ... minRating=4: mentor chưa có đánh giá bị loại" trong e2e **đang xác nhận đúng hành vi G1** (lọc theo rating thô, loại mentor mới). Đây chính là hành vi T2 sẽ đổi — khi làm T2 cần sửa luôn assertion này trong e2e, nếu không T2 sẽ làm e2e hiện tại FAIL (đã đúng theo thiết kế mới, không phải lỗi).

---

## T1 — G2: kiểm tra tổng trọng số khi khởi động

**Input (theo §11.1):** khởi động service với `MATCH_WEIGHT_SIMILARITY=0.7` (4 biến còn lại giữ mặc định, tổng thành 1,10); và khởi động với 5 biến mặc định (tổng 1,00).

**Thay đổi:**
- `app/config.py`: thêm `weight_errors()` — trả danh sách tên=giá trị của 5 biến `MATCH_WEIGHT_*` kèm tổng thực tế khi `|tổng − 1| > 1e-6`; rỗng khi an toàn. Không tự chuẩn hoá (đúng quyết định đã chốt: dừng, không âm thầm sửa).
- `app/main.py` (`lifespan`): gọi `weight_errors()` **trước** `prod_secret_errors()`, dừng khởi động bằng `RuntimeError("G2: ...")` nếu sai — áp dụng ở mọi `APP_ENV`, không chỉ prod, vì đây là lỗi đúng/sai của công thức tính điểm, không phải vấn đề bảo mật.
- `tests/test_api.py`: 3 test mới — `test_weight_errors_default_sums_to_one`, `test_weight_errors_rejects_wrong_total`, `test_weight_errors_blocks_startup` (theo đúng khuôn của `test_prod_mode_rejects_dev_secrets` đã có).

**Lệnh đã chạy:**
```
cd matching-service
MATCHING_DB_URL=... PROFILE_DB_URL=... PROFILE_DB_ADMIN_URL=... \
python -m pytest tests/ -q
```

**Output thật:** `107 passed, 1 failed` (104 cũ + 3 test mới của T1, cùng 1 lỗi mã hoá cp1252 đã ghi nhận ở T0, không liên quan). Chạy riêng `-k weight`: `3 passed`.

**Kết luận:** ĐẠT theo output mong đợi ở §11.1 — service từ chối khởi động khi tổng lệch, thông báo nêu tên biến và tổng; mặc định 0,60/0,15/0,10/0,10/0,05 khởi động bình thường; sai lệch do làm tròn số thực không bị coi là lỗi (dung sai 1e-6).

**Lưu ý kỹ thuật:** `matching_pipeline.py` cache 5 trọng số thành hằng số module (`WEIGHT_SIMILARITY = config.MATCH_WEIGHT_SIMILARITY`, v.v.) ngay lúc import, nên `monkeypatch` `config.MATCH_WEIGHT_*` trong test chỉ ảnh hưởng `config.weight_errors()` và `lifespan`, không ảnh hưởng hằng số đã cache trong `matching_pipeline`. Không phải vấn đề cho T1 (kiểm tra chạy đúng lúc khởi động, trước khi pipeline dùng các hằng số đó), chỉ ghi chú để tránh nhầm khi đọc lại test.

---

## T2 — G1, D9: `minRating` theo `effective_rating`

**Input (theo §11.1):** trung vị nền tảng khi có; mentor dưới `MIN_REVIEWS` (3) đánh giá được so bằng trung vị đó (hoặc fallback 3,5 khi chưa ai đủ 3 đánh giá). Test cụ thể: mentor A rating_count=1 rating=0 (mới), mentor B rating_count=5 rating=4,5 (thật), mentor C rating_count=3 rating=3,9 (thật) — `minRating=4` và `minRating=3`.

**Thay đổi:**
- `_CANDIDATES_CTE` (SQL): `rating_ok` đổi từ `m.rating >= $minRating` sang `(CASE WHEN rating_count >= MIN_REVIEWS THEN rating ELSE effective_median END) >= $minRating`. `effective_median` được Python tính trước (trung vị nền tảng, hoặc `FALLBACK_MEDIAN_RATING=3.5` khi `None`) rồi truyền vào như tham số SQL — cùng công thức với `signals.effective_rating` ở bước chấm điểm (C13), không còn hai nguồn sự thật khác nhau.
- `_run`: di chuyển `platform_median_rating()` lên **trước** `eligible_candidates`, truyền kết quả vào để SQL dùng đúng trung vị hiện tại.
- `eligible_candidates`, `_filter_params`: thêm tham số `platform_median` / `effective_median`.
- `tests/test_matching_db.py`: sửa `test_language_session_type_and_rating` theo hành vi mới (mentor mới `new` qua được `minRating=4` nhờ trung vị 4,2 của hai mentor thật trong test, `excludedBy` còn 1 thay vì 2); thêm `test_min_rating_uses_effective_rating_for_new_mentors` kiểm riêng đường fallback 3,5.
- `scripts/e2e_s2_profile_matching.py`: sửa lại tên và chú thích của check `minRating=4` cho đúng cơ chế mới (giữ nguyên kỳ vọng số liệu, vì trong dữ liệu của lần chạy này không ai đủ 3 đánh giá nên trung vị vẫn rơi về fallback 3,5 < 4) — xem ghi chú rủi ro dưới.

**Lệnh đã chạy:**
```
cd matching-service
pytest tests/ -q -k rating      # trước khi chạy full suite
pytest tests/ -q                # full suite

# build lại image để container e2e dùng code mới (không mount volume)
docker compose build matching-service && docker compose up -d matching-service

cd scripts
PYTHONIOENCODING=utf-8 INTERNAL_API_KEY=change-me-internal-service-key python e2e_s2_profile_matching.py
```

**Output thật:**
- `pytest -k rating`: `6 passed` (gồm 1 test mới của T2, cộng các test rating/median đã có ở `test_matching_db.py`, `test_pipeline.py`, `test_ranking_signals.py`).
- `pytest tests/` đầy đủ: `108 passed, 1 failed` (107 trước đó + 1 test mới; 1 fail là lỗi mã hoá đã ghi ở T0, không liên quan).
- `docker compose build matching-service` + `up -d`: container khởi động `healthy` sau ~22s, log không có `RuntimeError` — xác nhận gián tiếp T1 (kiểm tra trọng số) không chặn khởi động với cấu hình mặc định.
- e2e: `35/35 PASS`, bao gồm check minRating đã đổi tên và chú thích.

**Kết luận:** ĐẠT theo output mong đợi ở §11.1 — mentor mới được so bằng trung vị nền tảng (có fallback), không còn bị loại oan vì rating thô = 0; mentor có đánh giá thật vẫn bị lọc đúng theo rating thật; `excludedBy` vẫn đúng nghĩa (đếm mentor chỉ trượt riêng `minRating`).

**Phát hiện phụ — rủi ro cần lưu ý (không chặn T2, nhưng ghi lại để không quên):**
`platform_median_rating()` tính trung vị **trên toàn hệ thống** (mọi mentor APPROVED có ≥3 đánh giá), không giới hạn theo domain hay theo lần chạy e2e. Môi trường docker compose đang chạy liên tục (15+ giờ, nhiều script seed/e2e khác đã chạy qua), nên kết quả của check `minRating=4` trong e2e phụ thuộc vào trạng thái TOÀN CỤC của DB tại thời điểm chạy, không chỉ 36 mentor do chính script này tạo. Đã xác nhận bằng truy vấn trực tiếp: hiện tại `count(*) = 0` mentor nào đủ 3 đánh giá trong `profile_db`, nên trung vị là `None` → fallback 3,5 → check vẫn đúng. Nếu sau này có script khác đồng bộ rating thật (qua mentoring-service) cho mentor đủ 3 đánh giá với rating ≥ 4, trung vị nền tảng sẽ đổi và có thể làm check này cần cập nhật lại ngưỡng — đây là đặc tính đã biết của thiết kế (trung vị dùng chung toàn nền tảng), không phải lỗi của T2.

---
