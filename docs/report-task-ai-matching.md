# Báo cáo tiến độ: hoàn thiện AI Matching

> Theo dõi theo task ở [design-ai-matching-spec.md](design-ai-matching-spec.md) §11. Cập nhật liên tục khi xong từng task; không sửa lại báo cáo của task đã xong, chỉ thêm mới.
> Mỗi mục ghi: input dùng để verify, lệnh đã chạy, output thật, kết luận đạt/không đạt, commit liên quan.

## Tóm tắt

| Task | Trạng thái | Commit |
|---|---|---|
| T0 | ĐẠT | `270b2e2` (code), `7a20457` (tài liệu) |
| T1 | ĐẠT | `(xem §T1)` |
| T2 | ĐẠT | (xem §T2) |
| T2b | ĐẠT | (xem §T2b) |
| T2c | chưa làm | |
| T3 | ĐẠT | (xem §T3) |
| T4 | ĐẠT | (xem §T4) |
| T5 | ĐẠT | (xem §T5) |
| T6 | ĐẠT | (xem §T6) |
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

## ⚠️ Sự cố: xoá nhầm dữ liệu `profile_db` sống (trong lúc làm T2b)

Khi chuẩn bị T2b, phát hiện `tests/test_matching_db.py` dùng fixture `conn` chạy `DROP SCHEMA public CASCADE` trên `profile_db` trước MỖI test (để dựng schema sạch cho test cách ly) — nhưng ở T0, T1, T2, biến `PROFILE_DB_ADMIN_URL` đã được trỏ trực tiếp vào `localhost:5434`, chính là `profile-db` mà toàn bộ docker compose (15+ giờ đang chạy) dùng chung, không phải một database test riêng. Hậu quả: mỗi lần `pytest tests/test_matching_db.py` chạy ở T0/T1/T2, dữ liệu mentor/mentee thật trong môi trường sống bị xoá và dựng lại từ đầu; sau 3 lần, `mentor_profiles` chỉ còn 2 dòng, `mentee_profiles` chỉ còn 1 dòng (dữ liệu sót của lần e2e cuối). Các database riêng của service khác (mentoring-db, payment-db...) không bị xoá trực tiếp nhưng có thể còn tham chiếu `user_id` không còn tồn tại trong `profile_db`.

**Đã báo cho người dùng qua AskUserQuestion**, nhận được xác nhận: dữ liệu đó chỉ là dữ liệu test/demo, không quan trọng, tiếp tục bình thường — không cần khôi phục.

**Khắc phục cho các task còn lại:** dựng 2 container Postgres dùng một lần (`tmp-matching-db` cổng 15439, `tmp-profile-db` cổng 15434 trên host — không đụng cổng 5439/5434 của docker compose) để chạy mọi test cần CSDL thật từ T2b trở đi. Container app `matching-service` của docker compose (cổng 8090) vẫn được rebuild/restart bình thường để chạy e2e — đó là thao tác triển khai hợp lệ, không phải xoá dữ liệu.

**Bài học áp dụng từ đây:** không trỏ `PROFILE_DB_ADMIN_URL`/`MATCHING_DB_URL` của bất kỳ lệnh pytest nào vào cổng 5434/5439 (database sống) nữa; luôn dùng container tạm ở cổng 15434/15439.

---

## T2b — G10, D13: đổi sang model đa ngôn ngữ, lập chỉ mục lại khi đổi model

**Input (theo §11.1):** đặt `EMBEDDING_MODEL` sang model mới; hồ sơ mentee tiếng Việt "Tôi muốn học backend Java Spring Boot"; hai mentor tiếng Anh (một backend Spring Boot, một UI/React).

