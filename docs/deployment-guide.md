# Hướng dẫn triển khai & kịch bản demo — MentorHub

## 1. Yêu cầu hệ thống

| Thành phần | Phiên bản | Ghi chú |
|---|---|---|
| Docker Engine / Docker Desktop | ≥ 24, có Docker Compose v2 | Bắt buộc |
| RAM trống | ≥ 6 GB | 5 JVM + 2 service Python (model embedding) + 7 PostgreSQL |
| Dung lượng đĩa | ≥ 8 GB | Image Maven/PyTorch CPU/Node |
| Python | ≥ 3.9 | Chỉ để chạy script seed / e2e / benchmark (chỉ dùng thư viện chuẩn) |
| Cổng trống | 3000, 5433–5439, 6379, 8081–8085, 8090, 8091 | 5439 = `matching-db` (pgvector) |
| Internet | Lần build đầu; khi bật DeepSeek | Tải dependency (kể cả font Nunito/Nunito Sans qua gói npm `@fontsource` — không gọi Google Fonts lúc build) và model embedding; engine rule-based chạy offline được |

Phát triển từng service (không bắt buộc): JDK 21 + Maven 3.9, Python 3.11, Node.js 20.

## 2. Khởi động toàn hệ thống

```bash
git clone <repo> && cd do_an_2026
cp .env.example .env            # tuỳ chỉnh nếu cần (xem mục 3)
docker compose up -d --build    # lần đầu mất khoảng 5–15 phút để build image
docker compose ps               # chờ tới khi 7 service báo (healthy)
```

Kiểm tra health:

```bash
for p in 8081 8082 8083 8084 8085 8090 8091; do curl -s localhost:$p/health; echo; done
```

Mở giao diện: <http://localhost:3000>

Nạp dữ liệu demo (7 mentor, 2 mentee):

```bash
python3 scripts/seed_demo.py
python3 scripts/make_sample_cv.py   # tạo scripts/sample-cv.pdf để demo upload CV
```

Dừng / xoá dữ liệu:

```bash
docker compose down         # dừng, giữ dữ liệu
docker compose down -v      # dừng và xoá toàn bộ volume (CSDL, file CV) — chạy lại từ đầu
```

> Schema CSDL (`db/init/*.sql`) chỉ được chạy khi volume CSDL được tạo lần đầu. Sau khi sửa file SQL,
> cần `docker compose down -v` để khởi tạo lại — xem **mục 8** trước khi nâng cấp từ phiên bản cũ.

## 3. Cấu hình (`.env`)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `JWT_SECRET` | chuỗi dev | Secret ký JWT dùng chung cho mọi service — **bắt buộc đổi khi triển khai thật**, ≥ 32 byte. Còn để giá trị dev trong code thì mỗi service log `WARN` lúc khởi động (không chặn) — tương tự với `INTERNAL_API_KEY` |
| `INTERNAL_API_KEY` | `dev-internal-key` | Khoá xác thực lời gọi `/internal/*` giữa các service |
| `DEEPSEEK_API_KEY` | trống | ai-service: có giá trị → AI Interview & CV enrichment dùng DeepSeek (lỗi thì tự fallback); trống → engine rule-based |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | Địa chỉ API DeepSeek (định dạng OpenAI) |
| `DEEPSEEK_MODEL` | `deepseek-flash` | Model DeepSeek, ví dụ `deepseek-v4-pro` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | `admin@mmp.local` / `Admin@123` | Tài khoản admin tạo sẵn |
| `FRONTEND_URL` | `http://localhost:3000` | Dùng trong liên kết xác thực email và liên kết giới thiệu |
| `INDEX_SYNC_INTERVAL` | `60` | matching-service: chu kỳ (giây) `IndexSyncJob` đối soát chỉ mục embedding với `profile_db` — cũng là độ trễ tối đa (xấp xỉ) để hồ sơ xuất hiện trong matching khi thông báo reindex bị mất |

Các tham số khác (đặt trong `environment` của service tương ứng trong `docker-compose.yml`):
`INTERVIEW_MAX_TURNS` (5), `ENRICHMENT_MAX_TURNS` (4), `DEEPSEEK_MAX_TOKENS` (4000),
`DEEPSEEK_TIMEOUT_SECONDS` (60), `PROFILE_SYNC_RETRY_SECONDS` (120) — ai-service; `EMBEDDING_MODEL`,
`INDEX_SYNC_INTERVAL` (60), `INDEX_SYNC_BATCH` (200), `INDEX_SYNC_ENABLED` (true) — matching-service;
`ACCESS_TOKEN_TTL` (PT30M), `REFRESH_TOKEN_TTL` (P7D), `EXPOSE_VERIFICATION_TOKEN` (true — hiển thị
liên kết xác thực email trên giao diện vì demo không có SMTP).

