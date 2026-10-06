# Phân tích hiện trạng & danh sách cần cập nhật — MentorHub

> **Vai trò tài liệu**: System Analyst — chụp lại *hệ thống đang có gì* và *còn phải sửa gì*.
> **Ảnh chụp**: 21/09/2026 01:06 · `HEAD = 696917c` · **working tree KHÔNG sạch** (~39 file thay đổi chưa commit).
> **Cảnh báo**: refactor `R-1` (mục B.1) **được hoàn tất trong lúc lập tài liệu này** — các mục B.2, B.3, B.4, B.5, B.9 đã đóng ngay trong phiên rà soát. Mọi trạng thái dưới đây phải kiểm chứng lại bằng lệnh ở **Phần E** trước khi trích dẫn vào báo cáo.


> ## 🆕 Cập nhật 06/10/2026 — đợt hoàn thiện (1 PM + 3 kỹ sư)
>
> **Kết quả kiểm chứng (chạy thật, không đếm tay)**: `docker compose up --build` → 7/7 service + 7 CSDL `healthy` ·
> e2e **66/66 PASS** (3,1 s) · unit test **156/156 pass, 0 skip** (auth 9, learning 2, profile 5, mentoring 12,
> payment 13, matching 41, ai 74 — Python chạy trên Postgres/pgvector thật) · benchmark ~5.000 mentor **p95 3,6 ms** ·
> frontend 26/26 route HTTP 200 · **107 endpoint** (100 + 7 `/health`), contract = mã nguồn.
>
> | Mục | Trạng thái | Ghi chú |
> |---|---|---|
> | B.6 test `reconcile()` | ✅ đóng | `matching-service/tests/test_index_db.py` (5 test, Postgres thật; FAIL thay vì skip khi `CI` được đặt) |
> | B.7 CI matching-service | ✅ đóng | job có `pgvector/pgvector:pg16` + `postgres:16`, 3 biến `*_DB_URL` |
> | B.8 tài liệu | ✅ đóng | thêm `adr.md` (5 ADR), `cv-data-policy.md`, mục migration trong `deployment-guide.md` §8, "Hạn chế đã biết"; số liệu đã điền |
> | B.10 `.env.example` | ✅ đóng | đủ mọi biến compose đọc; 4 biến matching-service nay được truyền qua `docker-compose.yml` |
> | B.11 bí mật mặc định | 🟡 giảm nhẹ | cả 7 service log WARN khi `JWT_SECRET`/`INTERNAL_API_KEY` là giá trị dev (không chặn khởi động) |
> | **Lỗi bảo mật mới phát hiện** — mọi MENTOR tải được mọi CV | ✅ sửa | chỉ mentor có yêu cầu PENDING/ACCEPTED với chủ CV (`GET /internal/relationships` của mentoring-service), fail-closed |
> | Không có API xoá CV | ✅ thêm | `GET /api/ai/cv/mine`, `DELETE /api/ai/cv/{id}` + UI "CV của tôi" trên `/profile` |
> | Link "Xem CV" trên hồ sơ hỏng (thiếu token → 401) | ✅ sửa | frontend tải file kèm token (`apiBlob`) |
> | Build frontend phụ thuộc Google Fonts | ✅ sửa | font tự host qua `@fontsource` — build offline được |
> | Thiếu trang duyệt mentor | ✅ thêm | `/mentors`: tìm kiếm, lọc lĩnh vực, phân trang (API `GET /api/profile/mentors` đã có sẵn) |
> | Frontend JavaScript | ✅ chuyển | **TypeScript strict** (`tsc --noEmit` sạch, không `any`), ESLint `next/core-web-vitals` chạy được |
> | Trạng thái loading/lỗi thiếu ở nhiều trang | ✅ sửa | ~15 trang hiển thị lỗi thay vì quay vô hạn/trang trắng |
>
> **Còn mở**: `R-1` + toàn bộ thay đổi trên **vẫn chưa commit** (việc của nhóm); chưa thử giao diện bằng trình duyệt thật
> cho `/mentors` và "CV của tôi" (đã kiểm qua API + build); CV vẫn chưa có thời hạn lưu / mã hoá khi lưu (xem `cv-data-policy.md` §7).
> Các phần bên dưới là ảnh chụp 21/09/2026, giữ lại để truy xuất.

---

## 0. Tóm tắt điều hành