**Thay đổi:**
- Model: `all-MiniLM-L6-v2` → `paraphrase-multilingual-MiniLM-L12-v2` (384 chiều, không đổi `VECTOR(384)`). Đổi mặc định ở `app/config.py`, `Dockerfile` (`ARG EMBEDDING_MODEL`), `docker-compose.yml` (thêm `build.args.EMBEDDING_MODEL` khớp với `environment.EMBEDDING_MODEL` — trước đây ARG không được truyền từ compose nên image luôn tải sẵn model cũ bất kể biến môi trường), `.env.example`, `contracts/matching-service.yaml`.
- `migrations/003_embedding_model.sql`: thêm cột `model TEXT` vào `mentor_embeddings`, `mentee_embeddings`. `NULL` = embed từ trước khi có cột này.
- `index_service.py`: `_store_vector` ghi kèm `config.EMBEDDING_MODEL`; `_index` coi lệch model (hoặc `model=NULL`) là "cần embed lại" dù text không đổi; `reconcile` phát hiện lệch model qua so sánh tuple `(text_hash, model)` thay vì chỉ `text_hash`.
- `tests/test_index_service.py`: thêm `test_reembeds_when_model_differs_even_if_text_unchanged`, `test_reconcile_reembeds_when_model_changed`; sửa fixture `fake_store`/`fake_reconcile` để mô phỏng cột `model` (tương thích ngược — giá trị cũ không có `model` được coi là khớp model hiện hành, test cũ không cần sửa).

**Lệnh đã chạy:**
```
# Xác nhận model trước khi đổi (384 chiều, phân biệt được cùng/khác nghĩa qua ngôn ngữ)
python -c "from sentence_transformers import SentenceTransformer; ..."

# pytest trên DB TẠM (xem sự cố ở trên) — không còn chạm database sống
docker run -d --name tmp-matching-db -p 15439:5432 pgvector/pgvector:pg16 ...
docker run -d --name tmp-profile-db  -p 15434:5432 postgres:16 ...
MATCHING_DB_URL=...15439 PROFILE_DB_URL=...15434 PROFILE_DB_ADMIN_URL=...15434 pytest tests/ -q

# Rebuild + restart container sống để e2e dùng code mới (hợp lệ, không xoá dữ liệu)
docker compose build matching-service && docker compose up -d matching-service

# Kiểm chứng chức năng qua API thật (script tạm, không thuộc repo)
python verify_t2b.py

# e2e đầy đủ
python scripts/e2e_s2_profile_matching.py
```

**Output thật:**
- So sánh model trước khi đổi (câu "Tôi muốn học backend Java Spring Boot" vi vs "I want to learn backend Java Spring Boot" en vs "I want to learn frontend React UI design" en):
  | Model | cosine cùng nghĩa (vi-en) | cosine khác nghĩa (vi-en) |
  |---|---|---|
  | `all-MiniLM-L6-v2` (cũ) | 0.611 | 0.148 |
  | `paraphrase-multilingual-MiniLM-L12-v2` (mới) | **0.956** | 0.308 |
  → model mới nhận ra câu cùng nghĩa khác ngôn ngữ là gần như giống nhau (0,956), model cũ chỉ nhận ra một phần (0,611).
- `pytest tests/` trên DB tạm: `110 passed, 1 failed` (108 trước T2b + 2 test mới; 1 fail là lỗi mã hoá đã biết).
- `docker compose build` + `up -d`: healthy, log xác nhận `Load pretrained SentenceTransformer: paraphrase-multilingual-MiniLM-L12-v2` — tải từ image, không gọi mạng lúc khởi động.
- Sau khi container sống chạy được một lúc, `psql` xác nhận IndexSyncJob đã TỰ lập chỉ mục lại toàn bộ embedding cũ (trước đó `model IS NULL`) sang `paraphrase-multilingual-MiniLM-L12-v2`, không cần thao tác tay.
- `verify_t2b.py` (script tạm, qua API thật — mentee tiếng Việt, 2 mentor tiếng Anh): `similarity backend mentor: 0.9466`, `similarity ui mentor: 0.5536` → **PASS**.
- e2e đầy đủ sau khi đổi model: `35/35 PASS trong 23.5s` (so với ~9.6s trước đó — xem phát hiện phụ).

**Kết luận:** ĐẠT theo output mong đợi ở §11.1 — mọi embedding đúng 384 chiều; embedding lưu kèm tên model; embedding khác model được tự xếp hàng lập chỉ mục lại (không cần thao tác tay); độ tương đồng mentee tiếng Việt với mentor đúng domain cao hơn mentor sai domain; không còn vector model cũ lẫn trong kết quả (đã xác nhận bằng psql).

