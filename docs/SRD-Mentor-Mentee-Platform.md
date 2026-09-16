# Software Requirements Document (SRD)
## Nền tảng học tập và kết nối Mentor-Mentee trong lĩnh vực lập trình

| | |
|---|---|
| **Nhóm thực hiện** | Phạm Ngọc Quang (B22DCDT243), Đinh Quyết Thắng (B22DCCN809), Phạm Ninh Phương Thảo (B22DCCN803) |
| **Lớp** | E22CNPM03 |
| **GVHD** | Đào Ngọc Phong |
| **Phiên bản** | 1.1 — cập nhật theo hệ thống đã hiện thực hoá |
| **Ngày** | 17/09/2026 |

### Lịch sử phiên bản

| Phiên bản | Ngày | Nội dung |
|---|---|---|
| 0.1 | 2026 | Bản đầu: Auth, Profile, Learning Hub, AI Matching, Mentoring, Payment |
| 0.2 | 31/07/2026 | Bổ sung AI Interview, CV Parsing + Chatbot enrichment, quy trình nghiệp vụ chi tiết (lưu tại `archive/SRD-Mentor-Mentee-Platform-v0.2.md`) |
| 1.0 | 16/09/2026 | Chốt yêu cầu theo bản hiện thực: bổ sung các quyết định thiết kế (mục 2.4), hoàn thiện đặc tả API (mục 9), đánh dấu tiêu chí nghiệm thu đã đạt (mục 6), thống nhất phân công giữa SRD và `CONVENTIONS.md` |
| **1.1** | 17/09/2026 | Tách phần AI hội thoại (AI Interview, CV Parsing, Chatbot enrichment) thành **ai-service** (Python/FastAPI); đổi nhà cung cấp LLM sang **DeepSeek API** (quyết định D4, D12) |

> Tài liệu liên quan: [Kiến trúc](architecture.md) · [Thiết kế CSDL](database-design.md) ·
> [Đặc tả API](api-reference.md) · [Tính năng AI](ai-features.md) ·
> [Quy trình nghiệp vụ](business-domain-mentor-mentee.md) · [Báo cáo kiểm thử](testing-report.md) ·
> [Triển khai & demo](deployment-guide.md) · [Hướng dẫn sử dụng](user-guide.md)

---

## 1. Giới thiệu

### 1.1 Mục đích tài liệu
Tài liệu mô tả yêu cầu chức năng và phi chức năng của hệ thống "Nền tảng học tập và kết nối
Mentor-Mentee trong lĩnh vực lập trình" (tên sản phẩm: **MentorHub**), làm cơ sở cho thiết kế,
phát triển và nghiệm thu đồ án tốt nghiệp.

### 1.2 Phạm vi sản phẩm
Hệ thống cho phép người học (mentee) xây dựng hồ sơ kỹ năng, được AI đề xuất mentor phù hợp dựa
trên mức độ tương đồng hồ sơ và các ràng buộc thực tế (lịch rảnh, sức chứa, trạng thái xác thực),
gửi yêu cầu và đặt lịch mentoring, thanh toán cho phiên mentoring (sandbox), đánh giá sau buổi học.
Hệ thống cung cấp Learning Hub (khoá học, tài liệu, roadmap) và cơ chế giới thiệu bạn bè (referral).
Năng lực mentor được xác thực qua **AI Interview** trước khi kích hoạt; mục tiêu học tập của mentee
được làm rõ qua **CV Parsing + Chatbot enrichment** trước khi vào bước matching.

### 1.3 Phạm vi triển khai

**Mốc thời gian**: deadline cuối tháng 12/2026.

**Trong phạm vi (đã hiện thực, demo được):**
- Quản lý người dùng & phân quyền (mentee/mentor/admin)
- Career Profile (kỹ năng, level, mục tiêu, portfolio, lịch rảnh, mức phí, sức chứa)
- Learning Hub (khoá học, tài liệu, roadmap, theo dõi tiến độ, quản trị nội dung)
- AI Matching mentor-mentee (embedding + pgvector top-K + lọc ràng buộc + re-rank + giải thích)
- AI Interview (xác thực năng lực mentor, admin duyệt cuối cùng)
- CV Parsing + Chatbot enrichment (làm rõ mục tiêu mentee dựa trên CV)
- Mentoring workflow (gửi yêu cầu, chấp nhận, đặt lịch, nhắc lịch, đánh giá, lịch sử)
- Thanh toán mentoring (cổng sandbox) + Referral/Affiliate nội bộ (có chống gian lận cơ bản)

