# Software Requirements Document (SRD)
## Nền tảng học tập và kết nối Mentor-Mentee trong lĩnh vực lập trình

| | |
|---|---|
| **Nhóm thực hiện** | Phạm Ngọc Quang (B22DCDT243), Đinh Quyết Thắng (B22DCCN809), Phạm Ninh Phương Thảo (B22DCCN803) |
| **Lớp** | E22CNPM03 |
| **GVHD** | Đào Ngọc Phong |
| **Phiên bản** | 0.2 — cập nhật sau khi bổ sung AI Interview, CV Parsing + Chatbot enrichment, và business process chi tiết |
| **Ngày** | 31/07/2026 |

> **Lưu ý về phiên bản**: Bản v0.2 này được dựng lại dựa trên nội dung v0.1
> đã tạo trước đó, cộng với các quyết định mới phát sinh sau (mục 3.7, 3.8,
> 7, 8). Nếu nhóm có bản v0.1 gốc lưu ở máy khác, nên đối chiếu lại trước
> khi dùng bản này làm chính thức.

---

## 1. Giới thiệu

### 1.1 Mục đích tài liệu
Tài liệu này mô tả yêu cầu chức năng và phi chức năng cho hệ thống "Nền
tảng học tập và kết nối Mentor-Mentee trong lĩnh vực lập trình", làm cơ
sở cho thiết kế, phát triển và nghiệm thu đồ án tốt nghiệp.

### 1.2 Phạm vi sản phẩm
Hệ thống cho phép người học (mentee) xây dựng hồ sơ kỹ năng, được AI đề
xuất mentor phù hợp dựa trên mức độ tương đồng hồ sơ và các ràng buộc
thực tế (lịch rảnh, sức chứa), đặt lịch mentoring, thanh toán cho
phiên/gói mentoring, và đánh giá sau buổi học. Hệ thống cung cấp thêm
Learning Hub (tài liệu, khóa học, roadmap) làm cơ sở dữ liệu kỹ năng phục
vụ matching. Ngoài ra, hệ thống xác thực năng lực mentor qua AI Interview
trước khi kích hoạt, và hỗ trợ mentee làm rõ mục tiêu học tập qua CV
Parsing kết hợp Chatbot enrichment trước khi vào bước matching.

### 1.3 Phạm vi triển khai

**Mốc thời gian**: deadline cuối tháng 12/2026 (không còn là khung 6 tuần
cố định như bản kế hoạch ban đầu — 6 tuần chỉ là 1 giai đoạn nhỏ trong
tổng tiến độ).

**Trong phạm vi (core, bắt buộc demo được):**
- Quản lý người dùng & phân quyền (mentee/mentor/admin)
- Career Profile (kỹ năng, level, mục tiêu, portfolio)
- Learning Hub (tài liệu, khóa học, roadmap — mức cơ bản)
- AI Matching mentor-mentee (embedding + vector search + re-rank theo
  ràng buộc)
- AI Interview (xác thực năng lực mentor trước khi kích hoạt tài khoản)
- CV Parsing + Chatbot enrichment (làm rõ mục tiêu mentee dựa trên CV)
- Mentoring workflow (tìm mentor, gửi yêu cầu, đặt lịch, đánh giá)
- Thanh toán mentoring (sandbox) + Referral/Affiliate nội bộ (cơ bản)

**Ngoài phạm vi đồ án (định hướng mở rộng sau này):**
- Chatbot trợ lý học tập độc lập (AI Learning Assistant, đa mục đích —
  khác với chatbot enrichment hẹp phục vụ riêng cho matching)
- Chatbot A2A hỗ trợ đăng ký/thanh toán qua giao diện chat
- Video call mentoring (WebRTC 1-1)
- AI phân tích giọng nói từ phỏng vấn

### 1.4 Đối tượng sử dụng tài liệu
Thành viên nhóm phát triển, giảng viên hướng dẫn, hội đồng bảo vệ.

### 1.5 Định nghĩa, thuật ngữ

| Thuật ngữ | Ý nghĩa |
|---|---|
| Mentee | Người học, người tìm mentor |
| Mentor | Người hướng dẫn, cung cấp dịch vụ mentoring |
| Career Profile | Hồ sơ kỹ năng/mục tiêu nghề nghiệp của người dùng |
| Embedding | Vector số hoá biểu diễn ngữ nghĩa của một profile |
| Top-K retrieval | Bước truy vấn lấy K ứng viên gần nhất theo độ tương đồng vector |
| Re-rank | Bước xếp hạng lại danh sách ứng viên sau khi áp thêm ràng buộc cứng |
| AI Interview | Buổi phỏng vấn tự động nhiều lượt để đánh giá năng lực mentor |
| Chatbot enrichment | Hội thoại ngắn giúp mentee làm rõ mục tiêu học tập dựa trên CV |