| | Nội dung |
|---|---|
| ✅ **Đang có** | 7 backend service + 1 frontend Next.js, **7 CSDL PostgreSQL** + Redis, ~104 endpoint, 25 trang UI, 3 tính năng AI, contract OpenAPI cho 7 service, CI 8 job, 13 tài liệu đồ án |
| 🟢 **Vừa xong** | `R-1` — chuyển quyền sở hữu embedding từ profile-service sang matching-service. **Mã nguồn, hạ tầng, contract, unit test, frontend, script nghiệm thu và tài liệu đều đã đồng bộ**: CSDL `matching_db` riêng, `IndexSyncJob`, `MatchingIndexClient`, 3 endpoint mới |
| 🟢 **Tài liệu** | Đã cập nhật một lượt: `README.md`, `CONVENTIONS.md` (mục 1, 6, 7, 8 + cổng `5439`), `architecture.md`, `ai-features.md`, `database-design.md` (thêm §3 `matching_db`), `api-reference.md`, `testing-report.md`, `deployment-guide.md`, `SRD`, `business-domain`. Kiểm chứng: `grep -rn '/internal/embed\b\|embedding_text_hash\|EmbeddingRetryJob' docs/ README.md CONVENTIONS.md contracts/` không còn kết quả |
| 🟠 **Chưa đồng bộ** | CI chưa cấp CSDL cho matching-service (B.7), thiếu test `reconcile()` (B.6), `.env.example` còn thiếu vài biến (B.10) |
| ⚠️ **Rủi ro quy trình** | ~45 file đang thay đổi mà **chưa commit**. Cần commit `R-1` ngay |

**Kết luận**: phạm vi tính năng đã đầy đủ và `R-1` đã hội tụ ở cả tầng mã nguồn lẫn tài liệu. Rủi ro còn lại là **CI và độ phủ test của `reconcile()`** — xem B.6, B.7. Ưu tiên: commit `R-1` → bổ sung CI/test.

---

# PHẦN A — HIỆN TRẠNG (what we have)

## A.1 Bản đồ service

| Service | Công nghệ | Cổng | CSDL | Phụ trách | Trạng thái |
|---|---|---|---|---|---|
| `frontend` | Next.js 14.2.35 (App Router, JS), Tailwind v4 | 3000 | — | chung | ✅ |
| `auth-service` | Java 21 · Spring Boot 3.3 | 8081 | `auth_db` + Redis | Quang | ✅ |
| `profile-service` | Java 21 · Spring Boot 3.3 | 8082 | `profile_db` | Thảo | ✅ (vừa refactor) |
| `learning-service` | Java 21 · Spring Boot 3.3 | 8085 | `learning_db` | Quang | ✅ |
| `mentoring-service` | Java 21 · Spring Boot 3.3 | 8083 | `mentoring_db` | Thắng | ✅ |
| `payment-service` | Java 21 · Spring Boot 3.3 | 8084 | `payment_db` | Thắng | ✅ |
| `matching-service` | Python 3.11 · FastAPI · sentence-transformers | 8090 | `matching_db` + `profile_db` (read-only) | Thảo | ✅ (vừa refactor) |
| `ai-service` | Python 3.11 · FastAPI · DeepSeek/httpx · pypdf | 8091 | `ai_db` | Thắng + Quang | ✅ |

Hạ tầng phụ: `redis:7-alpine` (:6379) — **chỉ `auth-service` dùng**, cho đếm số lần đăng nhập sai (`LoginAttemptService`).

### Luồng gọi giữa các service (sau `R-1`)

```
browser → frontend :3000 → /api/<service>/** (proxy: src/app/api/[service]/[...path]/route.ts)
  auth-service      → payment-service            (tạo mã giới thiệu khi đăng ký)
  profile-service   → matching-service           (MatchingIndexClient: POST /internal/embeddings/reindex,
                                                  bất đồng bộ, best-effort, KHÔNG chặn việc lưu hồ sơ)
  matching-service  → profile_db (read-only)     (role SELECT-only `matching_reader`)
  matching-service  → matching_db (read-write)   (chỉ mục embedding — chỉ service này được ghi)
  mentoring-service → profile-service, payment-service
  payment-service   → mentoring-service
  ai-service        → profile-service, mentoring-service
```

**Điểm kiến trúc đáng nêu khi bảo vệ**: profile-service **không còn biết gì về embedding**. Nó chỉ báo “hồ sơ này vừa đổi”; matching-service tự quyết định nhúng lại hay không (so sánh `text_hash`). Thông báo có thể mất — `IndexSyncJob` quét định kỳ để chỉ mục hội tụ về nguồn sự thật.

## A.2 Dữ liệu — database-per-service (7 CSDL)

| CSDL | Service | Cổng host | Image | Bảng |
|---|---|---|---|---|
| `auth_db` | auth | 5433 | postgres:16 | `users`, `refresh_tokens` |
| `profile_db` | profile | 5434 | postgres:16 | `mentor_profiles`, `mentee_profiles`, `mentor_availability` |
| `mentoring_db` | mentoring | 5435 | postgres:16 | `mentoring_requests`, `sessions`, `reviews`, `notifications` |
| `payment_db` | payment | 5436 | postgres:16 | `transactions`, `referral_codes`, `referrals`, `reward_ledger` |
| `learning_db` | learning | 5437 | postgres:16 | `courses`, `course_materials`, `course_enrollments`, `material_completions`, `course_progress`, `roadmaps`, `roadmap_items`, `roadmap_item_progress` |
| `ai_db` | ai | 5438 | postgres:16 | `interviews`, `interview_turns`, `cv_documents`, `enrichment_conversations`, `enrichment_messages` |
| **`matching_db`** | **matching** | **5439** | **pgvector/pgvector:pg16** | `mentor_embeddings`, `mentee_embeddings` — `VECTOR(384)`, index HNSW cosine, `text_hash`, `attempts`, `last_error` |