**Ngoài phạm vi đồ án (định hướng mở rộng):**
- Chatbot trợ lý học tập độc lập, đa mục đích
- Chatbot A2A hỗ trợ đăng ký/thanh toán qua giao diện chat
- Video call mentoring (WebRTC 1-1)
- AI phân tích giọng nói từ phỏng vấn
- Gửi email thật qua SMTP, tích hợp cổng thanh toán thật (VNPay/Stripe)

### 1.4 Đối tượng sử dụng tài liệu
Thành viên nhóm phát triển, giảng viên hướng dẫn, hội đồng bảo vệ.

### 1.5 Định nghĩa, thuật ngữ

| Thuật ngữ | Ý nghĩa |
|---|---|
| Mentee | Người học, người tìm mentor |
| Mentor | Người hướng dẫn, cung cấp dịch vụ mentoring |
| Career Profile | Hồ sơ kỹ năng/mục tiêu nghề nghiệp của người dùng |
| Embedding | Vector số (384 chiều) biểu diễn ngữ nghĩa của một hồ sơ |
| pgvector | Extension của PostgreSQL lưu trữ và tìm kiếm vector |
| Top-K retrieval | Truy vấn lấy K ứng viên gần nhất theo độ tương đồng vector |
| Hard filter | Bước loại ứng viên không thoả ràng buộc bắt buộc |
| Re-rank | Xếp hạng lại ứng viên còn lại bằng điểm kết hợp nhiều tiêu chí |
| AI Interview | Buổi phỏng vấn tự động nhiều lượt để đánh giá năng lực mentor |
| Chatbot enrichment | Hội thoại ngắn giúp mentee làm rõ mục tiêu học tập dựa trên CV |
| Slot | Loại thông tin chatbot cần làm rõ (mục tiêu, mảng tập trung, thời gian…) |
| Engine rule-based | Cài đặt AI bằng thuật toán luật, tất định, chạy offline không cần LLM |
| Sandbox | Môi trường thanh toán giả lập, không xử lý tiền thật |
| JWT | JSON Web Token — token xác thực không trạng thái |
| Internal endpoint | API `/internal/*` chỉ dành cho giao tiếp giữa các service |

---

## 2. Mô tả tổng quan hệ thống

### 2.1 Bối cảnh sản phẩm
Hệ thống độc lập, kiến trúc microservices gồm 7 service backend + 1 frontend, triển khai bằng
Docker Compose. Phụ thuộc bên ngoài tuỳ chọn: DeepSeek API cho AI Interview và CV enrichment (gọi từ
ai-service) — khi không cấu hình API key, hệ thống tự dùng engine rule-based nên vẫn chạy offline.

### 2.2 Đối tượng người dùng
- **Mentee**: sinh viên/người đi làm muốn học lập trình có định hướng, cần mentor.
- **Mentor**: người có kinh nghiệm, nhận mentee, mở lịch, thu phí (tuỳ chọn), phải vượt qua AI
  Interview và được admin duyệt trước khi được kích hoạt.
- **Admin**: quản trị người dùng, nội dung Learning Hub, giám sát giao dịch/referral, duyệt kết
  quả AI Interview.

### 2.3 Giả định và ràng buộc
- Dữ liệu ban đầu (mentor mẫu, nội dung Learning Hub) được seed bằng script
  (`db/init/learning-service.sql`, `scripts/seed_demo.py`).
- Thanh toán dùng cổng sandbox với bộ thẻ test, không xử lý tiền thật.
- Email xác thực được ghi ra log (không có SMTP trong môi trường demo).
- Kiến trúc matching dùng mô hình **ranked recommendation (top-K retrieval + re-rank theo ràng
  buộc)**, không dùng tối ưu toàn cục kiểu stable matching, do bản chất hệ thống là tìm kiếm liên
  tục chứ không ghép theo đợt.