---

## 2. Mô tả tổng quan hệ thống

### 2.1 Bối cảnh sản phẩm
Hệ thống độc lập, kiến trúc microservices, không phụ thuộc hệ thống ngoài
(trừ payment gateway sandbox).

### 2.2 Đối tượng người dùng
- **Mentee**: sinh viên/người đi làm muốn học lập trình có định hướng,
  cần mentor.
- **Mentor**: người có kinh nghiệm, nhận mentee, mở lịch, thu phí (tuỳ
  chọn), cần vượt qua AI Interview trước khi được kích hoạt.
- **Admin**: quản trị người dùng, nội dung Learning Hub, giám sát giao
  dịch/referral, review kết quả AI Interview trước khi duyệt mentor.

### 2.3 Giả định và ràng buộc
- Dữ liệu ban đầu (mentor mẫu, tài liệu Learning Hub) được seed thủ
  công/script, không có nguồn dữ liệu thật.
- Payment gateway dùng chế độ sandbox/test, không xử lý tiền thật.
- Video call và chatbot học tập độc lập không nằm trong phạm vi build,
  chỉ có thể được đặt làm placeholder UI nếu còn thời gian.
- Kiến trúc matching sử dụng mô hình **ranked recommendation (top-K
  retrieval + re-rank theo ràng buộc)**, không dùng optimization toàn
  cục kiểu stable matching, do bản chất hệ thống là tìm-kiếm-liên-tục
  chứ không ghép theo đợt.
- Kết quả AI Interview là **input hỗ trợ quyết định**, không tự động
  kích hoạt/từ chối mentor hoàn toàn — cần có bước admin review.
- Mentor chưa vượt qua AI Interview sẽ không xuất hiện trong kết quả AI
  Matching.

---

## 3. Yêu cầu chức năng

### 3.1 Module: Quản lý người dùng & phân quyền

| ID | Yêu cầu | Mô tả |
|---|---|---|
| FR-1.1 | Đăng ký tài khoản | Người dùng đăng ký với vai trò mentee hoặc mentor, xác thực email |
| FR-1.2 | Đăng nhập | Đăng nhập bằng email/password, sinh JWT access + refresh token |
| FR-1.3 | Phân quyền | Hệ thống phân biệt quyền truy cập theo vai trò mentee/mentor/admin (RBAC) |
| FR-1.4 | Quản lý tài khoản | Người dùng cập nhật thông tin cá nhân, đổi mật khẩu |
| FR-1.5 | Admin quản lý user | Admin xem, khoá/mở tài khoản người dùng |

### 3.2 Module: Career Profile

| ID | Yêu cầu | Mô tả |
|---|---|---|
| FR-2.1 | Tạo/sửa hồ sơ kỹ năng | Người dùng khai báo danh sách kỹ năng, mức độ (level), ngôn ngữ/công nghệ |
| FR-2.2 | Mục tiêu học tập | Mentee khai báo mục tiêu (ví dụ: chuẩn bị phỏng vấn backend, học system design) |
| FR-2.3 | Portfolio | Người dùng thêm liên kết dự án/portfolio |
| FR-2.4 | Hồ sơ mentor | Mentor khai báo chuyên môn, kinh nghiệm, lịch rảnh, mức phí (nếu có), sức chứa (số mentee tối đa) |
| FR-2.5 | Sinh embedding hồ sơ | Hệ thống tự động tạo/cập nhật vector embedding mỗi khi hồ sơ thay đổi |

### 3.3 Module: Learning Hub

| ID | Yêu cầu | Mô tả |
|---|---|---|
| FR-3.1 | Danh sách tài liệu/khoá học | Hiển thị tài liệu, khoá học theo chủ đề/kỹ năng |
| FR-3.2 | Roadmap | Hiển thị lộ trình học theo từng hướng (VD: Backend, DevOps) |
| FR-3.3 | Theo dõi tiến độ | Người dùng đánh dấu tiến độ hoàn thành theo mục trong roadmap |
| FR-3.4 | Admin quản lý nội dung | Admin thêm/sửa/xoá tài liệu, khoá học, roadmap |

### 3.4 Module: AI Matching Mentor-Mentee