- Schema tại `db/init/<service>.sql`, nạp **một lần duy nhất** khi container CSDL khởi tạo lần đầu → xem B.8.3 về migration.
- `profile_db` đã **đổi về `postgres:16`** (không còn cột vector nào).
- Không có khoá ngoại xuyên CSDL; liên kết giữa service là UUID logic.

## A.3 Bề mặt API

| Service | Ops trong contract | Ops trong mã nguồn | Khớp? |
|---|---|---|---|
| auth | 13 | 13 | ✅ |
| profile | 15 | 15 | ✅ |
| learning | 25 | 25 | ✅ |
| mentoring | 21 | 21 | ✅ |
| payment | 11 | 11 | ✅ |
| ai | 14 | 14 | ✅ |
| **matching** | **5** | **5** | ✅ (vừa đồng bộ) |
| **Tổng** | **104** (97 + 7 `/health`) | **104** (97 + 7) | ✅ |

Endpoint matching-service trong mã nguồn hiện tại:

| Method | Path | Quyền | Trong contract? |
|---|---|---|---|
| GET | `/health` | public | ✅ |
| GET | `/api/matching/mentors` | user (chính chủ hoặc ADMIN) | ✅ |
| POST | `/internal/embeddings/reindex` | internal token | ✅ |
| GET | `/api/matching/index-status` | user (chính chủ hoặc ADMIN) | ✅ |
| POST | `/api/matching/admin/embeddings/rebuild` | ADMIN | ✅ |

`POST /internal/embed` (cũ) đã bị gỡ khỏi cả mã nguồn lẫn contract.

## A.4 Frontend — 25 trang

| Nhóm | Trang |
|---|---|
| Công khai / tài khoản (5) | `/`, `/login`, `/register`, `/verify-email`, `/account` |
| Hồ sơ & matching (3) | `/profile`, `/matching`, `/mentors/[id]` |
| Mentoring (3) | `/mentoring/requests`, `/mentoring/sessions`, `/notifications` |
| Học tập (3) | `/learning`, `/learning/courses/[id]`, `/learning/roadmaps/[id]` |
| AI (2) | `/interview`, `/cv-enrichment` |
| Thanh toán (2) | `/payment/[sessionId]`, `/referral` |
| Dashboard (1) | `/dashboard` |
| Quản trị (6) | `/admin`, `/admin/users`, `/admin/learning`, `/admin/transactions`, `/admin/interviews`, `/admin/interviews/[id]` |

- API client tách theo miền: `src/features/{auth,profile,matching,mentoring,learning,payment,ai}/api.js`.
- Một proxy duy nhất `src/app/api/[service]/[...path]/route.ts` — trình duyệt không gọi thẳng service.
- Design system: `frontend/DESIGN.md` + `tokens.json` + Tailwind v4.
- Dependency tối giản: chỉ `next`, `react`, `react-dom`.

## A.5 Ba tính năng AI

| # | Tính năng | Service | Cách hoạt động | Phụ trách |
|---|---|---|---|---|
| 1 | **AI Matching** | matching-service | `all-MiniLM-L6-v2` → vector 384 chiều lưu ở `matching_db` → pgvector HNSW cosine top-K → lọc ràng buộc (đã duyệt, còn slot, có lịch — đọc `profile_db` read-only) → re-rank (similarity + rating + experience) → sinh lý do | Thảo |
| 2 | **AI Interview** | ai-service `app/interview/` | Hội thoại nhiều lượt xác thực mentor, tối đa `INTERVIEW_MAX_TURNS=5`, chấm điểm → `PENDING_REVIEW` → admin duyệt | Thắng |
| 3 | **CV Parsing + Chatbot enrichment** | ai-service `app/cv/`, `app/enrichment/` | pypdf trích xuất CV → hội thoại làm rõ mục tiêu (`ENRICHMENT_MAX_TURNS=4`) → đồng bộ `goal` + kỹ năng sang profile-service | Quang |

Cả (2) và (3) chạy **hai engine**: DeepSeek API khi có `DEEPSEEK_API_KEY`, ngược lại tự động rơi về **engine rule-based chạy offline** — demo và CI không cần khoá API. `/health` của ai-service báo `llmEnabled`.

## A.6 Bảo mật, nhất quán dữ liệu, tác vụ nền