- Kết quả AI Interview là **input hỗ trợ quyết định**; admin là người quyết định cuối cùng.
- Mentor chưa được duyệt (chưa phỏng vấn, đang chờ duyệt, bị từ chối) không xuất hiện trong kết
  quả AI Matching và không nhận được yêu cầu mentoring.
- Múi giờ nghiệp vụ: Asia/Ho_Chi_Minh (GMT+7).

### 2.4 Các quyết định thiết kế đã chốt (bổ sung ở v1.0)

| # | Vấn đề | Quyết định | Lý do |
|---|---|---|---|
| D1 | Xác thực giữa các service | JWT HS256 với secret dùng chung, mỗi service tự xác minh cục bộ; lời gọi service-to-service dùng header `X-Internal-Token` | Không phụ thuộc auth-service ở mỗi request (giảm độ trễ, tránh điểm lỗi đơn); access token sống ngắn (30 phút) + refresh token xoay vòng |
| D2 | Số lượt AI Interview (FR-7.3) | **5 lượt** (cấu hình `INTERVIEW_MAX_TURNS`) | Đủ phủ 3–4 chủ đề kèm 1 lượt đào sâu, thời gian hoàn thành ~15–20 phút |
| D3 | Số lượt chatbot enrichment (FR-8.4) | **4 lượt** (cấu hình `ENRICHMENT_MAX_TURNS`) | Đủ làm rõ mục tiêu, mảng tập trung, khó khăn/kinh nghiệm, thời gian mà không gây mệt cho người dùng |
| D4 | Nguồn AI | DeepSeek API ở JSON Output mode (khi có key) + engine rule-based (mặc định & fallback từng lượt) | Demo được offline, kết quả tất định để kiểm thử; lỗi LLM không làm gián đoạn nghiệp vụ; API DeepSeek tương thích định dạng OpenAI |
| D5 | Lưu trạng thái xác thực mentor | Cột `verification_status` trong `mentor_profiles` (profile-service), mentoring-service cập nhật qua API nội bộ | matching-service đọc được trực tiếp khi lọc; giữ nguyên tắc chỉ profile-service ghi vào DB của mình |
| D6 | Sức chứa & rating cho matching | mentoring-service đồng bộ `active_mentee_count`, `rating`, `rating_count` sang profile-service | Hard filter/re-rank chạy trong 1 truy vấn, không gọi thêm service |
| D7 | Tái sử dụng embedding (NFR-7) | Lưu SHA-256 của văn bản chuẩn hoá; chỉ gọi model khi hash thay đổi | Tránh tính lại khi hồ sơ không đổi nội dung |
| D8 | Mentee đặt lịch | Phải có yêu cầu mentoring được chấp nhận; phiên nằm trọn trong khung lịch rảnh; khoá advisory theo mentor khi tạo phiên | Đúng FR-5.4 và tránh đặt trùng khi có yêu cầu đồng thời |
| D9 | Phiên chưa thanh toán | Tự huỷ sau 30 phút | Giải phóng khung giờ bị giữ chỗ |
| D10 | Referral hợp lệ | Giao dịch thành công **đầu tiên** của người được giới thiệu, giá trị ≥ 50.000đ; không cộng nếu người giới thiệu là mentor của giao dịch; tối đa 5 lượt thưởng/ngày/người | Chống gian lận cơ bản (FR-6.6) |
| D11 | Frontend gọi backend | Route handler Next.js làm proxy `/api/<service>/**` | Cùng origin (không cần CORS), không bao giờ expose `/internal/*` |
| D12 | Vị trí mã nguồn AI hội thoại | Service riêng **ai-service** (Python/FastAPI, không lưu trạng thái, chỉ có endpoint nội bộ); mentoring-service giữ luồng nghiệp vụ và dữ liệu, gửi kèm lịch sử hội thoại mỗi lượt | Hệ sinh thái AI chủ yếu ở Python; thay đổi/triển khai model độc lập với nghiệp vụ đặt lịch–thanh toán; AI Interview và CV enrichment dùng chung client LLM & cơ chế fallback; không lưu trạng thái nên dễ nhân bản và khởi động lại |

