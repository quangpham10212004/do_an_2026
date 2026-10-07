# Sổ quyết định kiến trúc (ADR) — MentorHub

Tài liệu ghi lại **vì sao** hệ thống được thiết kế như hiện nay, theo mẫu ADR rút gọn: *Bối cảnh →
Quyết định → Hệ quả → Phương án đã cân nhắc*. Dùng cho chương **Thiết kế hệ thống** và để chuẩn bị trả
lời hội đồng. Mọi chi tiết kỹ thuật dưới đây đã đối chiếu với mã nguồn; đường dẫn file được ghi kèm để
kiểm chứng.

| Trạng thái | Ý nghĩa |
|---|---|
| **Đã chấp nhận** | Đang có hiệu lực trong mã nguồn |
| **Thay thế** | Bị một ADR sau thay thế (giữ lại để truy xuất) |

## Danh mục

| ID | Quyết định | Trạng thái | Liên quan |
|---|---|---|---|
| [ADR-01](#adr-01--matching-service-đọc-trực-tiếp-profile_db-ở-chế-độ-read-only) | matching-service đọc trực tiếp `profile_db`, chỉ đọc | Đã chấp nhận | SRD §5.3, D5, D6 · `CONVENTIONS.md` mục 7 |
| [ADR-02](#adr-02--thông-báo-best-effort--đối-soát-định-kỳ-thay-cho-transaction-phân-tán) | Thông báo best-effort + job đối soát định kỳ thay cho transaction phân tán | Đã chấp nhận | `architecture.md` §4, §5 |
| [ADR-03](#adr-03--r-1-chuyển-quyền-sở-hữu-chỉ-mục-embedding-sang-matching-service) | `R-1` — chuyển quyền sở hữu chỉ mục embedding sang matching-service | Đã chấp nhận (thay thế thiết kế embedding trong profile-service) | SRD D7, D8 (quyền sở hữu embedding) |
| [ADR-04](#adr-04--schema-quản-lý-bằng-file-sql-khởi-tạo-không-dùng-công-cụ-migration) | Schema quản lý bằng `db/init/*.sql`, không dùng công cụ migration | Đã thay thế (US-11: Flyway / migrations ai-service) | `deployment-guide.md` §8 |
| [ADR-05](#adr-05--frontend-proxy-làm-cổng-vào-không-dùng-api-gateway-riêng) | Frontend proxy làm cổng vào, không dùng API Gateway riêng | Đã chấp nhận | SRD D11 |
| [ADR-06](#adr-06--us-11-migration-cho-profile-service-flyway-và-matching-service-runner-sql) | US-11: profile-service dùng Flyway, matching-service dùng runner SQL đánh số | Đã chấp nhận (thay thế ADR-04 cho 2 service này) | `CONVENTIONS.md` mục 7 |

### Quyết định đã ghi trong SRD (không lặp lại ở đây)

SRD §2.4 đã ghi lý do cho các quyết định D1–D12; tài liệu này chỉ tham chiếu:

| ID | Nội dung ngắn | Xem |
|---|---|---|
| D1 | JWT HS256 secret dùng chung, mỗi service tự xác minh; `X-Internal-Token` giữa các service | SRD §2.4 · `architecture.md` §3.1 |
| D2, D3 | AI Interview 5 lượt, chatbot enrichment 4 lượt (`INTERVIEW_MAX_TURNS`, `ENRICHMENT_MAX_TURNS`) | SRD §2.4 · `ai-features.md` §2.4, §3.5 |
| D4 | DeepSeek (JSON Output mode) + engine rule-based mặc định & fallback | SRD §2.4 · `ai-features.md` |
| D5, D6 | Trạng thái xác thực mentor, sức chứa & rating được đồng bộ **vào** `profile_db` để matching lọc trong một chỗ | SRD §2.4 · ADR-01 |
| D7 | Tái sử dụng embedding bằng SHA-256 của văn bản chuẩn hoá (NFR-7) | SRD §2.4 · ADR-03 |
| D8 (quyền sở hữu embedding) | Chỉ mục embedding thuộc matching-service | SRD §2.4 · **ADR-03 (bản đầy đủ)** |
| D8 (đặt lịch), D9, D10 | Quy tắc đặt lịch + advisory lock; tự huỷ phiên chưa thanh toán sau 30 phút; quy tắc referral | SRD §2.4 · `business-domain-mentor-mentee.md` |
| D11 | Next.js route handler làm proxy `/api/<service>/**` | SRD §2.4 · ADR-05 |
| D12 | ai-service (Python) sở hữu trọn AI Interview và CV enrichment, CSDL riêng `ai_db` | SRD §2.4 · `ai-features.md` "Bố trí các service AI" |

> Lưu ý: SRD §2.4 có **hai dòng cùng mã D8** (quyền sở hữu embedding và quy tắc đặt lịch), được phân biệt
> bằng chú thích in nghiêng — khi trích dẫn hãy ghi kèm nội dung, ví dụ "D8 (quyền sở hữu embedding)".

---

## ADR-01 — matching-service đọc trực tiếp `profile_db` ở chế độ read-only

**Trạng thái**: Đã chấp nhận · **Phụ trách**: Thảo

### Bối cảnh
- Nguyên tắc *database-per-service*: không service nào chạm vào CSDL của service khác.
- AI Matching cần hai loại dữ liệu của profile-service ở **mỗi** lượt tìm mentor và mỗi vòng đồng bộ chỉ mục:
  1. **Văn bản nguồn** để sinh embedding: `domain`, `skills`, `years_experience`, `bio` (mentor) và
     `domain`, `skills`, `current_level`, `goal` (mentee) — `matching-service/app/services/index_service.py` (`_SPEC`).
  2. **Dữ kiện lọc & xếp hạng** của K ứng viên: `verification_status`, `is_available`, `capacity`,
     `active_mentee_count`, `rating`, `rating_count`, `years_experience`, có lịch rảnh hay không —
     `matching_pipeline.py` (`top_k_retrieval`).
- `IndexSyncJob` mỗi vòng phải so hash của **toàn bộ** hồ sơ (ADR-02), tức đọc hàng nghìn dòng mỗi phút.

### Quyết định
matching-service mở một pool kết nối thứ hai tới `profile_db` bằng role PostgreSQL **`matching_reader`**,
chỉ có `CONNECT`, `USAGE` trên schema `public` và **`SELECT`** trên đúng 3 bảng `mentor_profiles`,
`mentee_profiles`, `mentor_availability` (tạo trong `db/init/profile-service.sql`). Mọi thao tác ghi vào
các bảng này vẫn chỉ do profile-service thực hiện. Đây là **ngoại lệ duy nhất** đã được duyệt
(`CONVENTIONS.md` mục 7).

Dữ liệu mà service khác sở hữu nhưng matching cần (trạng thái xác thực, sức chứa, rating) được **đẩy
chủ động vào `profile_db`** qua `/internal/mentor/**` (D5, D6), để matching chỉ phải đọc một nguồn.

### Hệ quả
- (+) Lọc K ứng viên bằng **một truy vấn** `WHERE user_id = ANY(...)` thay vì K lời gọi HTTP; quét toàn bộ
  hồ sơ cho `IndexSyncJob` không cần API phân trang riêng.
- (+) profile-service không phải biết matching cần những cột nào, cũng không phải biết format văn bản
  dùng để embedding (xem ADR-03).
- (+) An toàn được kiểm chứng: ghi bằng role `matching_reader` bị `permission denied`
  (`testing-report.md` §4.2).
- (−) **Ghép nối ở mức schema**: đổi tên/xoá cột trong 3 bảng trên sẽ làm hỏng matching-service khi chạy
  (không có lỗi biên dịch). Giảm thiểu: cùng một người phụ trách hai service (Thảo); danh sách cột được
  gom ở `_SPEC` (`index_service.py`) và câu SELECT của `top_k_retrieval`; e2e DoD 2, 6, 7 sẽ đỏ nếu vỡ.
- (−) Mật khẩu `matching_reader` đang hard-code trong SQL và compose — chỉ chấp nhận ở môi trường dev
  (xem "Hạn chế đã biết" trong `architecture.md`).

### Phương án đã cân nhắc
| Phương án | Lý do không chọn |
|---|---|
| profile-service mở API nội bộ trả hồ sơ theo lô | Thêm endpoint, phân trang, và một lời gọi HTTP mỗi lượt tìm mentor; profile-service phải biết matching cần cột nào |
| Sao chép dữ liệu hồ sơ sang `matching_db` qua sự kiện (CDC / message broker) | Cần hạ tầng broker (Kafka/RabbitMQ) và xử lý thứ tự sự kiện — quá phạm vi đồ án |
| Gộp matching vào profile-service | Trộn Java nghiệp vụ với Python ML; không scale riêng được phần tốn CPU |

---

## ADR-02 — Thông báo best-effort + đối soát định kỳ thay cho transaction phân tán

**Trạng thái**: Đã chấp nhận · **Phạm vi**: toàn hệ thống

### Bối cảnh
Mỗi service có CSDL riêng nên một nghiệp vụ chạm nhiều service (lưu hồ sơ → cập nhật chỉ mục; thanh
toán → xác nhận phiên; hoàn tất chatbot → cập nhật goal) **không thể** nằm trong một transaction. Hệ
thống chạy bằng Docker Compose trên một máy demo, không có message broker.

### Quyết định
Áp dụng một mẫu thống nhất: **ghi cục bộ trước, báo cho service kia sau theo kiểu best-effort, và có
một job nền đối soát để hội tụ**. Bên ghi không bao giờ thất bại vì bên nhận lỗi.

| Luồng | Thông báo best-effort | Job đối soát | Chu kỳ |
|---|---|---|---|
| Hồ sơ đổi → chỉ mục embedding | `MatchingIndexClient.reindexAsync` (profile-service): gọi `POST /internal/embeddings/reindex` trên thread riêng, hàng đợi tối đa 500, đầy thì bỏ (`DiscardPolicy`), lỗi chỉ ghi log | `IndexSyncJob` (`matching-service/app/jobs/index_sync.py`) → `index_service.reconcile()`: so SHA-256 văn bản của mọi hồ sơ với `text_hash`, embed lại tối đa `INDEX_SYNC_BATCH` (200) hồ sơ lệch mỗi vai trò mỗi vòng, xoá dòng chỉ mục mồ côi | `INDEX_SYNC_INTERVAL` = 60 s |
| Thanh toán thành công → xác nhận phiên | payment-service gọi mentoring-service; lỗi thì để `transactions.session_synced = false` | `PaymentReconciliationJob` | 1 phút |
| Chatbot xong → cập nhật goal | ai-service gọi `POST /api/profile/mentee/{id}/enrichment-chat`; lỗi thì `profile_synced = false` | `retry_profile_sync_forever` (ai-service) | 2 phút (`PROFILE_SYNC_RETRY_SECONDS`) |

Riêng chỉ mục embedding có thêm một đường tắt: nếu mentee tìm mentor khi vector của **chính mentee**
chưa có, `/api/matching/mentors` gọi `index_service.reindex()` ngay trong request
(`matching_pipeline.py`).

### Hệ quả
- (+) Lưu hồ sơ, thanh toán, hoàn tất chatbot không bao giờ bị chặn bởi service phụ thuộc đang down
  (cô lập lỗi).
- (+) Job đối soát của chỉ mục **mạnh hơn retry**: nó so với nguồn sự thật nên bắt được cả thay đổi chưa
  từng được báo (ví dụ sửa trực tiếp trong CSDL khi seed), không chỉ lần gọi bị lỗi.
- (−) **Nhất quán cuối cùng**: hồ sơ mới/sửa có thể chưa phản ánh trong kết quả matching. Thông thường
  chỉ mục cập nhật trong vài giây nhờ thông báo; nếu thông báo mất thì chậm nhất khoảng một chu kỳ
  `INDEX_SYNC_INTERVAL` (60 s) cộng thời gian embed. Ngay sau khi matching-service khởi động, vòng quét
  đầu tiên chờ `min(INDEX_SYNC_INTERVAL, 30)` giây. Khi có hơn 200 hồ sơ lệch cùng lúc (ví dụ đổi model),
  cần nhiều vòng — dùng `POST /api/matching/admin/embeddings/rebuild?force=true` để làm ngay.
- (−) Tiêu chí nghiệm thu DoD 2 đổi ngữ nghĩa thành "chỉ mục sẵn sàng trong N giây" (xem
  `testing-report.md` §3).
- (−) Mỗi vòng `reconcile()` đọc toàn bộ hồ sơ và tính hash — O(N) mỗi phút; ổn với vài nghìn hồ sơ,
  cần quét theo `updated_at` nếu dữ liệu lớn hơn nhiều.
- (−) Chưa có cơ chế cảnh báo khi một dòng chỉ mục lỗi lặp lại: `attempts`, `last_error` được ghi trong
  `matching_db` nhưng chưa có giới hạn số lần thử hay dashboard.

### Phương án đã cân nhắc
| Phương án | Lý do không chọn |
|---|---|
| Two-phase commit / XA giữa các CSDL | Ghép chặt các service, giữ khoá lâu, không phù hợp giao tiếp REST |
| Saga có orchestrator | Đáng giá khi có nhiều bước cần bù trừ; ở đây mỗi luồng chỉ có 1 bước phụ và đều *idempotent* |
| Transactional outbox + message broker | Đảm bảo giao hàng tốt hơn nhưng thêm Kafka/RabbitMQ và consumer — quá phạm vi; job đối soát cho kết quả hội tụ tương đương ở quy mô đồ án |
| Gọi đồng bộ và báo lỗi cho người dùng nếu bên kia lỗi | Một service phụ (matching) down sẽ làm hỏng nghiệp vụ chính (lưu hồ sơ) — đúng là điều ADR-03 muốn loại bỏ |

---

## ADR-03 — `R-1`: chuyển quyền sở hữu chỉ mục embedding sang matching-service

**Trạng thái**: Đã chấp nhận — thay thế thiết kế "profile-service sở hữu vector" · **Phụ trách**: Thảo

### Bối cảnh — thiết kế cũ
Trước `R-1`, embedding nằm rải ở hai service:

| Thành phần | Vị trí cũ |
|---|---|
| Chuẩn hoá hồ sơ thành văn bản | `ProfileTextNormalizer.java` (profile-service) |
| Gọi model | profile-service gọi đồng bộ `POST /internal/embed` (văn bản → vector 384 chiều) của matching-service qua `EmbeddingClient` |
| Lưu vector + hash | Cột `embedding VECTOR(384)`, `embedding_text_hash`, `embedding_updated_at` trong `mentor_profiles`/`mentee_profiles` — `profile_db` phải dùng image `pgvector` |
| Thử lại khi lỗi | `EmbeddingRetryJob` (profile-service), tìm dòng `embedding_text_hash IS NULL` |
| Lộ ra API | Phản hồi hồ sơ có `embeddingStatus`, `embeddingUpdatedAt`; endpoint admin rebuild nằm ở profile-service |

Vấn đề:
1. **Tri thức thuật toán bị chia đôi**: format văn bản, hash và model là một phần của thuật toán
   matching, nhưng nằm một nửa ở Java, một nửa ở Python. Đổi format hoặc đổi model phải sửa và triển
   khai cả hai service — trái với nguyên tắc "toàn bộ 3 tính năng AI nằm ở Python" (`CONVENTIONS.md` mục 1).
2. **Lưu hồ sơ phụ thuộc matching-service**: lời gọi `/internal/embed` nằm trên đường xử lý request
   lưu hồ sơ; matching-service chậm hay đang load model thì người dùng phải chờ.
3. **profile_db mang dữ liệu không phải của nó** (vector), buộc cả CSDL hồ sơ dùng image pgvector.
4. **Retry chỉ bắt được lỗi đã biết**: `EmbeddingRetryJob` chỉ xử lý dòng từng bị đánh dấu lỗi, không
   phát hiện hồ sơ bị sửa ngoài luồng API.

### Quyết định
matching-service sở hữu **trọn vòng đời** chỉ mục embedding:
- CSDL riêng **`matching_db`** (image `pgvector/pgvector:pg16`, cổng host **5439**) với
  `mentor_embeddings`, `mentee_embeddings`: `embedding VECTOR(384)`, `text_hash`, `indexed_at`,
  `attempts`, `last_error`; HNSW `vector_cosine_ops` trên vector mentor (`db/init/matching-service.sql`).
- Chuẩn hoá văn bản + SHA-256: `app/services/profile_text.py`; vòng đời chỉ mục (reindex / status /
  reconcile / rebuild): `app/services/index_service.py`; đồng bộ định kỳ: `app/jobs/index_sync.py`.
- Ba endpoint mới: `POST /internal/embeddings/reindex` (nội bộ), `GET /api/matching/index-status`
  (chính chủ hoặc ADMIN), `POST /api/matching/admin/embeddings/rebuild` (ADMIN). `POST /internal/embed`
  bị gỡ.
- profile-service **không biết gì về embedding**: chỉ gửi `{userId, role}` qua
  `MatchingIndexClient.reindexAsync` sau khi lưu hồ sơ, bắn rồi quên (ADR-02). `profile_db` quay về
  `postgres:16`, không còn cột vector; DTO hồ sơ bỏ `embeddingStatus`/`embeddingUpdatedAt`.
- Văn bản nguồn được matching-service tự đọc từ `profile_db` qua role read-only (ADR-01).

### Hệ quả
- (+) Đổi model / format văn bản chỉ đụng tới matching-service: đặt `EMBEDDING_MODEL`, khởi động lại,
  gọi `rebuild?force=true` (hoặc để `IndexSyncJob` tự phát hiện hash lệch).
- (+) Lưu hồ sơ không còn chờ model; matching-service down không ảnh hưởng profile-service.
- (+) Ranh giới sở hữu kiểm chứng được: e2e khẳng định phản hồi hồ sơ **không** còn trường embedding.
- (+) Top-K vẫn dùng HNSW và không truyền vector qua mạng: truy vấn pgvector chạy trong `matching_db`
  lấy ra K `user_id`, rồi lấy K dòng hồ sơ từ `profile_db` (`matching_pipeline.top_k_retrieval`).
- (−) Thêm một CSDL (tổng **7 CSDL** PostgreSQL) và một container.
- (−) Chỉ mục trở thành **nhất quán cuối cùng** (ADR-02); DoD 2 đổi ngữ nghĩa.
- (−) Không có khoá ngoại giữa `matching_db` và `profile_db` → `IndexSyncJob` phải dọn dòng mồ côi
  (`_prune`).
- (−) **Nâng cấp phá vỡ**: máy đã chạy bản trước `R-1` phải `docker compose down -v` (mất dữ liệu) vì
  `db/init/*.sql` chỉ chạy lần đầu (ADR-04, `deployment-guide.md` §8).
- (−) Bộ test dịch chuyển: logic embedding rời `ProfileLogicTest` sang `matching-service/tests/test_index_service.py`.

### Phương án đã cân nhắc
| Phương án | Lý do không chọn |
|---|---|
| Giữ nguyên thiết kế cũ, chỉ chuyển `ProfileTextNormalizer` sang Python | Vẫn để vector trong `profile_db` và vẫn chặn lưu hồ sơ bằng lời gọi đồng bộ |
| Vector ở `matching_db` nhưng profile-service gửi kèm văn bản đã chuẩn hoá | profile-service vẫn phải biết format văn bản — chính là phần muốn tách ra |
| Dùng vector DB chuyên dụng (Qdrant, Milvus…) | Thêm hạ tầng mới; pgvector + HNSW đã đạt NFR-1 (p95 vài ms với ~5.000 mentor) |

---

## ADR-04 — Schema quản lý bằng file SQL khởi tạo, không dùng công cụ migration

**Trạng thái**: **Đã thay thế (US-11)** — auth-service, learning-service dùng Flyway; ai-service dùng runner
`ai-service/app/migrations.py` (file `migrations/NNN_*.sql`, bảng `schema_migrations`); `db/init` giữ làm
baseline. Quy trình cho mọi service: `deployment-guide.md` §8.1. Phần dưới giữ lại để tham khảo lịch sử.

### Bối cảnh
Mỗi CSDL được khởi tạo bằng `db/init/<service>.sql` mount vào `/docker-entrypoint-initdb.d/` của image
PostgreSQL. Hibernate đặt `ddl-auto: none`; service Python dùng asyncpg với SQL thuần.

### Quyết định
File SQL là **nguồn sự thật duy nhất** của schema. Không dùng Flyway/Liquibase/Alembic.

### Hệ quả
- (+) Một chỗ duy nhất để đọc schema; không có bước migration lúc khởi động.
- (−) Script trong `docker-entrypoint-initdb.d` **chỉ chạy khi thư mục dữ liệu rỗng** (volume mới). Sửa SQL
  không có tác dụng với volume đã tồn tại → phải `docker compose down -v` (mất dữ liệu). Quy trình chi
  tiết: `deployment-guide.md` §8.
- (−) Không có lịch sử phiên bản schema; không nâng cấp được dữ liệu thật tại chỗ. Khi triển khai thật
  cần chuyển sang Flyway (Java) / Alembic hoặc yoyo (Python).

### Phương án đã cân nhắc
Flyway cho 5 service Java + Alembic cho 2 service Python: đúng cách cho sản phẩm thật, nhưng thêm hai
công cụ và lịch sử migration cho dữ liệu demo luôn được tạo lại bằng `scripts/seed_demo.py`.

---

## ADR-05 — Frontend proxy làm cổng vào, không dùng API Gateway riêng

**Trạng thái**: Đã chấp nhận · Chi tiết lý do ở SRD D11

### Bối cảnh
Trình duyệt cần gọi 7 service; `/internal/**` tuyệt đối không được lộ ra ngoài.

### Quyết định
Một route handler Next.js duy nhất (`frontend/src/app/api/[service]/[...path]/route`) chuyển tiếp
`/api/<service>/**` tới service tương ứng. Trình duyệt chỉ thấy một origin.

### Hệ quả
- (+) Không cần CORS; không đường nào từ trình duyệt tới `/internal/**`.
- (−) Không có rate-limit, xác thực tập trung, logging/tracing tập trung ở biên — mỗi service tự xác minh
  JWT (D1). Ghi trong "Hạn chế đã biết" (`architecture.md`).

### Phương án đã cân nhắc
Spring Cloud Gateway / Kong / Nginx: phù hợp khi triển khai thật; với đồ án, proxy trong Next.js đủ dùng
và bớt một container.

---

## ADR-06 — US-11: migration cho profile-service (Flyway) và matching-service (runner SQL)

**Trạng thái**: Đã chấp nhận · thay thế ADR-04 **chỉ cho** profile-service và matching-service · **Phụ trách**: Thảo

### Bối cảnh
Các story P0 (lịch ngoại lệ, trạng thái mentor, cài đặt đặt lịch, sở thích mentee) đổi schema
`profile_db` trên dữ liệu đã có. Với ADR-04 mỗi lần đổi phải `docker compose down -v` (mất dữ liệu).

### Quyết định
- **profile-service**: Flyway (`src/main/resources/db/migration`). `V1__baseline.sql` = bản sao
  `db/init/profile-service.sql`; `spring.flyway.baseline-on-migrate=true`, `baseline-version=1` nên
  CSDL đã tạo bằng db/init được baseline ở V1 rồi chạy V2+; CSDL rỗng chạy từ V1.
- **matching-service**: file `migrations/NNN_ten.sql` được `app/migrations.py` áp dụng lúc khởi động,
  mỗi file một transaction, ghi `schema_migrations(version, name, checksum)`; khoá `pg_advisory_lock`
  khi nhiều instance cùng khởi động; file đã áp dụng mà bị sửa (checksum lệch) => từ chối khởi động.
- `db/init/*.sql` giữ nguyên (vẫn tạo CSDL lần đầu cho docker compose); schema mới nhất là
  db/init + các migration.

### Hệ quả
- (+) Nâng cấp tại chỗ, không mất dữ liệu; có lịch sử phiên bản schema.
- (+) Test CSDL của matching-service dựng `profile_db` từ chính các file Flyway (`tests/schema.py`).
- (−) Cột/bảng mới mà matching-service đọc phải được `GRANT SELECT` cho `matching_reader` trong
  migration (cột mới trong 3 bảng đã grant tự có quyền vì grant ở mức bảng).