| Hạng mục | Hiện trạng |
|---|---|
| Xác thực | JWT (access + refresh), `JWT_SECRET` dùng chung, mọi service tự xác minh |
| Phân quyền | RBAC `MENTEE` / `MENTOR` / `ADMIN`; kiểm tra chính chủ ở tầng controller |
| Gọi nội bộ | Header `X-Internal-Token` = `INTERNAL_API_KEY` cho mọi route `/internal/**` |
| Truy cập CSDL chéo | Duy nhất một ngoại lệ đã duyệt: matching-service đọc `profile_db` bằng role `matching_reader` **chỉ có quyền SELECT** trên 3 bảng |
| Chống brute-force | `LoginAttemptService` trên Redis (auth-service) |
| Format lỗi | Thống nhất `{"error":{"code","message"}}` trên cả Java lẫn FastAPI |
| Nhất quán dữ liệu | Không dùng transaction phân tán. Đồng bộ best-effort + job nền bù trừ |
| Tác vụ nền | `SessionScheduler` (nhắc lịch, `REMINDER_BEFORE=PT24H`) · `PaymentReconciliationJob` · `retry_profile_sync_forever` (ai-service) · **`IndexSyncJob`** (matching-service, chu kỳ `INDEX_SYNC_INTERVAL=60`s) |

## A.7 Kiểm thử & CI

| Lớp | Hiện trạng |
|---|---|
| Unit — Java | JUnit 5 + Mockito + AssertJ, 7 lớp test trên 5 service |
| Unit — Python | pytest + FastAPI TestClient — ai-service 7 file (2 file chạy trên Postgres thật), matching-service 3 file (thêm `test_index_service.py`, 9 test) |
| E2E chấp nhận | `scripts/e2e_acceptance.py` — theo Definition of Done; đã chuyển sang poll `GET /api/matching/index-status` cho phần chỉ mục |
| Hiệu năng | `scripts/benchmark_matching.py` — AI Matching ~5.000 mentor |
| Dữ liệu demo | `scripts/seed_demo.py` (`Demo@123`; admin `admin@mmp.local` / `Admin@123`) — đã có bước chờ chỉ mục sẵn sàng |
| CI | `.github/workflows/ci.yml` — 5 job Java + matching-service + ai-service (kèm Postgres 16) + build frontend |

## A.8 Kho tài liệu hiện có

| File | Nội dung | Độ tươi |
|---|---|---|
| `README.md` | Tổng quan, chạy nhanh, kiến trúc, cấu trúc repo | ✅ cập nhật theo `R-1` |
| `CONVENTIONS.md` | 10 mục quy ước nhóm | ✅ mục 1/6/7/8 + cổng `5439` |
| `docs/README.md` | Chỉ mục tài liệu + số liệu chính | 🟠 số liệu chốt 17/09 (đã gắn cảnh báo) |
| `docs/SRD-Mentor-Mentee-Platform.md` | Đặc tả yêu cầu v1.0, FR/NFR, DoD, phân công | ✅ D8, FR-2.5, FR-4.1, §5, §8, §9.1 |
| `docs/business-domain-mentor-mentee.md` | Use case, luồng nghiệp vụ, sequence, state diagram | ✅ |
| `docs/architecture.md` | Kiến trúc, bảo mật, nhất quán dữ liệu, tác vụ nền, CI/CD | ✅ §1.1, §2.2, §4, §5, §6 + ghi chú `down -v` |
| `docs/database-design.md` | ERD các CSDL | ✅ thêm §3 `matching_db`, `profile_db` sạch vector |
| `docs/api-reference.md` | Danh mục endpoint theo service | ✅ 3 endpoint matching mới |
| `docs/ai-features.md` | 3 tính năng AI: thuật toán, công thức, prompt, hạn chế, câu hỏi bảo vệ | ✅ §1.2–1.4 + sequence enrichment |
| `docs/testing-report.md` | Chiến lược, thống kê test, hiệu năng, bảo mật | ✅ + ghi chú đổi ngữ nghĩa DoD 2 |
| `docs/deployment-guide.md` | Cài đặt, cấu hình, tài khoản demo, kịch bản demo ~20 phút | ✅ `matching-db`, `INDEX_SYNC_*`, xử lý sự cố |
| `docs/ui-design.md` | Design system, ảnh màn hình | ✅ |
| `docs/user-guide.md` | Hướng dẫn theo vai trò | ✅ |
| `docs/system-analysis-status.md` | **Tài liệu này** | ✅ |
| `docs/archive/` | SRD v0.2 | ✅ lưu trữ |
| `contracts/*.yaml` | 7 file OpenAPI, 104 operation | ✅ |

---

# PHẦN B — CẦN CẬP NHẬT (sổ khoảng trống)

Mức: 🔴 **P0** chặn demo/nghiệm thu · 🟠 **P1** sai lệch phải sửa trước khi nộp · 🟡 **P2** hoàn thiện · ⚪ **P3** nợ kỹ thuật ngoài phạm vi.