---

## 3. Yêu cầu chức năng

Cột **Trạng thái**: ✅ đã hiện thực và được kiểm thử (xem [testing-report.md](testing-report.md)).

### 3.1 Module: Quản lý người dùng & phân quyền (auth-service)

| ID | Yêu cầu | Mô tả | Trạng thái |
|---|---|---|---|
| FR-1.1 | Đăng ký tài khoản | Đăng ký với vai trò mentee hoặc mentor (kèm mã giới thiệu tuỳ chọn), gửi liên kết xác thực email | ✅ |
| FR-1.2 | Đăng nhập | Email/password, sinh JWT access token + refresh token; chặn tạm thời sau 5 lần sai mật khẩu | ✅ |
| FR-1.3 | Phân quyền | RBAC theo vai trò MENTEE/MENTOR/ADMIN ở mọi service | ✅ |
| FR-1.4 | Quản lý tài khoản | Cập nhật họ tên, đổi mật khẩu (thu hồi mọi phiên đăng nhập khác) | ✅ |
| FR-1.5 | Admin quản lý user | Admin xem/tìm kiếm, khoá/mở khoá tài khoản | ✅ |

### 3.2 Module: Career Profile (profile-service)

| ID | Yêu cầu | Mô tả | Trạng thái |
|---|---|---|---|
| FR-2.1 | Tạo/sửa hồ sơ kỹ năng | Danh sách kỹ năng, trình độ, lĩnh vực | ✅ |
| FR-2.2 | Mục tiêu học tập | Mentee khai báo mục tiêu | ✅ |
| FR-2.3 | Portfolio | Liên kết dự án/portfolio | ✅ |
| FR-2.4 | Hồ sơ mentor | Chuyên môn, kinh nghiệm, lịch rảnh hằng tuần, mức phí/giờ, sức chứa | ✅ |
| FR-2.5 | Sinh embedding hồ sơ | Tự động tạo/cập nhật embedding khi hồ sơ thay đổi; tự thử lại nếu lỗi | ✅ |

### 3.3 Module: Learning Hub (learning-service)

| ID | Yêu cầu | Mô tả | Trạng thái |
|---|---|---|---|
| FR-3.1 | Danh sách tài liệu/khoá học | Theo lĩnh vực/từ khoá, kèm tài liệu từng khoá | ✅ |
| FR-3.2 | Roadmap | Lộ trình theo hướng (Backend, DevOps, Frontend) liên kết khoá học | ✅ |
| FR-3.3 | Theo dõi tiến độ | Đánh dấu hoàn thành tài liệu/bước roadmap, tính % hoàn thành | ✅ |
| FR-3.4 | Admin quản lý nội dung | Thêm/sửa/xoá khoá học, tài liệu, roadmap, bước roadmap | ✅ |

### 3.4 Module: AI Matching Mentor-Mentee (matching-service)

| ID | Yêu cầu | Mô tả | Trạng thái |
|---|---|---|---|
| FR-4.1 | Sinh embedding | sentence-transformers `all-MiniLM-L6-v2` (384 chiều) từ văn bản hồ sơ chuẩn hoá | ✅ |
| FR-4.2 | Lưu trữ vector | Cột `VECTOR(384)` (pgvector) + chỉ mục HNSW cosine | ✅ |
| FR-4.3 | Truy vấn Top-K | K = max(50, 5×limit) mentor gần nhất theo cosine distance | ✅ |
| FR-4.4 | Lọc ràng buộc cứng | Loại mentor chưa được duyệt, tạm ngưng nhận mentee, chưa có lịch rảnh, đầy sức chứa, khác lĩnh vực | ✅ |
| FR-4.5 | Xếp hạng kết quả | `final = 0.7·similarity + 0.2·rating/5 + 0.1·min(years/10, 1)` | ✅ |
| FR-4.6 | Giải thích gợi ý | Kỹ năng trùng, chuyên môn khớp mục tiêu, cùng lĩnh vực, mức tương đồng, đánh giá, kinh nghiệm + thống kê pipeline | ✅ |