| ID | Yêu cầu | Mô tả |
|---|---|---|
| FR-4.1 | Sinh embedding | Hệ thống sinh vector embedding từ Career Profile (kỹ năng, mục tiêu, mô tả) bằng mô hình sentence-transformer |
| FR-4.2 | Lưu trữ vector | Vector được lưu trong PostgreSQL (pgvector), gắn với profile tương ứng |
| FR-4.3 | Truy vấn Top-K | Khi mentee tìm mentor, hệ thống truy vấn Top-K mentor có vector gần nhất (cosine similarity) |
| FR-4.4 | Lọc ràng buộc cứng | Sau truy vấn, hệ thống loại các mentor không thoả điều kiện lịch rảnh, đã đầy sức chứa, hoặc chưa vượt qua AI Interview |
| FR-4.5 | Xếp hạng kết quả | Hệ thống xếp hạng danh sách mentor còn lại theo điểm tương đồng kết hợp yếu tố phụ (đánh giá trung bình, kinh nghiệm) |
| FR-4.6 | Giải thích gợi ý | Hiển thị lý do đề xuất (VD: trùng kỹ năng X, Y) để tăng tính minh bạch |

### 3.5 Module: Mentoring Workflow

| ID | Yêu cầu | Mô tả |
|---|---|---|
| FR-5.1 | Xem danh sách mentor đề xuất | Mentee xem danh sách mentor được AI đề xuất, kèm điểm phù hợp |
| FR-5.2 | Gửi yêu cầu mentoring | Mentee gửi yêu cầu tới mentor cụ thể |
| FR-5.3 | Mentor phản hồi yêu cầu | Mentor chấp nhận/từ chối yêu cầu |
| FR-5.4 | Đặt lịch phiên mentoring | Sau khi được chấp nhận, hai bên chọn khung giờ trong lịch rảnh của mentor |
| FR-5.5 | Nhắc lịch/thông báo | Hệ thống gửi thông báo trước phiên mentoring |
| FR-5.6 | Đánh giá sau phiên | Mentee đánh giá (rating + nhận xét) sau khi kết thúc phiên |
| FR-5.7 | Lịch sử mentoring | Người dùng xem lại lịch sử các phiên đã tham gia |

### 3.6 Module: Thanh toán & Referral/Affiliate

| ID | Yêu cầu | Mô tả |
|---|---|---|
| FR-6.1 | Thanh toán phiên/gói mentoring | Mentee thanh toán qua payment gateway sandbox khi đặt lịch phiên có phí |
| FR-6.2 | Xác nhận booking sau thanh toán | Booking chỉ được xác nhận khi thanh toán thành công |
| FR-6.3 | Quản lý trạng thái giao dịch | Hệ thống lưu và hiển thị trạng thái (pending/success/failed/refunded) |
| FR-6.4 | Tạo mã giới thiệu (referral code) | Người dùng có mã giới thiệu riêng để mời người khác |
| FR-6.5 | Ghi nhận referral hợp lệ | Hệ thống ghi nhận khi người được giới thiệu đăng ký/thực hiện giao dịch đầu tiên |
| FR-6.6 | Cộng điểm thưởng | Người giới thiệu được cộng điểm/credit theo quy tắc kiểm soát (chống gian lận cơ bản) |

### 3.7 Module: AI Interview (mới bổ sung)

| ID | Yêu cầu | Mô tả |
|---|---|---|
| FR-7.1 | Khởi tạo phỏng vấn | Sau khi mentor nộp hồ sơ, hệ thống yêu cầu hoàn thành AI Interview trước khi kích hoạt |
| FR-7.2 | Hỏi đáp nhiều lượt (multi-turn adaptive) | Hệ thống sinh câu hỏi kế tiếp dựa trên câu trả lời trước đó của mentor, đào sâu hoặc chuyển hướng theo domain đăng ký |
| FR-7.3 | Giới hạn số lượt | Phỏng vấn dừng sau 1 số lượt cố định (giá trị cụ thể do team implement quyết định và ghi chú lại) |
| FR-7.4 | Tổng hợp đánh giá | Hệ thống tổng hợp toàn bộ hội thoại thành điểm số + nhận xét định tính |
| FR-7.5 | Admin review | Kết quả AI Interview là input hỗ trợ; admin/GVHD xác nhận cuối cùng trước khi mentor được kích hoạt hoàn toàn |

### 3.8 Module: CV Parsing + Chatbot Enrichment (mới bổ sung)

| ID | Yêu cầu | Mô tả |
|---|---|---|
| FR-8.1 | Upload CV | Mentee (và mentor, nếu áp dụng) tải lên file CV dạng PDF |
| FR-8.2 | Parse CV | Hệ thống trích xuất dữ liệu có cấu trúc từ CV: kỹ năng, kinh nghiệm, dự án đã làm |
| FR-8.3 | Chatbot hỏi thêm (mentee) | Dựa trên kết quả parse CV, chatbot hỏi thêm mentee để làm rõ mục tiêu — không hỏi lại thông tin đã có trong CV |
| FR-8.4 | Tổng hợp goal | Sau N lượt hỏi đáp, hệ thống tổng hợp thành 1 đoạn mô tả mục tiêu chuẩn hoá |
| FR-8.5 | Kích hoạt re-embedding | Kết quả tổng hợp được gửi sang Profile Service để cập nhật hồ sơ và sinh lại embedding |