## 4. Tài khoản demo

| Vai trò | Email | Mật khẩu | Ghi chú |
|---|---|---|---|
| Admin | `admin@mmp.local` | `Admin@123` | |
| Mentee | `mentee@demo.local` | `Demo@123` | Backend, mục tiêu Java + system design |
| Mentee | `mentee.frontend@demo.local` | `Demo@123` | Frontend |
| Mentor | `mentor.java@demo.local` | `Demo@123` | Backend Java, 300.000đ/giờ, đã duyệt |
| Mentor | `mentor.node@demo.local` | `Demo@123` | Backend Node.js, đã duyệt |
| Mentor | `mentor.python@demo.local` | `Demo@123` | Backend Python, **miễn phí**, đã duyệt |
| Mentor | `mentor.react@demo.local` | `Demo@123` | Frontend, đã duyệt |
| Mentor | `mentor.devops@demo.local` | `Demo@123` | DevOps, đã duyệt |
| Mentor | `mentor.data@demo.local` | `Demo@123` | Data/AI, đã duyệt |
| Mentor | `mentor.full@demo.local` | `Demo@123` | Backend Java, **chưa phỏng vấn** — dùng để demo AI Interview & lọc matching |

Thẻ test: `4242 4242 4242 4242` (thành công), `4000 0000 0000 0002` (bị từ chối), hạn dùng bất kỳ ở
tương lai (MM/YY), CVV 3 chữ số.

## 5. Kịch bản demo trước hội đồng (~20 phút)

Mở 3 cửa sổ trình duyệt (hoặc 1 cửa sổ thường + 2 cửa sổ ẩn danh) cho Mentee, Mentor, Admin.

### Phần A — Quang: Auth, Learning Hub, CV Parsing + Chatbot enrichment (~6 phút)
1. **Đăng ký** tài khoản mentee mới, nhập mã giới thiệu lấy từ trang *Giới thiệu* của
   `mentee@demo.local` → trang chủ hiển thị liên kết xác thực email → bấm xác thực.
2. Đăng nhập sai mật khẩu 5 lần với một email **khác** email dùng để demo (ví dụ `thu@demo.local`) →
   lần thứ 6 báo bị chặn tạm thời 15 phút (chống brute-force).
3. **Learning Hub**: đăng ký khoá "Java Spring Boot căn bản", tích hoàn thành 2 tài liệu → tiến độ 50%;
   mở roadmap Backend.
4. **Hồ sơ**: tạo hồ sơ mentee (backend, mục tiêu ngắn "học backend").
5. **CV & làm rõ mục tiêu**: tải `scripts/sample-cv.pdf` → giải thích thẻ thông tin trích xuất (kỹ năng
   theo tần suất, 2 dự án, 1 năm kinh nghiệm) → chatbot hỏi 4 câu; trả lời lượt 1 có mốc "6 tháng" để
   chứng minh chatbot không hỏi lại thời gian → xem mục tiêu tổng hợp, mở lại *Hồ sơ* thấy goal và kỹ
   năng đã cập nhật; `GET /api/matching/index-status?userId=…` cho thấy `indexedAt` đã đổi.

### Phần B — Thảo: Career Profile, AI Matching (~6 phút)
1. Đăng nhập `mentee@demo.local` → *Tìm mentor* → giải thích dòng pipeline: top-K, số mentor bị loại
   theo từng lý do (với dữ liệu seed ban đầu: 1 chưa xác thực, 3 khác lĩnh vực), trọng số.
2. Giải thích thẻ mentor đầu tiên (Nguyễn Hoàng Long): % phù hợp, kỹ năng trùng tô xanh, lý do "Có
   chuyên môn phù hợp mục tiêu: System Design".
3. Đăng nhập `mentor.full@demo.local` → chỉ ra mentor này (Java, backend) **không** có trong kết quả vì
   chưa qua AI Interview.
4. Sửa mục tiêu mentee (ví dụ thêm "DevOps, Docker") → lưu → tìm lại, quan sát điểm tương đồng và
   thứ tự thay đổi theo nội dung hồ sơ mới.
5. (Tuỳ chọn) chạy `python3 scripts/benchmark_matching.py` để trình bày NFR-1.