### 3.5 Module: Mentoring Workflow (mentoring-service)

| ID | Yêu cầu | Mô tả | Trạng thái |
|---|---|---|---|
| FR-5.1 | Xem danh sách mentor đề xuất | Kèm điểm phù hợp và lý do | ✅ |
| FR-5.2 | Gửi yêu cầu mentoring | Tới mentor đã được xác thực, không trùng yêu cầu đang hoạt động | ✅ |
| FR-5.3 | Mentor phản hồi yêu cầu | Chấp nhận (khi còn sức chứa) / từ chối kèm lời nhắn | ✅ |
| FR-5.4 | Đặt lịch phiên mentoring | Trong lịch rảnh của mentor, không trùng lịch, giá tính theo thời lượng; giao diện chỉ cho chọn khung giờ còn trống | ✅ |
| FR-5.5 | Nhắc lịch/thông báo | Thông báo trong ứng dụng cho các sự kiện + nhắc lịch trước 24 giờ | ✅ |
| FR-5.6 | Đánh giá sau phiên | Rating 1–5 + nhận xét, 1 lần/phiên, cập nhật rating mentor | ✅ |
| FR-5.7 | Lịch sử mentoring | Danh sách phiên theo trạng thái | ✅ |

### 3.6 Module: Thanh toán & Referral/Affiliate (payment-service)

| ID | Yêu cầu | Mô tả | Trạng thái |
|---|---|---|---|
| FR-6.1 | Thanh toán phiên | Qua cổng sandbox; số tiền lấy từ phiên, không tin client | ✅ |
| FR-6.2 | Xác nhận booking sau thanh toán | Phiên chỉ CONFIRMED khi giao dịch SUCCESS; có job đối soát nếu báo xác nhận thất bại | ✅ |
| FR-6.3 | Quản lý trạng thái giao dịch | PENDING / SUCCESS / FAILED / REFUNDED; hoàn tiền khi huỷ phiên đã thanh toán | ✅ |
| FR-6.4 | Tạo mã giới thiệu | Mã 8 ký tự riêng cho mỗi người dùng + liên kết chia sẻ | ✅ |
| FR-6.5 | Ghi nhận referral hợp lệ | Ghi nhận khi đăng ký; hợp lệ khi có giao dịch thành công đầu tiên | ✅ |
| FR-6.6 | Cộng điểm thưởng | 100 điểm/lượt hợp lệ, sổ cái điểm append-only, quy tắc chống gian lận (D10) | ✅ |

### 3.7 Module: AI Interview (mentoring-service)

| ID | Yêu cầu | Mô tả | Trạng thái |
|---|---|---|---|
| FR-7.1 | Khởi tạo phỏng vấn | Mentor đã có hồ sơ bắt đầu phỏng vấn; tiếp tục được nếu bị gián đoạn | ✅ |
| FR-7.2 | Hỏi đáp nhiều lượt thích ứng | Mỗi câu trả lời được chấm; câu tiếp theo **DEEPEN** (đào sâu) hoặc **PIVOT** (chuyển chủ đề) theo lĩnh vực và câu trả lời | ✅ |
| FR-7.3 | Giới hạn số lượt | 5 lượt (quyết định D2) | ✅ |
| FR-7.4 | Tổng hợp đánh giá | Điểm 0–100, tóm tắt, điểm mạnh, điểm yếu, khuyến nghị APPROVE/REJECT/NEEDS_REVIEW | ✅ |
| FR-7.5 | Admin review | Admin đọc toàn bộ hội thoại, duyệt hoặc từ chối kèm nhận xét; mentor bị từ chối được phỏng vấn lại | ✅ |

### 3.8 Module: CV Parsing + Chatbot Enrichment (mentoring-service)