---

## 4. Yêu cầu phi chức năng

| ID | Loại | Yêu cầu |
|---|---|---|
| NFR-1 | Hiệu năng | Truy vấn Top-K matching trả kết quả trong < 2 giây với tập dữ liệu demo (~vài nghìn profile) |
| NFR-2 | Bảo mật | Mật khẩu hash (bcrypt/argon2); JWT có thời hạn; endpoint phân quyền theo role |
| NFR-3 | Khả năng mở rộng | Kiến trúc microservices, mỗi service triển khai độc lập qua Docker |
| NFR-4 | Khả dụng | Hệ thống demo chạy ổn định trong môi trường Docker Compose cục bộ/cloud free tier |
| NFR-5 | Khả năng bảo trì | Code tuân theo chuẩn tổ chức module rõ ràng (Spring Boot layered architecture), có test cơ bản cho matching service |
| NFR-6 | Khả năng minh bạch (AI) | Kết quả matching có thể giải thích được (không phải hộp đen hoàn toàn) |
| NFR-7 | Khả năng dùng lại dữ liệu | Embedding được tái sử dụng, không tính toán lại nếu profile không đổi |
| NFR-8 | Độ tin cậy AI Interview | Kết quả AI Interview không phải quyết định tự động 100% — luôn có bước con người xác nhận, tránh rủi ro đánh giá sai không ai kiểm tra lại |

---

## 5. Kiến trúc & công nghệ

### 5.1 Kiến trúc tổng quan
Microservices, giao tiếp qua REST (đồng bộ), contract-first (xem
`contracts/*.yaml`). Có thể dùng message queue/event nhẹ cho các tác vụ
nền (sinh embedding) nếu thời gian cho phép; trước mắt dùng gọi đồng bộ
giữa các service cho đơn giản.

**Các service (6 service, mỗi thành viên sở hữu 2):**

| Service | Port | Người phụ trách | Tính năng AI gắn kèm |
|---|---|---|---|
| auth-service | 8081 | Quang | — |
| learning-service | 8085 | Quang | CV Parsing + Chatbot enrichment (logic đặt ở mentoring-service, gọi API sang profile-service) |
| profile-service | 8082 | Thảo | Sinh & lưu embedding |
| matching-service | 8090 | Thảo | AI Matching (embedding + pgvector + top-K + filter + re-rank) |
| mentoring-service | 8083 | Thắng | AI Interview |
| payment-service | 8084 | Thắng | — |

> Lưu ý: CV Parsing + Chatbot enrichment do Quang phụ trách nhưng logic
> đặt trong `mentoring-service` (không phải `auth`/`learning`) vì đây là
> nơi tự nhiên nhất về mặt nghiệp vụ (bước chuẩn bị mentee trước
> mentoring) — Quang code trong service của Thắng cho phần này, cần phối
> hợp rõ giữa 2 người. Xem `business-domain-mentor-mentee.md` mục 3-4 để
> hiểu rõ luồng.

### 5.2 Công nghệ sử dụng

| Thành phần | Công nghệ |
|---|---|
| Frontend | Next.js 14 |
| Backend (5 service) | Java Spring Boot 21 (Spring Web, Spring Security, Spring Data JPA) |
| Backend (matching-service) | Python FastAPI |
| Cơ sở dữ liệu | PostgreSQL (1 DB riêng/service) |
| Vector Database | pgvector (extension của PostgreSQL, dùng trong profile-service, đọc bởi matching-service) |
| Embedding model | sentence-transformers (all-MiniLM-L6-v2, 384 chiều) |
| Cache/Session | Redis |
| Hạ tầng | Docker, Docker Compose |
| CI/CD | GitHub Actions (build matrix) |
| Thanh toán | Payment gateway (sandbox) |

### 5.3 Ngoại lệ kiến trúc đã duyệt
`matching-service` đọc TRỰC TIẾP (read-only) bảng embedding trong DB của
`profile-service`, thay vì gọi qua HTTP — để tránh truyền vector lớn qua
network. Mọi thao tác ghi (write) vào profile chỉ do `profile-service`
thực hiện. Chi tiết xem `CONVENTIONS.md` mục 6.

---

## 6. Tiêu chí nghiệm thu (Definition of Done — phạm vi đồ án)

- [ ] Người dùng đăng ký/đăng nhập được với 3 vai trò mentee/mentor/admin
- [ ] Mentee tạo được Career Profile; hệ thống tự sinh embedding khi lưu
- [ ] Mentee upload CV, chatbot hỏi thêm dựa trên CV, kết quả được tổng
      hợp và kích hoạt re-embedding