## B.1 — `R-1`: chuyển quyền sở hữu embedding (mã nguồn ĐÃ XONG, phần đuôi chưa)

**Bối cảnh**: hệ thống chuyển từ *“profile-service sở hữu vector, gọi matching-service để nhúng”* sang *“matching-service sở hữu trọn chỉ mục embedding trong `matching_db` riêng, chỉ đọc `profile_db` read-only”*. Toàn bộ thay đổi **chưa commit**.

| Hạng mục | Trạng thái |
|---|---|
| `db/init/matching-service.sql` — `mentor_embeddings`, `mentee_embeddings`, HNSW, index pending | ✅ |
| `db/init/profile-service.sql` — bỏ cột embedding, thêm role `matching_reader` | ✅ |
| `matching-service` — `config.py` (2 URL), `db.py` (2 pool), `services/index_service.py`, `services/profile_text.py`, `jobs/index_sync.py`, `routers/index.py`, `main.py`, `matching_pipeline.py` | ✅ import OK |
| `profile-service` — xoá `EmbeddingService`/`EmbeddingClient`/`EmbeddingRetryJob`/`ProfileTextNormalizer`, thêm `MatchingIndexClient` (bất đồng bộ, có hàng đợi, không chặn lưu hồ sơ) | ✅ (B.2 đã đóng) |
| `docker-compose.yml` — service `matching-db` (pgvector, :5439), volume, `MATCHING_DB_URL`, `INDEX_SYNC_INTERVAL` | ✅ (B.3 đã đóng) |
| Entity + DTO profile-service — gỡ `embeddingStatus` / `embeddingUpdatedAt` | ✅ (B.4 đã đóng) |
| `matching-service/tests/` — `test_api.py` viết lại + `test_index_service.py` mới | ✅ |
| `profile-service/.../ProfileLogicTest.java` | ✅ |
| `contracts/matching-service.yaml` — gỡ `/internal/embed`, thêm 3 endpoint mới | ✅ (B.5 đã đóng) |
| `scripts/e2e_acceptance.py`, `scripts/seed_demo.py` — poll `index-status` | ✅ (B.9 đã đóng) |
| `.env.example` — thêm `INDEX_SYNC_INTERVAL` | 🟡 còn thiếu 5 biến khác — **B.10** |
| **`.github/workflows/ci.yml`** — matching-service cần 2 Postgres | 🔴 **B.7** |
| **`CONVENTIONS.md` + 6 file `docs/` + `README.md`** | 🔴 **B.8 — hạng mục lớn nhất còn lại** |
| Test `reconcile()` cho `IndexSyncJob` | 🟡 **B.6** |

### Các mục đã đóng trong phiên rà soát 21/09/2026 (giữ lại để truy xuất)

| ID | Vấn đề | Đã xử lý bằng |
|---|---|---|
| B.2 | `profile-service` không biên dịch: `ProfileService` tham chiếu 4 class đã xoá | Viết lại `ProfileService` dùng `MatchingIndexClient.reindexAsync()` |
| B.3 | `docker-compose.yml` thiếu `matching-db` → `MATCHING_DB_URL` trỏ `localhost:5439`, AI Matching không khởi động | Thêm service `matching-db` (pgvector/pgvector:pg16, :5439), volume `matching-db-data`, biến môi trường, `depends_on` |
| B.4 | `db/init/profile-service.sql` bỏ cột embedding nhưng entity JPA còn `@Column(name="embedding_updated_at")`, `ddl-auto: none` → mọi SELECT hồ sơ lỗi | Gỡ trường khỏi `MentorProfile`, `MenteeProfile`, `ProfileDtos` |
| B.5 | `contracts/matching-service.yaml` còn `/internal/embed`, thiếu 3 endpoint mới | Viết lại contract, nay khớp 5/5 với mã nguồn |
| B.9 | `e2e_acceptance.py` đọc `embeddingStatus`/`embeddingUpdatedAt` đã bị gỡ khỏi API → `KeyError`, dừng cả bộ nghiệm thu | Chuyển sang poll `GET /api/matching/index-status`; thêm kiểm tra khẳng định hai trường cũ **không** còn trong response; `seed_demo.py` thêm bước chờ chỉ mục |

## B.2 – B.5, B.9 → đã đóng (xem bảng trên)

## B.6 — Kiểm thử 🟢 đã đồng bộ, còn một khoảng trống 🟡 P2

`matching-service/tests/test_api.py` đã viết lại theo endpoint mới và có thêm `test_index_service.py`; `ProfileLogicTest.java` đã sạch tham chiếu cũ.