### Phần C — Thắng: AI Interview, Mentoring workflow, Thanh toán, Referral (~8 phút)
1. `mentor.full@demo.local` → *AI Interview* → trả lời 5 câu (1 câu chi tiết có số liệu để thấy câu
   hỏi đào sâu, 1 câu ngắn để thấy chuyển chủ đề) → xem đánh giá tổng hợp, trạng thái chờ duyệt.
2. Admin → *Duyệt mentor* → mở buổi phỏng vấn, đọc hội thoại + điểm từng câu → *Duyệt & kích hoạt*.
3. `mentee@demo.local` → tìm mentor → mentor.full xuất hiện → *Gửi yêu cầu mentoring*.
4. `mentor.full` → *Yêu cầu* → *Chấp nhận*.
5. Mentee → hồ sơ mentor → *Đặt lịch*: thử giờ ngoài lịch rảnh (bị từ chối) → chọn Thứ Hai 19:00 →
   chuyển trang thanh toán → thẻ `…0002` (thất bại) → thẻ `4242…` (thành công) → phiên *Đã xác nhận*.
6. Mentor → *Phiên học* → *Đánh dấu hoàn thành* → Mentee → *Đánh giá* 5 sao → hồ sơ mentor cập nhật rating.
7. Mentee mới ở Phần A (được giới thiệu) đặt & thanh toán một phiên → tài khoản giới thiệu nhận +100 điểm
   ở trang *Giới thiệu*; Admin → *Giao dịch* → tab *Referral*.
8. Chuông thông báo: các thông báo yêu cầu được chấp nhận, phiên đã xác nhận, nhắc lịch.

> Mẹo: chạy `python3 scripts/e2e_acceptance.py` để kiểm tra nhanh toàn hệ thống (lần chạy 06/10/2026: `66/66 kiểm tra PASS trong 3.1s`).
> Script này tạo thêm người dùng/mentor thử nghiệm, nên trước buổi demo hãy làm sạch dữ liệu:
> `docker compose down -v && docker compose up -d --build` rồi chạy lại `seed_demo.py`.

## 6. Chạy từng service khi phát triển

```bash
# CSDL + Redis bằng Docker
docker compose up -d auth-db profile-db matching-db mentoring-db payment-db learning-db ai-db redis

# Service Java (cổng CSDL mặc định trong application.yml trỏ về localhost:543x)
cd auth-service && mvn spring-boot:run

# matching-service (MATCHING_DB_URL mặc định localhost:5439, PROFILE_DB_URL mặc định
# matching_reader@localhost:5434 — chỉ đọc)
cd matching-service && python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt && uvicorn app.main:app --port 8090 --reload

# ai-service (AI_DB_URL mặc định trỏ về localhost:5438)
cd ai-service && python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt && uvicorn app.main:app --port 8091 --reload

# frontend (proxy tới localhost:808x theo mặc định)
cd frontend && npm install && npm run dev
```

## 7. Xử lý sự cố

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Service Java restart liên tục | CSDL chưa sẵn sàng hoặc schema cũ | `docker compose logs <service>`; nếu đã sửa SQL: `docker compose down -v` rồi `up` lại |
| Tìm mentor báo "hoàn thành hồ sơ" dù đã lưu | Chỉ mục embedding chưa có (matching-service chưa lên lúc lưu hồ sơ) | Chờ `matching-service` healthy; `IndexSyncJob` tự bắt kịp trong 1 phút, hoặc admin gọi `POST /api/matching/admin/embeddings/rebuild`. Kiểm tra bằng `GET /api/matching/index-status?userId=…` |
| `matching-service` không khởi động được | `matching-db` chưa sẵn sàng hoặc thiếu extension `vector` | `docker compose ps matching-db`; nếu đã sửa `db/init/matching-service.sql` thì `docker compose down -v` rồi `up` lại |
| Không thấy mentor nào | Chưa seed, hoặc mentor chưa được duyệt/chưa có lịch rảnh/khác lĩnh vực | Chạy `seed_demo.py`; xem dòng thống kê pipeline trên trang |
| Đặt lịch báo "Mentor không rảnh" | Thời điểm ngoài khung rảnh (giờ Việt Nam) hoặc phiên vượt quá giờ kết thúc | Chọn giờ nằm trọn trong khung lịch hiển thị ở hồ sơ mentor |
| Upload CV báo không đọc được | PDF ảnh scan | Dùng PDF có lớp văn bản (xuất từ Word/Google Docs) |
| matching-service 401 với mọi token | `JWT_SECRET` giữa các service khác nhau | Đặt cùng giá trị trong `.env`, `docker compose up -d` lại |
| AI Interview / tải CV lỗi 502 hoặc `/health` của 8091 báo `dbConnected: false` | ai-service hoặc ai-db chưa chạy | `docker compose ps ai-service ai-db`, `docker compose logs ai-service` |
| Hội thoại enrichment xong nhưng `profileSynced = false` | profile-service tạm thời lỗi | Job nền của ai-service thử lại mỗi 2 phút; xem `docker compose logs ai-service profile-service` |
| Đã điền `DEEPSEEK_API_KEY` nhưng `/health` của 8091 vẫn `llmEnabled: false` | Container chưa nhận biến mới | `docker compose up -d ai-service` sau khi sửa `.env` |
| Cổng bị chiếm | Ứng dụng khác dùng 3000/5433/8081… | Tắt ứng dụng đó hoặc đổi cổng host trong `docker-compose.yml` |

