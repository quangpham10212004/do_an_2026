# Chính sách dữ liệu CV — MentorHub

CV là dữ liệu cá nhân nhạy cảm nhất hệ thống lưu giữ (họ tên, liên hệ, lịch sử làm việc, học vấn). Tài
liệu này mô tả **chính xác những gì mã nguồn đang làm** với file CV và ghi rõ những gì **chưa được hiện
thực**, để báo cáo trung thực trước hội đồng. Phụ trách: Quang (`ai-service/app/cv`, `app/enrichment`);
`app/storage.py` là phần dùng chung cần cả Quang và Thắng review (`CONVENTIONS.md` mục 1).

> Nguồn đối chiếu (cập nhật Sprint 2: US-19 đồng ý, US-20 duyệt thông tin, US-21 xác nhận mục tiêu):
> `ai-service/migrations/002–004`, `app/storage.py`, `app/cv/extractor.py`, `app/cv/repository.py`,
> `app/routers/cv.py`, `app/enrichment/service.py`, `app/clients/mentoring.py`, `app/clients/profile.py`,
> `app/config.py`, `db/init/ai-service.sql`, `docker-compose.yml`; mentoring-service
> `InternalRelationshipController`; profile-service `InternalProfileController.clearCvFile`.

## 1. Tóm tắt

| Câu hỏi | Trả lời ngắn | Trạng thái |
|---|---|---|
| Lưu ở đâu? | File PDF gốc trên volume Docker `cv-storage`; văn bản trích xuất + kết quả parse trong bảng `cv_documents` của `ai_db` | ✅ |
| Giới hạn đầu vào? | PDF, ≤ 5MB, ≤ 10 trang, không đặt mật khẩu, có lớp văn bản ≥ 50 ký tự | ✅ |
| Ai đọc được file? | Chủ CV, ADMIN, service nội bộ, và **mentor đang có yêu cầu mentoring (PENDING/ACCEPTED) với chủ CV** | ✅ kiểm tra qua mentoring-service, lỗi thì từ chối (fail-closed) |
| Có gửi ra ngoài không? | Chỉ khi **cả hai**: server cấu hình `DEEPSEEK_API_KEY` **và** người dùng đánh dấu đồng ý cho CV đó (`consentExternalAi = true`, US-19). Không đồng ý ⇒ chỉ engine rule-based, không request nào tới DeepSeek | ✅ hỏi ý kiến trước khi tải (mục 5) |
| Lưu bao lâu? | **Vô thời hạn** — không có chính sách hết hạn | ❌ chưa hiện thực |
| Người dùng tự xoá được không? | **Có** — `DELETE /api/ai/cv/{cvId}` (chủ CV hoặc ADMIN); xem danh sách CV của mình qua `GET /api/ai/cv/mine` | ✅ API + mục "CV của tôi" trên trang `/profile` |
| Mã hoá khi lưu? | Không — file và văn bản lưu dạng rõ | ❌ chưa hiện thực |

## 2. Dữ liệu được lưu

### 2.1 File gốc
- Thư mục gốc: biến `CV_STORAGE_DIR` — trong `docker-compose.yml` là `/data/cv` của container
  `ai-service`, mount volume có tên **`cv-storage`** (mặc định khi chạy ngoài Docker: `./data/cv`).
- Đường dẫn file: `<user_id>/<uuid ngẫu nhiên>.pdf` (`storage.save`). Tên file gốc **không** dùng làm tên
  trên đĩa, nên không thể ghi đè hay chèn đường dẫn.
- Khi đọc, đường dẫn được `resolve()` và kiểm tra nằm trong thư mục gốc (`is_relative_to`), chống path
  traversal → 403 `FORBIDDEN`.
- Mỗi lần upload tạo **file mới và dòng mới**; bản cũ không tự bị thay thế hay xoá — người dùng xoá từng
  bản qua `DELETE /api/ai/cv/{cvId}` (mục 6).

### 2.2 Bảng `cv_documents` (`ai_db`)