- [ ] Mentor tạo được profile, trải qua AI Interview multi-turn, kết quả
      được admin review trước khi kích hoạt
- [ ] Mentor chưa qua AI Interview không xuất hiện trong kết quả matching
- [ ] Mentee nhận được danh sách mentor đề xuất từ Matching Service, có
      điểm phù hợp và lý do đề xuất
- [ ] Danh sách đề xuất đã loại các mentor không thoả lịch rảnh/sức chứa
      (không chỉ dựa thuần vector)
- [ ] Mentee gửi yêu cầu → mentor chấp nhận → đặt lịch → thanh toán
      sandbox → booking được xác nhận
- [ ] Sau phiên, mentee đánh giá được mentor
- [ ] Referral code hoạt động: người giới thiệu được ghi nhận và cộng
      điểm khi có giao dịch hợp lệ
- [ ] Toàn bộ hệ thống chạy được bằng `docker-compose up` trên máy demo

---

## 7. Phân công công việc

Xem chi tiết ownership, quy ước git, contract-first workflow trong
`CONVENTIONS.md`. Tóm tắt:

- **Phạm Ninh Phương Thảo**: `profile-service`, `matching-service` — sở
  hữu và tự bảo vệ tính năng **AI Matching**.
- **Đinh Quyết Thắng**: `mentoring-service`, `payment-service` — sở hữu
  và tự bảo vệ tính năng **AI Interview**.
- **Phạm Ngọc Quang**: `auth-service`, `learning-service` — sở hữu và tự
  bảo vệ tính năng **CV Parsing + Chatbot enrichment**.

Mỗi người sở hữu đúng 1 tính năng AI riêng để đảm bảo có thể tự bảo vệ
trước hội đồng (đồ án chấm điểm cá nhân).

---

## 8. Quy trình nghiệp vụ chi tiết của các chức năng

Phần này mô tả luồng nghiệp vụ cụ thể (business process) cho một số chức
năng chọn lọc của từng service, theo định dạng UI → hành động → nhánh rẽ
→ kết quả. Các chức năng còn lại có thể được mô tả theo cách tương tự.

### 8.1 auth-service

**Đăng ký tài khoản**

Người dùng mở nền tảng -> Giao diện trang chủ xuất hiện với 2 lựa chọn:
đăng nhập và đăng ký -> Người dùng chọn đăng ký -> Giao diện đăng ký xuất
hiện với các ô nhập email, mật khẩu, và 1 lựa chọn vai trò (mentor hoặc
mentee) -> Người dùng nhập thông tin cần thiết, chọn vai trò, rồi bấm nút
đăng ký -> Hệ thống kiểm tra xem email đã tồn tại chưa -> Nếu email đã
tồn tại, hệ thống thông báo lỗi và giữ nguyên giao diện đăng ký -> Nếu
email chưa tồn tại, hệ thống tạo tài khoản mới, sinh access token, và
chuyển tới giao diện trang chủ tương ứng với vai trò (giao diện mentor
hoặc giao diện mentee).

**Đăng nhập**

Người dùng mở nền tảng -> Người dùng chọn đăng nhập -> Giao diện đăng
nhập xuất hiện với các ô nhập email và mật khẩu -> Người dùng nhập thông
tin đăng nhập rồi bấm nút đăng nhập -> Hệ thống xác thực thông tin với
tài khoản đã lưu -> Nếu thông tin không đúng, hệ thống thông báo lỗi và
giữ nguyên giao diện đăng nhập -> Nếu thông tin đúng, hệ thống sinh access
token và chuyển tới giao diện trang chủ tương ứng với vai trò của tài
khoản (mentor hoặc mentee).

### 8.2 profile-service

**Chỉnh sửa hồ sơ nghề nghiệp của mentor**

Mentor đăng nhập vào hệ thống -> Giao diện trang chủ mentor xuất hiện với
các lựa chọn: quản lý hồ sơ nghề nghiệp, xem danh sách mentee được gợi ý,
quản lý phiên mentoring -> Mentor chọn quản lý hồ sơ nghề nghiệp -> Giao
diện hồ sơ nghề nghiệp xuất hiện với các giá trị hiện có của kỹ năng,
lĩnh vực, mô tả bản thân, số năm kinh nghiệm, và 1 lựa chọn để tải lên
file CV -> Mentor chỉnh sửa 1 số giá trị thuộc tính rồi bấm nút lưu ->
Hệ thống lưu lại hồ sơ đã cập nhật, tổng hợp các thuộc tính đã cập nhật
thành 1 đoạn văn bản chuẩn hóa, gửi đoạn văn bản này sang matching-service
để sinh 1 vector embedding mới, và lưu vector trả về cùng với hồ sơ ->
Hệ thống thông báo thành công và sau đó, quay về giao diện trang chủ
mentor.