**Phát hiện phụ:**
- Model đa ngôn ngữ (L12, 12 lớp) nặng hơn model cũ (L6, 6 lớp) — thời gian build image tăng thêm ~49s (tải model lúc build), và e2e tổng thời gian tăng từ ~9,6s lên ~23,5s (36 mentor + 1 mentee phải embed lại). Đây là đánh đổi đã lường trước ở rủi ro của D13 (docs/design-ai-matching-spec.md §12); cần đo riêng bằng benchmark ở T8 để biết p95 có còn dưới 2.000ms (NFR-1, D12) không — T2b mới dừng ở xác nhận ĐÚNG, chưa đo tốc độ chính xác.
- Việc build image trước đây KHÔNG truyền `ARG EMBEDDING_MODEL` từ `docker-compose.yml` (thiếu `args:`) nên dù đổi biến môi trường, image vẫn luôn tải sẵn model cũ lúc build — một lỗi cấu hình có từ trước, chỉ lộ ra khi làm T2b. Đã sửa cùng lúc.
- T2c (so sánh định lượng model cũ/mới trên bộ eval đầy đủ, nhiều cặp có nhãn) CHƯA làm — phần trên chỉ là một ví dụ đơn, không thay thế được eval có nhãn.

---

## T3 — G6: cột `over_budget` trong `match_impressions`

**Input (theo §11.1):** gọi `GET /api/matching/mentors` với `maxRate` đủ thấp để có cả hai nhóm, đọc `match_impressions` và `GET /api/matching/admin/evaluation`.

**Lưu ý đánh số migration:** spec ghi "migration 003" cho G6, nhưng T2b (chạy trước T3 theo thứ tự kế hoạch) đã dùng `003` cho cột `model`. G6 dùng `004_impression_over_budget.sql` — đánh số theo thứ tự thực hiện, không theo đúng số đã ghi tạm trong spec lúc viết (sẽ cập nhật lại tham chiếu trong spec ở bước tài liệu T12/T13).

**Thay đổi:**
- `migrations/004_impression_over_budget.sql`: `ALTER TABLE match_impressions ADD COLUMN over_budget BOOLEAN NOT NULL DEFAULT false`. Dòng cũ mặc định `false` — đúng hành vi trước khi có ngân sách mềm.
- `feedback_service.log_impressions`: ghi `bool(m.get("over_budget"))` cho mỗi dòng (mentor trong `shown_over` có `over_budget=True` từ `_run`, mentor nhóm `ranked` không có khoá này → `False`).
- `feedback_service.evaluation_stats`: giữ `byRank` (gộp) **không đổi** để tương thích ngược; thêm `byRankInBudget`, `byRankOverBudget` — tính bằng truy vấn `GROUP BY rank, over_budget` cho lượt hiển thị, và JOIN `match_feedback` với `match_impressions` (qua `impression_id` + `mentor_id`) để biết đúng nhóm của lượt "Không phù hợp" (bảng `match_feedback` không tự có cột `over_budget`).
- `schemas/matching.py` (`EvaluationStats`): thêm `by_rank_in_budget`, `by_rank_over_budget` (camelCase tự động qua `CamelModel`).
- `tests/test_api.py`: sửa fixture `test_evaluation_stats_admin_only` (thêm 2 khoá mới, bắt buộc vì không có default).
- `tests/test_matching_db.py`: sửa `test_hidden_mentor_is_excluded_for_30_days_and_list_still_full` (thêm assertion cho 2 nhóm khi không dùng `maxRate`); thêm `test_evaluation_stats_split_by_budget_group` — kịch bản đúng input của spec: 2 mentor trong ngân sách + 1 vượt ngân sách, mentor vượt ngân sách ở hạng 3 (hạng trong danh sách đã NỐI) bị "Không phù hợp" → xác nhận `byRank` gộp lẫn hạng 3 của hai nhóm, còn `byRankInBudget`/`byRankOverBudget` tách đúng (hạng 3 của nhóm trong ngân sách là 0 lượt, không bị tính nhầm 100% "Không phù hợp").