**Còn thiếu**: `test_index_service.py` có 9 test (hash, pgvector literal, skip khi text không đổi, force, lỗi giữ vector cũ, trạng thái PENDING…) nhưng **không test nào gọi `index_service.reconcile()`**. Đây là **cơ chế bù trừ duy nhất** khi thông báo best-effort từ profile-service bị mất — nếu nó sai thì chỉ mục lệch âm thầm, không báo lỗi. Cần ít nhất 2 test: hồ sơ đổi text → `reconcile()` nhúng lại; hồ sơ bị xoá khỏi `profile_db` → `reconcile()` dọn dòng thừa (`_prune`).

## B.7 — CI chưa phủ matching-service sau `R-1` 🟠 P1

- **Bằng chứng**: job `matching-service` trong `ci.yml` **không khai báo `services:`** nào, trong khi job `ai-service` đã có Postgres. Sau `R-1`, matching-service có logic CSDL thật (2 pool, HNSW, reconcile) và test mới `test_index_service.py`.
- **Hệ quả**: test CSDL hoặc skip âm thầm, hoặc CI đỏ.
- **Hành động**: thêm 2 service container cho job này — `pgvector/pgvector:pg16` cho `matching_db` (:5439) và `postgres:16` cho `profile_db` (:5434, nạp `db/init/profile-service.sql`) — kèm `MATCHING_DB_URL`, `PROFILE_DB_URL`. Theo đúng mẫu job `ai-service` đã có.

## B.8 — Tài liệu lệch với mã nguồn 🟠 P1

### B.8.1 — `docs/README.md`

| Dòng | Đang ghi | Thực tế |
|---|---|---|
| 14 | (đã sửa lần 1) “6 CSDL” | sau `R-1` là **7** — sửa tiếp khi `database-design.md` bổ sung `matching_db` |
| 37 | (đã sửa lần 1) “6 CSDL PostgreSQL” | **7** |
| 15, 38 | “99 endpoint (106 kể cả `/health`)” | **97 + 7 = 104** (đã xác nhận: contract 104 = mã nguồn 104) |
| 17, 40 | “106 unit test” | đếm lại sau B.6/B.7 |
| 36 | “Số liệu chính (17/09/2026)” | cập nhật ngày (đã gắn cảnh báo tạm) |

### B.8.2 — Tài liệu mô tả kiến trúc embedding cũ ✅ **đã đóng**

Số chỗ còn lại **đang giảm dần theo từng đợt sửa** — đừng chép con số, hãy đếm lại:
`grep -rn '/internal/embed\b\|embedding_text_hash\|EmbeddingRetryJob' docs/*.md README.md CONVENTIONS.md | grep -v system-analysis`
(lúc chụp tài liệu này: **10 chỗ**). Bảng dưới là danh mục đầy đủ các vị trí cần rà, kể cả những vị trí không khớp grep (sơ đồ Mermaid, mô tả kiến trúc).

| File | Vị trí | Nội dung sai |
|---|---|---|
| `docs/architecture.md` | :33, :127, :230, :260 | sơ đồ `profile_db + pgvector`; `routers/embed.py`; bảng bù trừ ghi `embedding_text_hash = NULL` + `EmbeddingRetryJob`; sơ đồ triển khai thiếu `matching-db` |
| `docs/ai-features.md` | :29, :72–73, :107, :404 | luồng `PS -- /internal/embed --> MT`; “profile-service lưu `embedding_text_hash`”; sequence diagram re-embedding |
| `docs/database-design.md` | :11, :80, :93, :113 | `profile_db` còn cột embedding; **thiếu hẳn mục `matching_db`** |
| `docs/api-reference.md` | :68 | `POST /internal/embed` |
| `docs/testing-report.md` | :81, :83, :130, :224 | mô tả test `/internal/embed`, số đo độ trễ embed |
| `docs/SRD-Mentor-Mentee-Platform.md` | :268, :360 | “Vector Database: pgvector trong DB của profile-service”; sơ đồ `/internal/embed` |
| `docs/deployment-guide.md` | — | thiếu `matching-db`, thiếu cảnh báo `down -v` khi đổi schema |
| `README.md` | mục Kiến trúc | dòng `profile-service` còn ghi “embedding” |
| `CONVENTIONS.md` | mục 8 | bảng cổng ghi “matching-service … đọc DB 5434 của profile-service”, **chưa có `matching-db :5439`** |

### B.8.3 — Tài liệu còn thiếu (chưa từng có)

| Tài liệu đề xuất | Vì sao cần |
|---|---|
| **Sổ quyết định kiến trúc (ADR)** | Ba quyết định lớn hiện chỉ nằm trong comment code: (a) matching-service đọc trực tiếp `profile_db` read-only; (b) đồng bộ best-effort + job bù trừ thay vì transaction phân tán; (c) tách quyền sở hữu embedding (`R-1`) — *tại sao* lại tách. Hội đồng gần như chắc chắn sẽ hỏi (c) |
| **Hướng dẫn migration CSDL** | `db/init/*.sql` **chỉ chạy lần đầu**; không có Flyway/Liquibase. Ai đã chạy hệ thống trước `R-1` sẽ có `profile_db` cũ còn cột embedding và **không có `matching_db`** → phải `docker compose down -v`. Chưa ghi ở đâu cả |
| **Chính sách dữ liệu CV** | CV người dùng lưu trên volume `cv-storage`; chưa mô tả thời gian lưu, quyền truy cập, cách xoá |