**Xem hồ sơ nghề nghiệp của mentee (chỉ đọc, nội bộ)**

Một service khác (ví dụ mentoring-service) yêu cầu bản tóm tắt hồ sơ của
1 mentee cụ thể -> profile-service nhận yêu cầu kèm mã định danh của
mentee -> Hệ thống truy vấn bản ghi hồ sơ đã lưu -> Nếu không tìm thấy
hồ sơ nào ứng với mã định danh đó, hệ thống trả về phản hồi không tìm
thấy -> Nếu hồ sơ tồn tại, hệ thống trả về bản tóm tắt gồm tên hiển thị,
vai trò, và lĩnh vực, không bao gồm vector embedding thô.

### 8.3 matching-service

**Tìm mentor phù hợp cho mentee**

Mentee đăng nhập vào hệ thống -> Giao diện trang chủ mentee xuất hiện với
các lựa chọn: quản lý hồ sơ nghề nghiệp, tìm mentor, xem các phiên đã đặt
-> Mentee chọn tìm mentor -> Hệ thống truy xuất vector embedding đã lưu
của mentee -> Nếu chưa có embedding nào (mentee chưa hoàn thành hồ sơ),
hệ thống thông báo yêu cầu mentee hoàn thành hồ sơ trước -> Nếu đã có
embedding, hệ thống thực hiện tìm kiếm top-K theo độ tương đồng với toàn
bộ embedding của mentor trong cơ sở dữ liệu, sử dụng khoảng cách cosine
-> Hệ thống loại khỏi danh sách ứng viên bất kỳ mentor nào đã hết chỗ
nhận, đang không sẵn sàng, chưa vượt qua AI Interview, hoặc không đúng
lĩnh vực mentee yêu cầu -> Hệ thống tính điểm xếp hạng cuối cùng cho từng
ứng viên còn lại, kết hợp điểm tương đồng, đánh giá (rating) của mentor,
và số năm kinh nghiệm -> Giao diện danh sách mentor phù hợp xuất hiện,
hiển thị các mentor được xếp hạng cao nhất kèm: tên hiển thị, lĩnh vực,
điểm tương đồng, đánh giá, và số năm kinh nghiệm -> Mentee bấm vào 1
mentor trong danh sách để tiếp tục đặt lịch.

**Sinh embedding cho 1 hồ sơ (nội bộ)**

profile-service gửi 1 đoạn văn bản đã chuẩn hóa mô tả hồ sơ mentor hoặc
mentee sang matching-service -> matching-service nhận đoạn văn bản ->
Hệ thống đưa đoạn văn bản qua model embedding đã được huấn luyện sẵn ->
Hệ thống trả về vector kết quả cho service đã gọi -> Service đã gọi lưu
vector cùng với bản ghi hồ sơ tương ứng.

### 8.4 mentoring-service

**Hoàn thành AI Interview để xác thực năng lực mentor**

Mentor hoàn tất việc nộp hồ sơ -> Hệ thống thông báo rằng cần hoàn thành
1 buổi AI Interview trước khi tài khoản mentor được kích hoạt -> Mentor
bấm nút bắt đầu phỏng vấn -> Giao diện AI Interview xuất hiện với câu hỏi
đầu tiên, liên quan tới lĩnh vực mentor đã khai -> Mentor trả lời câu hỏi
rồi bấm nút gửi -> Hệ thống đánh giá câu trả lời và sinh câu hỏi tiếp
theo, hoặc đào sâu hơn vào cùng chủ đề, hoặc chuyển sang chủ đề liên quan
-> Quá trình hỏi-đáp này lặp lại trong 1 số lượt cố định -> Sau lượt cuối
cùng, hệ thống tổng hợp toàn bộ câu trả lời thành 1 đánh giá tổng thể, gồm
điểm số và nhận xét định tính -> Kết quả đánh giá được hiển thị cho mentor
kèm thông báo rằng quyết định kích hoạt cuối cùng đang chờ admin xem xét
-> Hệ thống lưu lại kết quả đánh giá và thông báo cho admin để xem xét.

**Tải lên CV và bắt đầu chatbot enrichment (mentee)**