| ID | Yêu cầu | Mô tả | Trạng thái |
|---|---|---|---|
| FR-8.1 | Upload CV | PDF ≤ 5MB, ≤ 10 trang; mentee (kèm chatbot) và mentor (điền nhanh hồ sơ) | ✅ |
| FR-8.2 | Parse CV | Trích xuất vai trò, kỹ năng, số năm kinh nghiệm, dự án (kèm công nghệ), học vấn | ✅ |
| FR-8.3 | Chatbot hỏi thêm | Câu hỏi dựa trên CV, không hỏi lại thông tin đã có trong CV hoặc đã được trả lời | ✅ |
| FR-8.4 | Tổng hợp goal | Sau 4 lượt tổng hợp thành đoạn mục tiêu chuẩn hoá | ✅ |
| FR-8.5 | Kích hoạt re-embedding | Gửi sang profile-service cập nhật goal, gộp kỹ năng từ CV và sinh lại embedding | ✅ |

---

## 4. Yêu cầu phi chức năng

| ID | Loại | Yêu cầu | Cách đáp ứng | Kết quả đo |
|---|---|---|---|---|
| NFR-1 | Hiệu năng | Top-K matching < 2 giây với vài nghìn profile | Tính khoảng cách ngay trong PostgreSQL (pgvector + HNSW), vector mentee lấy bằng subquery | ~5.000 mentor: p95 **5,7 ms**, max 6,8 ms |
| NFR-2 | Bảo mật | Hash mật khẩu, JWT có hạn, phân quyền theo role | BCrypt; access token 30 phút; refresh token lưu dạng SHA-256, xoay vòng, phát hiện tái sử dụng; chặn brute-force (Redis); `@PreAuthorize`; internal token cho `/internal/*` | `AuthServiceTest` (9 test) và nhóm kiểm tra DoD 1 trong e2e đều pass |
| NFR-3 | Khả năng mở rộng | Microservices, triển khai độc lập qua Docker | 7 service + 5 CSDL riêng, mỗi service 1 Dockerfile; ai-service & matching-service không lưu trạng thái | — |
| NFR-4 | Khả dụng | Chạy ổn định bằng Docker Compose | Healthcheck mọi service, `depends_on` theo trạng thái healthy, job retry/đối soát | `docker compose up` → 7/7 service healthy |
| NFR-5 | Khả năng bảo trì | Tổ chức module rõ ràng, có test | Kiến trúc phân lớp controller/service/repository; 106 unit test + 65 kiểm tra e2e; CI GitHub Actions | 100% pass |
| NFR-6 | Minh bạch AI | Kết quả matching giải thích được | Danh sách lý do + kỹ năng trùng + thống kê mentor bị loại theo từng ràng buộc + trọng số | — |
| NFR-7 | Tái sử dụng dữ liệu | Không tính lại embedding nếu profile không đổi | Hash SHA-256 văn bản chuẩn hoá (D7) | Kiểm thử e2e: lưu lại hồ sơ không đổi → `UNCHANGED` |
| NFR-8 | Độ tin cậy AI Interview | Luôn có bước con người xác nhận | Trạng thái PENDING_REVIEW bắt buộc; matching chỉ lấy mentor APPROVED; prompt chống prompt-injection | Kiểm thử e2e: mentor chờ duyệt không xuất hiện trong matching |

---

## 5. Kiến trúc & công nghệ

Chi tiết: [architecture.md](architecture.md).

### 5.1 Kiến trúc tổng quan
Microservices, giao tiếp REST đồng bộ, contract-first (`contracts/*.yaml`, OpenAPI 3.0). Frontend
Next.js đóng vai trò cổng vào duy nhất của trình duyệt (proxy `/api/**`). Tác vụ nền (retry
embedding, nhắc lịch, huỷ phiên quá hạn, đối soát thanh toán) chạy bằng `@Scheduled` trong từng
service.

| Service | Port | Người phụ trách | Chức năng chính | Tính năng AI gắn kèm |
|---|---|---|---|---|
| auth-service | 8081 | Quang | Tài khoản, JWT, RBAC | — |
| learning-service | 8085 | Quang | Learning Hub | — |
| profile-service | 8082 | Thảo | Career profile, lịch rảnh, embedding | Sinh & lưu embedding |
| matching-service | 8090 | Thảo | AI Matching | **AI Matching** (Thảo) |
| mentoring-service | 8083 | Thắng | Yêu cầu, lịch, đánh giá, thông báo; luồng & dữ liệu AI Interview và CV enrichment | — (gọi ai-service) |
| payment-service | 8084 | Thắng | Thanh toán sandbox, referral | — |
| ai-service | 8091 | Thắng (`app/interview`), Quang (`app/cv`, `app/enrichment`) | Tính toán AI hội thoại, không lưu trạng thái | **AI Interview** (Thắng); **CV Parsing + Chatbot enrichment** (Quang) |