| Cột | Nội dung | Ghi chú |
|---|---|---|
| `user_id` | Chủ CV | |
| `file_name` | Tên file người dùng đặt lúc upload | Trả lại trong header `Content-Disposition` khi tải |
| `storage_path` | Đường dẫn tương đối trên volume | |
| `raw_text` | **Toàn bộ văn bản** trích xuất bằng pypdf | Bản sao thứ hai của nội dung CV, nằm trong CSDL |
| `parsed_json` | Kết quả parse: vai trò, kỹ năng, số năm kinh nghiệm, dự án, học vấn, tóm tắt | Kết quả máy, giữ nguyên để đối chiếu; **không** được gửi sang hồ sơ |
| `confirmed_fields` | Thông tin người dùng đã xem lại/sửa/bỏ (US-20): `role`, `skills[]`, `yearsExperience`, `projects[]`, `education[]` | `NULL` = chưa duyệt; CV tải trước Sprint 2 = `NULL` (migration `003`) |
| `confirmed_at` | Lần duyệt gần nhất | |
| `engine` | `DEEPSEEK` hoặc `RULE_BASED` | |
| `consent_external_ai` | Người dùng có đồng ý gửi CV này tới AI bên ngoài (US-19) | Bắt buộc khai báo lúc tải; CV tải trước Sprint 2 = `false` (migration `002`) |
| `created_at` | Thời điểm upload | |

Liên quan: `enrichment_conversations.cv_id` tham chiếu `cv_documents(id)` (**không** `ON DELETE CASCADE`;
tối đa một hội thoại mỗi CV); hội thoại lưu goal nháp (`enriched_goal`), quyết định của người dùng
(`goal_status`: `NONE`/`DRAFT`/`CONFIRMED`/`DISCARDED`) và goal đã xác nhận (`confirmed_goal`) — migration
`004`;
`enrichment_messages` chứa câu trả lời chatbot của mentee (xoá theo hội thoại nhờ `ON DELETE CASCADE`).

### 2.3 Dữ liệu suy ra lan sang service khác
**Tải và parse CV không ghi gì vào hồ sơ** (US-20). Sau khi parse, người dùng xem lại từng trường, sửa hoặc
bỏ (`PUT /api/ai/cv/{id}/confirmed-fields`, chỉ chủ CV); chatbot chỉ bắt đầu sau bước này
(`POST /api/ai/cv/{id}/enrichment-conversation`) và chỉ dùng các trường đã duyệt làm ngữ cảnh.

Khi hội thoại xong, goal chỉ là **bản nháp** (`goal_status = DRAFT`, US-21) — hồ sơ chưa đổi. Người dùng
chọn "Dùng mục tiêu này" (có thể "Sửa" trước; `POST .../confirm-goal`) hoặc "Bỏ qua" (`POST
.../discard-goal`, không gửi gì). **Chỉ khi xác nhận**, ai-service gửi sang profile-service (`POST
/api/profile/mentee/{id}/enrichment-chat`) đúng một lần: goal người dùng đã chọn, **chỉ những kỹ năng người
dùng đã giữ lại** ở bước duyệt (CV chưa duyệt ⇒ danh sách rỗng) và `cvFileUrl = /api/ai/cv/{cvId}/file`.
profile-service tạm lỗi ⇒ job nền thử lại; job chỉ gửi goal `CONFIRMED`, không bao giờ gửi bản nháp. Các giá trị này nằm trong `mentee_profiles` (`profile_db`) và gián tiếp đi vào
văn bản embedding ở `matching_db` (chỉ kỹ năng + goal, không phải toàn văn CV).

## 3. Kiểm tra đầu vào

Thực hiện trong `ai-service/app/cv/extractor.py` và `app/enrichment/service.py`. **Parse trước, lưu sau**:
file bị từ chối thì không có gì được ghi xuống đĩa hay CSDL.

| Kiểm tra | Mã lỗi | HTTP |
|---|---|---|
| File rỗng | `FILE_REQUIRED` | 400 |
| Không bắt đầu bằng chữ ký `%PDF-` | `INVALID_FILE_TYPE` | 400 |
| Lớn hơn 5MB (`MAX_CV_BYTES = 5 * 1024 * 1024`; router chỉ đọc tối đa 5MB + 1 byte) | `FILE_TOO_LARGE` | 413 |
| PDF đặt mật khẩu | `ENCRYPTED_PDF` | 400 |
| Hơn 10 trang (`MAX_PAGES = 10`) | `CV_TOO_LONG` | 400 |
| pypdf không đọc được | `INVALID_PDF` | 400 |
| Văn bản trích xuất < 50 ký tự (thường là PDF ảnh scan) | `CV_NO_TEXT` | 400 |
| Ghi file thất bại | `STORAGE_ERROR` | 500 |

## 4. Ai được làm gì