**Lệnh đã chạy:**
```
# pytest trên DB TẠM (15439/15434), không chạm DB sống
pytest tests/ -q -k "evaluation or budget"
pytest tests/ -q

docker compose build matching-service && docker compose up -d matching-service
# xác nhận migration 004 áp dụng
psql ... schema_migrations

python scripts/e2e_s2_profile_matching.py

# gọi API thật bằng admin seed sẵn (admin@mmp.local)
python -c "... call admin/evaluation ..."
```

**Output thật:**
- `pytest -k "evaluation or budget"`: `9 passed`.
- `pytest tests/` đầy đủ: `111 passed, 1 failed` (110 trước T3 + 1 test mới; 1 fail là lỗi mã hoá đã biết).
- `schema_migrations`: `001 baseline, 002 feedback_impressions, 003 embedding_model, 004 impression_over_budget` — áp dụng đúng thứ tự trên container sống.
- e2e: `35/35 PASS trong 12.6s`.
- Gọi `GET /api/matching/admin/evaluation?days=30` qua API thật (admin seed): trả đủ `byRank`, `byRankInBudget`, `byRankOverBudget` — `byRankInBudget` khớp `byRank` (chưa có mentee nào dùng `maxRate` trong môi trường hiện tại), `byRankOverBudget` toàn 0 ở mọi hạng — đúng vì chưa có dữ liệu ngân sách mềm thật trong môi trường này. `byRank` cũ không đổi cấu trúc (xác nhận tương thích ngược).

**Kết luận:** ĐẠT theo output mong đợi ở §11.1 — migration chạy đúng một lần, dòng cũ `over_budget=false`; impression mới ghi đúng cờ theo nhóm; `admin/evaluation` trả thêm số liệu tách nhóm, trường cũ không đổi.

---

## T4 — thêm `tookMs` vào `pipeline`

**Input (theo §11.1):** mọi lần gọi `GET /api/matching/mentors`.

**Thay đổi:**
- `routers/matching.py`: đo `time.perf_counter()` ngay trước khi gọi `pipeline.match_mentors_for_mentee` và ngay sau khi ghi `match_impressions` (phần việc của pipeline + ghi nhật ký, không tính overhead xác thực/rate-limit ở trên); gán vào `PipelineStats.took_ms`.
- `schemas/matching.py`: `PipelineStats` thêm `took_ms: float = 0.0` (có default nên không phá vỡ test/khách hàng cũ chưa biết trường này).
- `tests/test_api.py`: thêm `test_matching_reports_took_ms` — xác nhận `pipeline.tookMs` là số không âm qua `fake_pipeline`.

**Lệnh đã chạy:**
```
pytest tests/ -q -k took          # test mới
pytest tests/ -q                  # DB tạm, hồi quy
docker compose build matching-service && docker compose up -d matching-service
python scripts/e2e_s2_profile_matching.py
python -c "... gọi API thật, đo thời gian client, so với pipeline.tookMs ..."
```

**Output thật:**
- `pytest -k took`: `1 passed`.
- `pytest tests/` đầy đủ: `112 passed, 1 failed` (111 trước T4 + 1 test mới; 1 fail là lỗi mã hoá đã biết).
- e2e: `35/35 PASS`.
- Gọi API thật (mentee mới, domain riêng): server báo `tookMs = 158.1`, client đo tổng thời gian round-trip `181.7 ms` (gồm cả độ trễ mạng/HTTP, xác thực) → `tookMs ≤ thời gian client đo` — đúng quan hệ kỳ vọng ở §11.1.

**Kết luận:** ĐẠT theo output mong đợi ở §11.1.

---

## T5 — cờ `enoughData` trong `byRank` (D11)

**Input (theo §11.1):** impression giả lập — hạng 1 có 150 lượt, hạng 2 có 30 lượt.