### 5.2 Công nghệ sử dụng

| Thành phần | Công nghệ |
|---|---|
| Frontend | Next.js 14 (App Router), React 18 |
| Backend (5 service) | Java 21, Spring Boot 3.3 (Web, Security, Data JPA, Validation, Actuator) |
| Backend (matching-service, ai-service) | Python 3.11, FastAPI, Pydantic; asyncpg (matching), httpx + pypdf (ai-service) |
| Cơ sở dữ liệu | PostgreSQL 16 (1 DB riêng/service) |
| Vector Database | pgvector (HNSW, cosine) trong DB của profile-service |
| Embedding model | sentence-transformers `all-MiniLM-L6-v2` (384 chiều) |
| LLM (tuỳ chọn) | DeepSeek API (định dạng OpenAI, JSON Output mode), mặc định model `deepseek-flash` |
| Xử lý PDF | pypdf (ai-service) |
| Xác thực | JJWT (HS256), BCrypt, PyJWT |
| Cache/Rate limit | Redis 7 (đếm số lần đăng nhập sai) |
| Hạ tầng | Docker, Docker Compose |
| CI/CD | GitHub Actions (build + unit test theo matrix, e2e bằng docker compose) |
| Thanh toán | Cổng sandbox tự xây dựng (giao diện `PaymentGateway` để thay bằng cổng thật) |

### 5.3 Ngoại lệ kiến trúc đã duyệt
`matching-service` đọc TRỰC TIẾP (read-only) các bảng `mentor_profiles`, `mentee_profiles`,
`mentor_availability` trong DB của `profile-service` bằng role PostgreSQL `matching_reader` chỉ có
quyền `SELECT` — để tính khoảng cách vector ngay trong CSDL thay vì truyền vector qua HTTP. Mọi thao
tác ghi vào các bảng này chỉ do `profile-service` thực hiện. Xem `CONVENTIONS.md` mục 7.

---

## 6. Tiêu chí nghiệm thu (Definition of Done)

Mỗi tiêu chí được kiểm chứng tự động bằng `scripts/e2e_acceptance.py` (kết quả lần chạy cuối:
**65/65 kiểm tra PASS**, chi tiết tại [testing-report.md](testing-report.md)).

- [x] Người dùng đăng ký/đăng nhập được với 3 vai trò mentee/mentor/admin
- [x] Mentee tạo được Career Profile; hệ thống tự sinh embedding khi lưu
- [x] Mentee upload CV, chatbot hỏi thêm dựa trên CV, kết quả được tổng hợp và kích hoạt re-embedding
- [x] Mentor tạo được profile, trải qua AI Interview multi-turn, kết quả được admin review trước khi kích hoạt
- [x] Mentor chưa qua AI Interview không xuất hiện trong kết quả matching
- [x] Mentee nhận được danh sách mentor đề xuất từ Matching Service, có điểm phù hợp và lý do đề xuất
- [x] Danh sách đề xuất đã loại các mentor không thoả lịch rảnh/sức chứa (không chỉ dựa thuần vector)
- [x] Mentee gửi yêu cầu → mentor chấp nhận → đặt lịch → thanh toán sandbox → booking được xác nhận
- [x] Sau phiên, mentee đánh giá được mentor
- [x] Referral code hoạt động: người giới thiệu được ghi nhận và cộng điểm khi có giao dịch hợp lệ
- [x] Toàn bộ hệ thống chạy được bằng `docker compose up` trên máy demo

---

## 7. Phân công công việc

Chi tiết ownership, quy ước git, contract-first workflow trong `CONVENTIONS.md`.