## B.9 → đã đóng (xem bảng mục B.1)

Ghi nhận để truy xuất: bản cũ của `e2e_acceptance.py` đọc `mp["embeddingStatus"]` và `profile_after["embeddingUpdatedAt"]` — hai trường bị gỡ khỏi `ProfileDtos` trong `R-1` — nên sẽ ném `KeyError` và làm dừng cả 66 kiểm tra. Nay script poll `GET /api/matching/index-status?userId=...` (có timeout) và **khẳng định hai trường cũ không còn trong response hồ sơ**, tức kiểm thử đã bảo vệ chính ranh giới ownership mới.

**Hệ quả cần ghi vào `docs/testing-report.md`**: tiêu chí DoD 2 đổi bản chất — từ *“embedding sinh ngay khi lưu”* (đồng bộ) sang *“chỉ mục sẵn sàng trong vòng N giây”* (**nhất quán cuối cùng**). Đây là thay đổi về **ngữ nghĩa nghiệm thu**, không chỉ là sửa code test, nên phải nói rõ trong báo cáo.

## B.10 — `.env.example` thiếu biến 🟡 P2

Hiện có 6 biến + `INDEX_SYNC_INTERVAL`. `docker-compose.yml` còn đọc **5 biến chưa được liệt kê**: `FRONTEND_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `REMINDER_BEFORE`, `INTERVIEW_MAX_TURNS`, `ENRICHMENT_MAX_TURNS`. Riêng `ADMIN_EMAIL`/`ADMIN_PASSWORD` đáng chú ý: mặc định là `admin@mmp.local` / `Admin@123` — người triển khai **không biết là có thể đổi** nếu không đọc compose. Mã nguồn matching-service còn đọc `EMBEDDING_MODEL`, `PRELOAD_MODEL`, `INDEX_SYNC_ENABLED`, `INDEX_SYNC_BATCH` (không qua compose).

Đối chiếu tự động: `grep -oE '\$\{[A-Z_]+' docker-compose.yml | sed 's/\${//' | sort -u`

## B.11 — Nợ kỹ thuật đã biết, ngoài phạm vi ⚪ P3

Ghi nhận để **chủ động trả lời khi bảo vệ**, không sửa trong đồ án:

| Mục | Hiện trạng | Rủi ro thật |
|---|---|---|
| Mật khẩu CSDL | `postgres/postgres` trong compose, `matching_reader/matching_reader` hard-code trong SQL | Chỉ chấp nhận ở môi trường dev |
| Bí mật mặc định | `JWT_SECRET`, `INTERNAL_API_KEY` có fallback dev trong code | Phải bắt buộc đặt khi triển khai thật |
| Không có API Gateway | Frontend proxy đóng vai gateway | Không có rate-limit / quan sát tập trung |
| Không có service discovery | URL service cứng qua biến môi trường | Chấp nhận được với Docker Compose |
| Không có migration tool | Chỉ `db/init/*.sql` chạy một lần | Xem B.8.3 |
| Không có logging/tracing tập trung | Log stdout từng container | Khó lần vết lỗi xuyên service |
| Redis dùng rất ít | Chỉ đếm đăng nhập sai | Nên nói rõ trong báo cáo, tránh bị hỏi “sao cần Redis” |
| Thanh toán là sandbox | Không tích hợp cổng thật | Đã nêu trong phạm vi SRD |
| Chỉ mục embedding nhất quán *cuối cùng* | Hồ sơ mới có thể chưa xuất hiện trong matching tới 60s | **Cần nêu trước trong báo cáo** — là đánh đổi có chủ đích, không phải lỗi |

---

# PHẦN C — Kế hoạch cập nhật đề xuất

Thứ tự bắt buộc: **khôi phục nghiệm thu → chốt commit → đồng bộ hợp đồng/CI → cập nhật tài liệu một lượt**. Viết tài liệu trước khi có số liệu mới sẽ phải viết lại lần hai.

### Đợt 1 — Kiểm chứng và chốt `R-1` *(mã nguồn đã xong, chỉ còn xác nhận + commit)*
1. Chạy sạch từ đầu: `docker compose down -v && docker compose up -d --build` → 8 health check xanh.
2. `python3 scripts/seed_demo.py` rồi `python3 scripts/e2e_acceptance.py` → chạy hết, **ghi lại số PASS/FAIL**.
3. Chạy unit test 7 service, **ghi lại tổng số test**.
4. **Commit `R-1` thành một commit duy nhất** — hiện ~39 file đang treo, rủi ro mất việc. Đây là việc cấp bách nhất.

### Đợt 2 — CI, test, cấu hình
5. **B.7** — thêm 2 Postgres cho job CI matching-service (theo mẫu job `ai-service`).
6. **B.6** — bổ sung test `reconcile()` / `_prune()` cho `IndexSyncJob`.
7. **B.10** — bổ sung 6 biến còn thiếu vào `.env.example`.

### Đợt 3 — Tài liệu (làm sau cùng, một lượt)
8. **B.8.2** — sửa 16 chỗ trong 6 file + `CONVENTIONS.md` mục 8 (thêm `matching-db :5439`); **thêm mục `matching_db` vào `docs/database-design.md`** (ERD + giải thích `text_hash`, `attempts`, `last_error`, HNSW).
9. **`docs/testing-report.md`** — viết lại phần matching-service và ghi rõ DoD 2 nay là *nhất quán cuối cùng* (xem B.9).
10. **`docs/deployment-guide.md`** — thêm `matching-db`, cảnh báo `docker compose down -v` khi đổi schema.
11. **B.8.1** — cập nhật số liệu `docs/README.md` từ kết quả Đợt 1–2 (lấy từ lệnh Phần E, không đếm tay).
12. **B.8.3** — viết ADR, hướng dẫn migration, chính sách dữ liệu CV.
13. Cập nhật lại chính tài liệu này; đóng các mục đã xử lý.

---

# PHẦN D — Ma trận tài liệu ↔ chương báo cáo

| Chương báo cáo | Tài liệu nguồn | Sẵn sàng? |
|---|---|---|
| Ch.1 Giới thiệu | `SRD` §1 | ✅ |
| Ch.2 Phân tích yêu cầu | `SRD` §2–4 · `business-domain-mentor-mentee.md` | ✅ |
| Ch.3 Thiết kế hệ thống | `architecture.md` · `database-design.md` · `api-reference.md` · `ui-design.md` | 🔴 chờ Đợt 3 |
| Ch.4 Hiện thực AI (phần cá nhân) | `ai-features.md` §1 (Thảo) / §2 (Thắng) / §3 (Quang) | 🔴 §1 chờ Đợt 3 |
| Ch.5 Kiểm thử & triển khai | `testing-report.md` · `deployment-guide.md` | 🔴 chờ Đợt 1 lấy số liệu, Đợt 3 viết lại |
| Phụ lục | `api-reference.md` · `user-guide.md` · `CONVENTIONS.md` · `contracts/` | 🟠 `contracts/` ✅, còn lại chờ Đợt 3 |

---

# PHẦN E — Lệnh kiểm chứng lại

Mọi số liệu trong tài liệu này sinh bằng lệnh — chạy lại để cập nhật thay vì đếm tay.

```bash
# Ảnh chụp hiện tại
git rev-parse --short HEAD && git status --short

# Số operation trong contract (gồm cả /health)
grep -hcE '^\s{4}(get|post|put|patch|delete):' contracts/*.yaml | paste -sd+ - | bc

# Số endpoint trong mã nguồn Java
for s in auth learning profile mentoring payment; do
  echo "$s-service: $(grep -rhoE '@(Get|Post|Put|Patch|Delete)Mapping' $s-service/src/main --include='*.java' | wc -l)"
done

# Route trong mã nguồn Python
grep -rhoE '@(router|app)\.(get|post|put|patch|delete)\("[^"]*"' matching-service/app ai-service/app --include='*.py' | sort

# Số trang frontend
find frontend/src/app -name 'page.tsx' | wc -l

# Bảng của từng CSDL
for f in db/init/*.sql; do echo "$f:"; grep -oE 'CREATE TABLE (IF NOT EXISTS )?[a-z_]+' $f; done

# CSDL nào đã có trong docker-compose
grep -E '^  [a-z-]+-db:' docker-compose.yml

# matching-service có import được không (kiểm chứng B.1)
(cd matching-service && .venv/bin/python -c "import sys;sys.path.insert(0,'.');import app.main;print('IMPORT OK')")

# Tham chiếu tới class đã xoá trong profile-service (kiểm chứng B.2)
grep -rn 'EmbeddingService\|EmbeddingClient\|EmbeddingRetryJob\|ProfileTextNormalizer' profile-service/src --include='*.java'

# Script nghiệm thu còn đọc trường đã gỡ không (kiểm chứng B.9)
grep -n 'embeddingStatus\|embeddingUpdatedAt' scripts/e2e_acceptance.py

# Tài liệu còn nhắc endpoint đã xoá (kiểm chứng B.8)
grep -rn '/internal/embed\b\|embedding_text_hash\|EmbeddingRetryJob' docs/ README.md CONVENTIONS.md

# Số kiểm tra e2e
grep -c 'check(' scripts/e2e_acceptance.py
```