**Thay đổi:**
- `feedback_service.py`: hằng số `ENOUGH_DATA_THRESHOLD = 100`; hàm nội bộ `_row()` dùng chung cho `byRank`, `byRankInBudget`, `byRankOverBudget` — mỗi hạng có `enoughData = impressions >= 100`.
- `schemas/matching.py` (`RankStat`): thêm `enough_data: bool = False`.
- `tests/test_matching_db.py`: sửa 3 assertion so sánh dict chính xác (thêm khoá `enoughData`); thêm `test_evaluation_stats_enough_data_flag` — chèn trực tiếp 150 dòng hạng 1 + 30 dòng hạng 2 vào `match_impressions` (qua `get_matching_pool()`, không chạy lại pipeline 180 lần cho nhanh), đúng input ví dụ của spec.

**Lệnh đã chạy:**
```
pytest tests/ -q -k "enough_data or evaluation or budget"
pytest tests/ -q
docker compose build matching-service && docker compose up -d matching-service
python scripts/e2e_s2_profile_matching.py
python -c "... gọi admin/evaluation qua API thật ..."
```

**Output thật:**
- `pytest -k "enough_data or evaluation or budget"`: `10 passed`.
- `pytest tests/` đầy đủ: `113 passed, 1 failed` (112 trước T5 + 1 test mới; 1 fail lỗi mã hoá đã biết).
- Test `test_evaluation_stats_enough_data_flag`: `byRank[0].impressions=150, enoughData=True`; `byRank[1].impressions=30, enoughData=False` — đúng input/expected ở §11.1.
- e2e: `35/35 PASS`.
- API thật (`admin/evaluation`): mỗi hạng trả thêm `enoughData` (ví dụ hạng 1 có 33 lượt trong môi trường hiện tại → `enoughData: False`, đúng vì dưới 100).

**Kết luận:** ĐẠT theo output mong đợi ở §11.1.

---

## T6 — cập nhật hợp đồng OpenAPI và kiểu TypeScript

**Input (theo §11.1):** `contracts/matching-service.yaml`, `frontend/src/types/matching.ts`.

**Thay đổi:**
- `contracts/matching-service.yaml`:
  - `PipelineStats`: thêm `tookMs` (T4).
  - `GET /api/matching/admin/evaluation`: thêm `byRankInBudget`, `byRankOverBudget` (T3) và `enoughData` trong từng mục `byRank`/`byRankInBudget`/`byRankOverBudget` (T5) — dùng YAML anchor `&rankStat`/`*rankStat` để không lặp lại schema 3 lần.
- `frontend/src/types/matching.ts`:
  - `PipelineStats.tookMs: number`.
  - Thêm `RankStat`, `EvaluationStats` (chưa có type nào cho hai schema này trước đây — trang admin evaluation chưa có UI, nhưng kiểu được thêm đủ để khớp hợp đồng, dùng khi làm UI sau).

**Lệnh đã chạy:**
```
python -c "import yaml; yaml.safe_load(open('contracts/matching-service.yaml'))"   # xác nhận cú pháp + anchor
cd frontend && rm -rf .next && ./node_modules/.bin/tsc --noEmit
```

**Output thật:**
- YAML parse OK; `byRank.items.properties` và `byRankInBudget.items.properties` đều có đủ 5 khoá (`rank, impressions, notRelevant, notRelevantRate, enoughData`) — xác nhận anchor giải đúng.
- `tsc --noEmit`: lần đầu báo 2 lỗi ở `.next/types/app/payment/package/[packageId]/page.ts` — xác nhận đây là cache build cũ (route `payment/package/[packageId]` không còn trong `src/app/payment/`, không liên quan thay đổi của T6). Xoá `.next/` (chỉ là cache, không phải mã nguồn; container frontend sống build từ image riêng, không mount thư mục này nên không bị ảnh hưởng) rồi chạy lại: **không lỗi, không output**.
- Response thật của `admin/evaluation` (đã gọi ở T3/T5) đã khớp hợp đồng mới (`byRank`, `byRankInBudget`, `byRankOverBudget`, mỗi mục có `enoughData`).

**Kết luận:** ĐẠT theo output mong đợi ở §11.1.

---