## 8. Nâng cấp phiên bản & migration CSDL

### 8.1 Nguyên tắc (US-11 — áp dụng cho MỌI service)

Schema được nâng cấp **tại chỗ, không mất dữ liệu** bằng migration đánh số chạy lúc service khởi động.
`db/init/<service>.sql` vẫn được mount vào `/docker-entrypoint-initdb.d/` và **giữ nguyên** (chỉ chạy khi
volume mới tạo); mọi thay đổi schema sau mốc này nằm trong migration, **không sửa `db/init`**.

| Loại service | Công cụ | Thư mục | Bảng lịch sử |
|---|---|---|---|
| Java (Spring Boot) | Flyway (`flyway-core` + `flyway-database-postgresql`, phiên bản do Spring Boot quản lý) | `src/main/resources/db/migration/V<n>__<mo_ta>.sql` | `flyway_schema_history` |
| Python (FastAPI) | Runner tự viết ~60 dòng (`ai-service/app/migrations.py`) | `<service>/migrations/NNN_<mo_ta>.sql` | `schema_migrations(version, name, applied_at)` |

Quy tắc chung:
1. **Baseline**: `V1__baseline.sql` (Java) / `001_baseline.sql` (Python) là **bản sao nguyên văn** của
   `db/init/<service>.sql` tại thời điểm chuyển sang migration (ai-service có test so khớp hai file).
2. **Java** — cấu hình trong `application.yml`:
   ```yaml
   spring:
     flyway:
       enabled: true
       baseline-on-migrate: true   # volume do db/init tạo: có bảng nhưng chưa có flyway_schema_history
       baseline-version: 1         # => Flyway ghi baseline V1 (không chạy lại V1) rồi chạy V2, V3...
       locations: classpath:db/migration
   ```
   Hibernate vẫn `ddl-auto: none`. Volume rỗng hoàn toàn (không mount db/init) thì V1 chạy như bình thường.
3. **Python** — mọi file `CREATE` trong baseline dùng `IF NOT EXISTS` nên chạy lại trên volume do db/init
   tạo là no-op. Runner: lấy `pg_advisory_lock`, tạo `schema_migrations` nếu chưa có, chạy từng file chưa
   áp **trong một transaction riêng** rồi ghi phiên bản; file lỗi ⇒ rollback, service **không khởi động**
   (fail-fast). Gọi runner trước khi pool CSDL được dùng (ai-service: trong `db.get_pool()`).
4. Thay đổi mới = **thêm file số kế tiếp** (`V2__...`, `002_...`). Không bao giờ sửa/đổi tên file đã merge
   (Flyway kiểm checksum và sẽ từ chối khởi động). Migration phải chạy được trên dữ liệu thật: thêm cột thì
   có `DEFAULT` hoặc cho phép NULL, đổi `CHECK` thì `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`.
5. Mỗi PR đổi schema kèm migration + code + contract trong cùng PR; **không còn** ghi chú "cần `down -v`".
6. Team khác áp dụng y hệt: copy `db/init/<service>.sql` thành baseline, thêm 2 dependency Flyway và khối
   cấu hình ở bước 2 (Java), hoặc copy `ai-service/app/migrations.py` (Python, đổi `_LOCK_KEY`).

Migration hiện có:

| Service | Migration |
|---|---|
| auth-service | `V1__baseline`, `V2__password_reset_tokens` (US-09) |
| learning-service | `V1__baseline` |
| ai-service | `001_baseline` |