Mentee đăng nhập vào hệ thống -> Mentee chọn hoàn thành hồ sơ nghề nghiệp
-> Giao diện hồ sơ xuất hiện với 1 lựa chọn để tải lên file CV -> Mentee
chọn 1 file CV rồi bấm nút tải lên -> Hệ thống phân tích CV thành dữ liệu
có cấu trúc, gồm kỹ năng, số năm kinh nghiệm, và các dự án đã từng làm ->
Giao diện chatbot enrichment xuất hiện với câu hỏi đầu tiên được sinh ra
dựa trên CV đã phân tích, tránh hỏi lại những thông tin đã có sẵn trong
CV -> Mentee trả lời câu hỏi -> Hệ thống sinh câu hỏi tiếp theo dựa trên
câu trả lời trước đó -> Quá trình trao đổi này lặp lại trong 1 số lượt cố
định -> Sau lượt cuối cùng, hệ thống tổng hợp cuộc hội thoại thành 1 đoạn
mô tả mục tiêu đã được làm rõ, và gửi sang profile-service để cập nhật hồ
sơ mentee cùng với việc kích hoạt sinh lại embedding -> Hệ thống thông báo
thành công và sau đó, quay về giao diện trang chủ mentee.

**Đặt lịch phiên mentoring**

Mentee đã chọn 1 mentor từ danh sách mentor phù hợp -> Giao diện đặt lịch
xuất hiện với 1 ô nhập ngày giờ mong muốn, và 1 nút xác nhận -> Mentee
chọn ngày giờ rồi bấm nút xác nhận -> Hệ thống kiểm tra xem mentor đã
chọn còn rảnh vào thời điểm đó không -> Nếu mentor không còn rảnh, hệ
thống thông báo lỗi và giữ nguyên giao diện đặt lịch -> Nếu mentor còn
rảnh, hệ thống tạo 1 bản ghi phiên mới với trạng thái đang chờ, và chuyển
tới giao diện thanh toán để hoàn tất việc đặt lịch.

### 8.5 learning-service

**Xem tiến độ học khoá học**

Người dùng (mentor hoặc mentee) đăng nhập vào hệ thống -> Người dùng chọn
xem Learning Hub -> Giao diện Learning Hub xuất hiện với danh sách các
khoá học đã đăng ký -> Người dùng bấm vào 1 khoá học -> Giao diện chi
tiết khoá học xuất hiện, hiển thị tên khoá học, lĩnh vực, và phần trăm
hoàn thành hiện tại của người dùng -> Người dùng tiếp tục học tài liệu
khoá học, và hệ thống cập nhật phần trăm hoàn thành tương ứng.

### 8.6 payment-service

**Thanh toán cho phiên đã đặt**

Mentee đã xác nhận đặt lịch 1 phiên mentoring -> Giao diện thanh toán
xuất hiện với thông tin phiên và số tiền cần thanh toán -> Mentee bấm
nút thanh toán -> Hệ thống tạo 1 bản ghi giao dịch với trạng thái đang
chờ và chuyển yêu cầu tới bên xử lý thanh toán -> Nếu thanh toán thất
bại, hệ thống cập nhật trạng thái giao dịch thành thất bại và thông báo
lỗi -> Nếu thanh toán thành công, hệ thống cập nhật trạng thái giao dịch
thành thành công, xác nhận phiên tương ứng, và thông báo thành công ->
Hệ thống quay về giao diện trang chủ mentee, hiển thị phiên đã xác nhận
trong danh sách các phiên sắp tới.
## 9. Đặc tả API

Mục này tổng hợp toàn bộ endpoint của 6 service dưới dạng bảng, dựa trên
contract OpenAPI đầy đủ trong thư mục `contracts/*.yaml`. Đây là bản tóm
tắt để tra cứu nhanh trong báo cáo — chi tiết schema request/response đầy
đủ (bao gồm các trường bắt buộc, kiểu dữ liệu) xem trực tiếp trong file
`.yaml` tương ứng.

**Quy ước chung** (xem thêm `CONVENTIONS.md` mục 3):
- Field JSON: `camelCase`. Cột/bảng SQL: `snake_case`.
- Mọi response lỗi theo format thống nhất:
  `{ "error": { "code": "STRING_CODE", "message": "..." } }`.
- Endpoint có tiền tố `/internal/` chỉ dùng cho giao tiếp service-to-service,
  không expose ra ngoài qua frontend/gateway.

---

### 9.1 auth-service (port 8081)

| Method | Endpoint | Mô tả | Request chính | Response chính |
|---|---|---|---|---|
| GET | `/health` | Health check | — | `{ status }` |
| POST | `/api/auth/register` | Đăng ký tài khoản mentor/mentee | `email, password, role` | `AuthResponse` (userId, email, role, accessToken) |
| POST | `/api/auth/login` | Đăng nhập | `email, password` | `AuthResponse` |
| POST | `/api/auth/verify-token` | *(nội bộ)* Xác thực JWT cho các service khác gọi | `token` | `{ valid, userId, role }` |

---

### 9.2 profile-service (port 8082)