| Thao tác | Endpoint | Được phép | Ghi chú |
|---|---|---|---|
| Mentee upload CV | `POST /api/ai/mentee/{menteeId}/cv-upload` (multipart `file` + `consentExternalAi`) | Chính mentee đó, ADMIN, nội bộ | Mentee phải có hồ sơ trước (`PROFILE_REQUIRED`); thiếu `consentExternalAi` ⇒ 400 `CONSENT_REQUIRED`, không lưu gì |
| Parse CV (mentor điền nhanh hồ sơ) | `POST /api/ai/cv/parse` (multipart `file` + `consentExternalAi`) | Mọi người dùng đã đăng nhập | File được lưu dưới `user_id` của người gọi; chỉ trả kết quả, **không ghi hồ sơ** (mentor tự kiểm tra rồi bấm Lưu) |
| Duyệt thông tin trích xuất | `PUT /api/ai/cv/{cvId}/confirmed-fields` | **Chỉ chủ CV** (ADMIN, mentor ⇒ 403) | Không ghi gì vào hồ sơ |
| Bắt đầu chatbot | `POST /api/ai/cv/{cvId}/enrichment-conversation` | Chủ CV (MENTEE) | 409 `CV_NOT_REVIEWED` nếu chưa duyệt; mỗi CV một hội thoại |
| Tải file CV | `GET /api/ai/cv/{cvId}/file` | Chủ CV, ADMIN, nội bộ, mentor **có quan hệ mentoring** với chủ CV | Xem lưu ý dưới |
| Liệt kê CV của mình | `GET /api/ai/cv/mine` | Mọi người dùng đã đăng nhập — **chỉ trả CV của chính người gọi** (mới nhất trước: `id`, `fileName`, `uploadedAt`, `fileUrl`) | Lời gọi nội bộ (không có user) nhận danh sách rỗng |
| Xoá CV | `DELETE /api/ai/cv/{cvId}` | **Chủ CV hoặc ADMIN** (204) | Người khác 403 `FORBIDDEN`; không tồn tại 404 `CV_NOT_FOUND`. Mentor có quan hệ cũng **không** xoá được; lời gọi nội bộ không được xoá. Xem mục 6.2 |
| Xem `cvFileUrl` trong hồ sơ mentee | `GET /api/profile/mentee/{userId}` | Chính mentee, mọi MENTOR, ADMIN | Mentee khác bị 403. Có đường dẫn **không** có nghĩa là tải được file — tải vẫn qua kiểm tra quan hệ ở trên |

**Lưu ý về quyền của mentor** (`enrichment/service.py`, hàm `cv_file`): mentor chỉ tải được CV khi
mentoring-service xác nhận tồn tại yêu cầu mentoring **PENDING** hoặc **ACCEPTED** giữa mentor và chủ CV
(`GET /internal/relationships?mentorId=&menteeId=`, header `X-Internal-Token`, timeout
`RELATIONSHIP_CHECK_TIMEOUT_SECONDS` = 3 giây). mentoring-service trả `{mentorId, menteeId, related}`, với
`related = true` khi tồn tại yêu cầu mentoring của mentee gửi mentor đó ở trạng thái `PENDING` hoặc
`ACCEPTED`. ai-service chỉ cho tải khi `related` đúng bằng `true`; mọi trường hợp khác — mentoring-service
không phản hồi, quá 3 giây, lỗi HTTP, JSON không hợp lệ — đều **từ chối (403)**, nguyên tắc *fail-closed*.
Hệ quả: khi yêu cầu bị từ chối, huỷ hoặc kết thúc (không còn PENDING/ACCEPTED), mentor **mất quyền** tải
CV đó. Trước bản sửa này, mọi tài khoản MENTOR tải được mọi CV nếu biết `cvId`.

## 5. Xử lý bởi bên thứ ba (DeepSeek) và đồng ý của người dùng (US-19)