| Thành viên | Service | Frontend feature folder | Tính năng AI tự bảo vệ |
|---|---|---|---|
| **Phạm Ninh Phương Thảo** | `profile-service`, `matching-service` | `profile`, `matching` | **AI Matching** |
| **Đinh Quyết Thắng** | `mentoring-service`, `payment-service`, `ai-service/app/interview` | `mentoring`, `payment` | **AI Interview** |
| **Phạm Ngọc Quang** | `auth-service`, `learning-service`, `ai-service/app/cv` + `app/enrichment` | `auth`, `learning` | **CV Parsing + Chatbot enrichment** (luồng nghiệp vụ tại `mentoring-service/.../CvEnrichmentService`) |

Mỗi người sở hữu đúng 1 tính năng AI riêng để có thể tự bảo vệ trước hội đồng (đồ án chấm điểm cá nhân).

---

## 8. Quy trình nghiệp vụ

Quy trình chi tiết dạng luồng màn hình + sơ đồ tuần tự + sơ đồ trạng thái được trình bày tại
[business-domain-mentor-mentee.md](business-domain-mentor-mentee.md), gồm:

1. Đăng ký, đăng nhập, xác thực email, làm mới token
2. Mentor: tạo hồ sơ → khai báo lịch rảnh → AI Interview → admin duyệt
3. Mentee: tạo hồ sơ → upload CV → chatbot enrichment → re-embedding
4. Tìm mentor phù hợp (AI Matching)
5. Gửi yêu cầu → chấp nhận → đặt lịch → thanh toán → xác nhận → nhắc lịch → hoàn thành → đánh giá
6. Huỷ phiên & hoàn tiền; tự huỷ phiên quá hạn thanh toán
7. Giới thiệu bạn bè & cộng điểm
8. Learning Hub: học khoá học, theo dõi tiến độ; admin quản lý nội dung

---

## 9. Đặc tả API (tóm tắt)

Bản đầy đủ theo từng endpoint: [api-reference.md](api-reference.md); schema chi tiết: `contracts/*.yaml`.

**Quy ước chung:**
- JSON `camelCase`, SQL `snake_case`.
- Lỗi: `{ "error": { "code": "STRING_CODE", "message": "..." } }`.
- Endpoint `/api/**` yêu cầu `Authorization: Bearer <JWT>` (trừ đăng ký/đăng nhập/refresh/xác thực email).
- Endpoint `/internal/**` chỉ nhận header `X-Internal-Token`, không đi qua frontend.

| Service | Số endpoint | Nhóm chức năng |
|---|---|---|
| auth-service | 12 | register, login, refresh, logout, verify-email, verify-token, me, change-password, admin users |
| profile-service | 12 | mentor/mentee profile, availability, mentor search, enrichment-chat, rebuild embeddings, internal (summary, mentor, verification, rating, active-mentees) |
| matching-service | 3 | health, internal embed, matching mentors |
| learning-service | 18 | courses, enroll, progress, materials, roadmaps, admin CRUD |
| mentoring-service | 29 | requests, sessions, reviews, notifications, interviews, admin interviews, CV upload/parse, enrichment conversations, internal sessions |
| payment-service | 11 | charge, transactions, referrals, admin stats/transactions/referrals, internal referrals/refund |
| ai-service | 7 | health, internal interview (first-question, evaluate, summarize), internal cv parse, internal enrichment (next-question, summarize) |

### 9.1 Sơ đồ gọi API giữa các service

```
browser ──► frontend (Next.js, proxy /api/<service>/**)
               ├─► auth-service ─────────────► payment-service   [POST /internal/referrals]
               ├─► profile-service ──────────► matching-service  [POST /internal/embed]
               ├─► matching-service ─────────► profile-db (READ-ONLY, ngoại lệ đã duyệt)
               ├─► learning-service
               ├─► mentoring-service ────────► profile-service   [/internal/mentor/*, /internal/profile-summary, enrichment-chat]
               │                    ├────────► payment-service   [POST /internal/payments/refund]
               │                    └────────► ai-service        [/internal/interview/*, /internal/cv/parse, /internal/enrichment/*]
               │                                   └──► DeepSeek API (tuỳ chọn)
               └─► payment-service ──────────► mentoring-service [GET /internal/sessions/{id}, POST .../payment-succeeded]
```