Kiểm tra trạng thái:
```bash
docker compose exec auth-db psql -U postgres -d auth_db -c "SELECT version, description, success FROM flyway_schema_history ORDER BY installed_rank"
docker compose exec ai-db psql -U postgres -d ai_db -c "SELECT * FROM schema_migrations ORDER BY version"
```

### 8.2 Nâng cấp từ bản trước `R-1` (embedding còn nằm trong profile-service)

Máy đã chạy bản cũ sẽ có `profile_db` còn cột `embedding`, `embedding_text_hash`, `embedding_updated_at`
(image pgvector) và **không có** `matching_db`. Bản mới thì entity profile-service không còn các cột đó
và matching-service cần `matching-db` (cổng 5439).

> ⚠️ **Mất dữ liệu**: `docker compose down -v` xoá **mọi** volume của dự án — 7 CSDL (tài khoản, hồ sơ,
> phiên, giao dịch, phỏng vấn…) và volume `cv-storage` (file CV). Chỉ làm trên máy dev/demo. Nếu cần giữ
> dữ liệu, sao lưu trước bằng `docker compose exec <db> pg_dump -U postgres <tên_db> > backup.sql` —
> nhưng bản sao lưu của `profile_db` cũ không khôi phục thẳng vào schema mới được.

```bash
docker compose down -v                 # dừng và xoá toàn bộ volume
docker compose up -d --build           # build lại image, khởi tạo 7 CSDL từ db/init/*.sql
docker compose ps                      # chờ mọi service (healthy)
python3 scripts/seed_demo.py           # nạp lại dữ liệu demo; script tự chờ chỉ mục embedding sẵn sàng
python3 scripts/make_sample_cv.py      # (tuỳ chọn) tạo lại CV mẫu để demo
```

### 8.3 Kiểm chứng sau khi nâng cấp

```bash
# 1) Có đủ 7 CSDL, trong đó matching-db
docker compose ps --format '{{.Service}} {{.Status}}' | grep -- '-db'

# 2) profile_db KHÔNG còn cột vector (kết quả phải rỗng)
docker compose exec profile-db psql -U postgres -d profile_db -tAc \
  "SELECT table_name, column_name FROM information_schema.columns WHERE column_name LIKE 'embedding%'"

# 3) matching_db có 2 bảng chỉ mục và extension vector
docker compose exec matching-db psql -U postgres -d matching_db -c '\dt' -c '\dx vector'

# 4) Role read-only hoạt động: SELECT được, ghi bị từ chối (permission denied)
docker compose exec profile-db psql -U matching_reader -d profile_db -c "SELECT count(*) FROM mentor_profiles"
docker compose exec profile-db psql -U matching_reader -d profile_db -c "UPDATE mentor_profiles SET bio = bio"

# 5) Chỉ mục đã được lập cho dữ liệu seed (số dòng có vector ≈ số hồ sơ)
docker compose exec matching-db psql -U postgres -d matching_db -tAc \
  "SELECT (SELECT count(*) FROM mentor_embeddings WHERE embedding IS NOT NULL),
          (SELECT count(*) FROM mentee_embeddings WHERE embedding IS NOT NULL)"

# 6) Kiểm thử chấp nhận toàn hệ thống
python3 scripts/e2e_acceptance.py
```

Dấu hiệu chưa khởi tạo lại: profile-service khởi động được nhưng `matching-service` không lên (không kết
nối được `matching-db`), hoặc bước 2 còn trả về cột `embedding*`.

### 8.4 Thay đổi schema về sau
1. Với service đã có migration (mục 8.1): thêm file migration số kế tiếp, **không** sửa `db/init`. Kéo
   code mới rồi `docker compose up -d --build <service>` là đủ — migration tự chạy, dữ liệu được giữ.
2. Service chưa chuyển sang migration (còn dùng cách cũ): sửa `db/init/<service>.sql`, ghi "cần `down -v`"
   trong PR và chạy lại mục 8.2 — nên chuyển sang migration theo mục 8.1 bước 6 thay vì tiếp tục cách này.
3. Rollback: migration chỉ đi tiến. Muốn hoàn tác thì viết migration mới đảo ngược thay đổi; trên môi
   trường demo có thể `down -v` + `seed_demo.py`.
4. Đổi model embedding hoặc format văn bản chuẩn hoá **không** cần migration: đặt `EMBEDDING_MODEL`,
   khởi động lại matching-service rồi gọi `POST /api/matching/admin/embeddings/rebuild?force=true`
   (hoặc chờ `IndexSyncJob` tự phát hiện hash lệch).