**Hỏi ý kiến trước khi tải** (`frontend/src/features/ai/CvConsent.tsx`, trên `/cv-enrichment` và ô "Điền
nhanh từ CV" của mentor ở `/profile`): trước ô chọn file, giao diện giải thích CV đi đâu — (1) lưu trên nền
tảng, xoá được ở "CV của tôi"; (2) gửi tới DeepSeek khi engine AI bật, **chỉ khi người dùng đánh dấu đồng
ý**; (3) ai xem được file (mentee: mentor mà mình gửi yêu cầu PENDING/ACCEPTED và ADMIN; mentor: chỉ chính
mình và ADMIN). Ô đồng ý mặc định **không** đánh dấu.

API bắt buộc trường `consentExternalAi` (thiếu ⇒ 400 `CONSENT_REQUIRED`); giá trị lưu ở
`cv_documents.consent_external_ai` và áp cho **CV đó**:

- `false`: parse CV và **mọi lượt** chatbot enrichment của CV đó chạy engine rule-based. Việc chọn engine
  (`app/cv/engine.py::engine_for`) trả `RULE_BASED` mà không hỏi tới client DeepSeek, và được kiểm tra lại
  ở mỗi lượt từ cột của CV — kể cả khi hội thoại cũ ghi `engine = DEEPSEEK`. Kiểm chứng:
  `tests/test_cv_consent.py` cài client DeepSeek đã bật với transport làm test FAIL nếu có request.
- `true`: dùng DeepSeek nếu server có `DEEPSEEK_API_KEY` (lỗi ⇒ tự fallback rule-based).

Phạm vi gửi đi khi đã đồng ý và có `DEEPSEEK_API_KEY`:
- Không có `DEEPSEEK_API_KEY` (mặc định, cũng là cấu hình demo và CI): CV được parse **hoàn toàn cục bộ**
  bằng engine rule-based; không dữ liệu nào rời máy chủ, bất kể lựa chọn của người dùng.
- Có `DEEPSEEK_API_KEY` và đã đồng ý: **toàn bộ văn bản trích xuất** được gửi tới `{DEEPSEEK_BASE_URL}/chat/completions`
  (bọc trong thẻ `<cv>`, system prompt yêu cầu coi là dữ liệu — `app/cv/deepseek_parser.py`). Câu trả lời
  chatbot enrichment cũng được gửi kèm ngữ cảnh CV đã parse. Dữ liệu khi đó chịu chính sách lưu trữ của
  DeepSeek.
- Log của ai-service không ghi nội dung CV; khi DeepSeek trả lỗi, log ghi tối đa 300 ký tự phản hồi
  **của API** (không phải của CV).
- CV tải lên trước Sprint 2 được migration `002_cv_consent_external_ai.sql` đặt `consent_external_ai =
  false` (chưa từng được hỏi ý kiến); hội thoại đang dở của chúng chuyển sang `RULE_BASED`. Dữ liệu đã gửi
  DeepSeek trước đó (nếu server từng bật) không thu hồi được.
- Đổi ý: không có API sửa đồng ý của một CV — người dùng xoá CV và tải lại với lựa chọn mới.

## 6. Thời hạn lưu trữ và xoá dữ liệu

**Thời hạn lưu**: chưa có chính sách hết hạn hay job dọn dẹp — CV tồn tại tới khi chủ CV/ADMIN xoá hoặc
volume bị xoá. Khoá tài khoản ở auth-service **không** xoá CV.

### 6.1 Người dùng tự xoá (luồng chuẩn)

Giao diện: mục **"CV của tôi"** trên trang *Hồ sơ* (`/profile`, cả mentor và mentee) liệt kê CV qua `GET /api/ai/cv/mine` và gọi `DELETE /api/ai/cv/{cvId}` khi bấm xoá. Có thể gọi API trực
tiếp:

```bash
curl -H "Authorization: Bearer $TOKEN" localhost:8091/api/ai/cv/mine          # lấy id
curl -X DELETE -H "Authorization: Bearer $TOKEN" localhost:8091/api/ai/cv/<CV_ID> -i   # 204
```

### 6.2 Điều gì xảy ra khi xoá (`enrichment/service.py`, hàm `delete_cv`)

```mermaid
sequenceDiagram
    autonumber
    participant U as Chủ CV / ADMIN
    participant AI as ai-service
    participant DB as ai_db
    participant V as volume cv-storage
    participant P as profile-service
    U->>AI: DELETE /api/ai/cv/{cvId}
    AI->>DB: tìm cv_documents (404 CV_NOT_FOUND nếu không có)
    AI->>AI: kiểm tra chủ CV hoặc ADMIN (403 FORBIDDEN nếu không)
    rect rgba(127,127,127,0.12)
    Note over AI,DB: 1 transaction
    AI->>DB: DELETE enrichment_conversations WHERE cv_id (messages xoá theo CASCADE)
    AI->>DB: DELETE cv_documents WHERE id
    end
    AI->>V: xoá file PDF (file đã mất ⇒ chỉ ghi log)
    AI-->>P: DELETE /internal/profile/{userId}/cv-file?cvFileUrl=/api/ai/cv/{cvId}/file (best-effort)
    P->>P: gỡ cv_file_url chỉ khi khớp CHÍNH XÁC (mentor và/hoặc mentee); luôn 204
    AI-->>U: 204 No Content
```

| Bước | Dữ liệu | Khi lỗi |
|---|---|---|
| 1. Transaction CSDL | Hội thoại enrichment gắn với CV (kèm toàn bộ câu hỏi/trả lời) → dòng `cv_documents` (gồm `raw_text`, `parsed_json`). Đúng thứ tự FK | Rollback, trả lỗi — chưa có gì bị xoá |
| 2. File trên volume | `/data/cv/<user_id>/<uuid>.pdf` | File không còn → chỉ ghi log, vẫn 204; lỗi đĩa khác → ghi log (file mồ côi), vẫn 204 |
| 3. Tham chiếu ở hồ sơ | `cv_file_url` của `mentor_profiles` / `mentee_profiles` nếu **bằng đúng** URL của CV vừa xoá. Hồ sơ đang trỏ tới CV khác thì giữ nguyên | profile-service lỗi → ai-service ghi log, vẫn 204; hồ sơ còn đường dẫn tới CV không tồn tại (tải sẽ 404) — sửa bằng lệnh ở 6.4 bước 3 |

Mạng/đĩa được gọi **sau** khi transaction đã commit (đúng quy ước `CONVENTIONS.md` mục 6). Việc gỡ
`cv_file_url` **không** kích hoạt lập lại chỉ mục embedding vì `cv_file_url` không nằm trong văn bản
chuẩn hoá.

**Không bị xoá** (cần người dùng tự sửa trên trang Hồ sơ nếu muốn): goal người dùng đã xác nhận và kỹ năng
đã duyệt được gộp vào hồ sơ mentee, và do đó vector trong `matching_db` (chỉ chứa kỹ năng + goal, không chứa toàn văn CV).
Dữ liệu đã gửi DeepSeek (nếu bật) nằm ngoài tầm kiểm soát của hệ thống.

### 6.3 Xoá toàn bộ (môi trường demo)
```bash
docker compose down -v      # xoá MỌI volume: cả 7 CSDL và cv-storage
```

### 6.4 Dọn thủ công (quản trị viên — chỉ khi API không dùng được hoặc cần xoá mọi CV của một người)
ADMIN có thể gọi `DELETE /api/ai/cv/{cvId}` cho từng CV. Lệnh SQL dưới đây chỉ dùng khi cần xử lý hàng
loạt. Thay `<USER_ID>` bằng UUID người dùng; xoá theo thứ tự vì `enrichment_conversations.cv_id` không có
`ON DELETE CASCADE`.

```bash
# 1) Dữ liệu trong ai_db (enrichment_messages tự xoá theo hội thoại)
docker compose exec ai-db psql -U postgres -d ai_db -c "
  BEGIN;
  DELETE FROM enrichment_conversations WHERE cv_id IN (SELECT id FROM cv_documents WHERE user_id = '<USER_ID>');
  DELETE FROM cv_documents WHERE user_id = '<USER_ID>';
  COMMIT;"

# 2) File gốc trên volume cv-storage
docker compose exec ai-service rm -rf /data/cv/<USER_ID>

# 3) Đường dẫn CV còn lưu trong hồ sơ
docker compose exec profile-db psql -U postgres -d profile_db -c "
  UPDATE mentee_profiles SET cv_file_url = NULL WHERE user_id = '<USER_ID>';
  UPDATE mentor_profiles SET cv_file_url = NULL WHERE user_id = '<USER_ID>';"
```

Kiểm tra: `docker compose exec ai-service ls /data/cv/<USER_ID>` báo không tồn tại;
`SELECT count(*) FROM cv_documents WHERE user_id = '<USER_ID>'` trả 0.

## 7. Hạn chế và hướng hoàn thiện

| # | Hạn chế | Đề xuất |
|---|---|---|
| 1 | ~~Không có API xoá CV cho người dùng~~ | ✅ **Đã sửa**: `GET /api/ai/cv/mine` + `DELETE /api/ai/cv/{cvId}` (chủ CV/ADMIN), xoá hội thoại → `cv_documents` → file → `cvFileUrl` (mục 6.2). Còn lại: goal/kỹ năng suy ra từ CV không tự gỡ |
| 2 | Lưu vô thời hạn, bản cũ không bị dọn | Chỉ giữ CV mới nhất mỗi người, hoặc job xoá CV quá N tháng |
| 3 | ~~Mọi MENTOR tải được mọi CV nếu biết `cvId`~~ | ✅ **Đã sửa**: chỉ mentor có yêu cầu mentoring PENDING/ACCEPTED với mentee (fail-closed) |
| 4 | `raw_text` nhân đôi nội dung CV trong CSDL | Xoá `raw_text` sau khi parse xong, hoặc chỉ giữ `parsed_json` |
| 5 | Không mã hoá khi lưu | Mã hoá volume / dùng object storage có mã hoá phía server (S3/MinIO) — `storage.py` đã tách riêng để thay thế |
| 6 | ~~Không có bước đồng ý trước khi gửi DeepSeek~~ | ✅ **Đã sửa (US-19)**: ô đồng ý trước khi tải, lưu theo CV; không đồng ý ⇒ chỉ rule-based (mục 5) |