| Method | Endpoint | Mô tả | Request chính | Response chính |
|---|---|---|---|---|
| GET | `/health` | Health check | — | `{ status }` |
| GET | `/api/profile/mentor/{userId}` | Lấy profile mentor | — | `MentorProfile` |
| PUT | `/api/profile/mentor/{userId}` | Tạo/cập nhật profile mentor — tự động trigger sinh embedding | `skills, domain, bio, yearsExperience, cvFileUrl` | `MentorProfile` |
| GET | `/api/profile/mentee/{userId}` | Lấy profile mentee | — | `MenteeProfile` |
| PUT | `/api/profile/mentee/{userId}` | Tạo/cập nhật profile mentee — tự động trigger sinh embedding | `goal, domain, currentLevel, cvFileUrl` | `MenteeProfile` |
| POST | `/api/profile/mentee/{userId}/enrichment-chat` | Nhận kết quả tổng hợp từ chatbot enrichment (do Quang gọi từ mentoring-service), merge vào goal + re-embed | `enrichedGoalText` | `200 OK` |
| GET | `/internal/profile-summary/{userId}` | *(nội bộ)* Tóm tắt profile cho service khác, không lộ embedding thô | — | `ProfileSummary` (userId, displayName, role, domain) |

---

### 9.3 matching-service (port 8090)

| Method | Endpoint | Mô tả | Request chính | Response chính |
|---|---|---|---|---|
| GET | `/health` | Health check | — | `{ status }` |
| POST | `/internal/embed` | *(nội bộ)* Sinh embedding từ text, gọi bởi profile-service | `text` | `{ embedding: float[384] }` |
| GET | `/api/matching/mentors` | Tìm mentor phù hợp cho mentee — pipeline top-K → filter → re-rank | Query: `menteeId, limit` | `{ menteeId, mentors: RankedMentor[] }` |

`RankedMentor` gồm: `mentorId, displayName, domain, similarityScore,
finalScore, rating, yearsExperience`.

---

### 9.4 learning-service (port 8085)

| Method | Endpoint | Mô tả | Request chính | Response chính |
|---|---|---|---|---|
| GET | `/health` | Health check | — | `{ status }` |
| GET | `/api/learning/courses` | Danh sách khoá học | — | `Course[]` |
| GET | `/api/learning/courses/{courseId}/progress/{userId}` | Tiến độ học của 1 user trong 1 khoá | — | `Progress` (courseId, userId, percentComplete) |

---

### 9.5 mentoring-service (port 8083)

| Method | Endpoint | Mô tả | Request chính | Response chính |
|---|---|---|---|---|
| GET | `/health` | Health check | — | `{ status }` |
| POST | `/api/mentoring/sessions` | Tạo booking session sau khi đã match | `menteeId, mentorId, scheduledAt` | `Session` (id, menteeId, mentorId, scheduledAt, status) |
| POST | `/api/mentoring/mentee/{menteeId}/cv-upload` | Upload CV mentee, parse, khởi tạo chatbot enrichment | `multipart/form-data: file` | `200 OK` |
| *(dự kiến bổ sung)* | `/api/mentoring/mentor/{mentorId}/interview` | Khởi tạo/tiếp tục AI Interview cho mentor — **Thắng cần bổ sung contract chi tiết khi implement** (câu hỏi hiện tại, câu trả lời, trạng thái lượt) | — | — |

> Lưu ý: endpoint AI Interview chưa có trong `contracts/mentoring-service.yaml`
> gốc — vì chi tiết kỹ thuật (số lượt, format câu hỏi/câu trả lời) do
> Thắng tự thiết kế khi bắt tay implement, theo đúng nguyên tắc "người
> nhận tính năng AI tự deep dive cách làm". Cần cập nhật contract trước
> khi code, theo quy ước contract-first.

---

### 9.6 payment-service (port 8084)

| Method | Endpoint | Mô tả | Request chính | Response chính |
|---|---|---|---|---|
| GET | `/health` | Health check | — | `{ status }` |
| POST | `/api/payment/charge` | Tạo giao dịch thanh toán cho 1 session | `sessionId, amount` | `Transaction` (id, sessionId, amount, status) |

---

### 9.7 Sơ đồ gọi API giữa các service (tổng hợp)

```
frontend
  ├─> auth-service           (đăng ký/đăng nhập)
  ├─> profile-service        (career profile)
  │      └─> matching-service   [POST /internal/embed]
  ├─> learning-service        (learning hub)
  ├─> matching-service        (GET /api/matching/mentors)
  │      └─> đọc trực tiếp DB của profile-service (read-only, ngoại lệ đã duyệt)
  ├─> mentoring-service        (booking, AI interview, CV upload)
  │      └─> profile-service    [POST /api/profile/mentee/{id}/enrichment-chat]
  └─> payment-service          (thanh toán)
```
