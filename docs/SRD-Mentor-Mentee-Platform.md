# Software Requirements Document (SRD)
## Nền tảng học tập và kết nối Mentor-Mentee trong lĩnh vực lập trình

| | |
|---|---|
| **Nhóm thực hiện** | Phạm Ngọc Quang (B22DCDT243), Đinh Quyết Thắng (B22DCCN809), Phạm Ninh Phương Thảo (B22DCCN803) |
| **Lớp** | E22CNPM03 |
| **GVHD** | Đào Ngọc Phong |
| **Phiên bản** | 2.1 — theo bản chốt phạm vi và thông số 21/10/2026 + bổ sung phỏng vấn giọng nói 23/10/2026 ([ban-chot-nghiep-vu.md](ban-chot-nghiep-vu.md)) |
| **Ngày** | 23/10/2026 |

### Lịch sử phiên bản

| Phiên bản | Ngày | Nội dung |
|---|---|---|
| 0.1 | 2026 | Bản đầu: Auth, Profile, Learning Hub, AI Matching, Mentoring, Payment |
| 0.2 | 31/07/2026 | Bổ sung AI Interview, CV Parsing + Chatbot enrichment, quy trình nghiệp vụ chi tiết (lưu tại `archive/SRD-Mentor-Mentee-Platform-v0.2.md`) |
| 1.0 | 16/09/2026 | Chốt yêu cầu theo bản hiện thực: bổ sung các quyết định thiết kế (mục 2.4), hoàn thiện đặc tả API (mục 9), đánh dấu tiêu chí nghiệm thu đã đạt (mục 6), thống nhất phân công giữa SRD và `CONVENTIONS.md` |
| 1.1 | 17/09/2026 | Tách phần AI hội thoại (AI Interview, CV Parsing, Chatbot enrichment) thành **ai-service** (Python/FastAPI); đổi nhà cung cấp LLM sang **DeepSeek API** (quyết định D4, D12) |
| **1.2** | 20/09/2026 | Chuyển **toàn bộ** AI Interview và CV Parsing + Chatbot enrichment (luồng nghiệp vụ + dữ liệu) từ mentoring-service (Java) sang ai-service (Python); ai-service có CSDL riêng `ai_db` và API công khai `/api/ai/**` (cập nhật quyết định D12) |
| **1.3** | 06/10/2026 | `R-1`: chuyển quyền sở hữu chỉ mục embedding từ profile-service sang matching-service, CSDL riêng `matching_db` (cổng 5439), đồng bộ best-effort + `IndexSyncJob`; tiêu chí DoD 2 chuyển sang nhất quán cuối cùng (quyết định D8 *quyền sở hữu embedding*; chi tiết [adr.md](adr.md)) |
| **2.0** | 21/10/2026 | Chốt lại phạm vi và thông số vận hành theo bản chốt của nhóm: thanh toán **qua ví VND** (nạp bằng cổng thử nghiệm, tạm giữ khi đặt lịch, hoàn tiền theo nguồn, hạn dùng số dư), **cấp độ mentor Junior/Senior/Expert + khung giá**, **buổi trải nghiệm 15 phút có phí**, **phòng học video trong hệ thống** (xác định vắng mặt bằng nhật ký vào phòng), chính sách huỷ 3 bậc, giới thiệu theo cặp mentor và thưởng bằng tiền khuyến mãi. Mục mới ghi trạng thái **⚒ kế hoạch** đến khi hiện thực xong (D13–D20, FR-5.8+, FR-6.7+, mục 3.9) |
| **2.1** | 23/10/2026 | **Phỏng vấn bằng giọng nói** (OpenAI Realtime qua WebRTC, chấm bằng engine hiện có): mentor chọn chat hoặc giọng nói cho phỏng vấn xác thực (FR-7.7); module mới **Luyện phỏng vấn với AI** cho mentee — 1 lượt miễn phí trọn đời, kết quả + báo cáo nói hiển thị ngay (mục 3.10, FR-10.1–10.7); quyết định D21 (speech-to-speech thay vì STT→LLM→TTS); bảng `practice_interviews`, cột `interviews.mode` (migration ai `010_voice_interviews.sql`). Trạng thái **⚒** đến khi hiện thực và kiểm thử xong |

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
gửi yêu cầu và đặt lịch mentoring, thanh toán học phí **qua ví VND trên nền tảng** (nạp ví bằng cổng thử nghiệm, học phí
được tạm giữ khi đặt lịch và chia cho mentor/nền tảng sau khi buổi hoàn thành), học trực tuyến trong phòng học của hệ thống, đánh giá sau buổi học.
Học phí theo **cấp độ mentor** (Junior/Senior/Expert, do admin duyệt sau phỏng vấn AI) và có **buổi trải nghiệm 15 phút có phí**.
Hệ thống cung cấp Learning Hub (khoá học, tài liệu, roadmap) và cơ chế giới thiệu người học theo từng mentor.
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
- Mentoring workflow (gửi yêu cầu, chấp nhận, đặt lịch, nhắc lịch, đánh giá, lịch sử, buổi trải nghiệm 15 phút có phí)
- Cấp độ mentor + khung học phí (v2.0)
- Ví VND: nạp bằng cổng thử nghiệm (sandbox/MoMo test/VNPay sandbox), tạm giữ, hoàn tiền, hạn dùng số dư, hoa hồng, thu nhập mentor (v2.0)
- Phòng học video + chat trong hệ thống (Jitsi Meet tự host) và nhật ký tham dự (v2.0)
- Referral theo cặp mentor, thưởng bằng tiền khuyến mãi, có chống gian lận cơ bản (v2.0)
- Phỏng vấn bằng giọng nói: mentor chọn chế độ giọng nói cho AI Interview; mentee luyện phỏng vấn với AI (1 lượt miễn phí, có báo cáo nói) (v2.1 ⚒)

**Ngoài phạm vi đồ án (định hướng mở rộng):**
- Chatbot trợ lý học tập độc lập, đa mục đích
- Chatbot A2A hỗ trợ đăng ký/thanh toán qua giao diện chat
- Rút tiền tự do của người học, xác minh danh tính (KYC), chống gian lận chuyên sâu
- Hoa hồng thay đổi theo số buổi giữa một cặp, gói đăng ký định kỳ / gói combo buổi
- Lớp học nhóm, ứng dụng di động
- Ghi âm/ghi hình buổi phỏng vấn giọng nói và phát lại cho admin; phân tích âm thanh chuyên sâu (ngữ điệu, phát âm) — v2.1 chỉ có báo cáo nói tính từ bản chép lời
- Luyện phỏng vấn với AI có phí (ngoài lượt miễn phí), đánh giá chất lượng tiếng Việt của OpenAI Realtime so với ElevenLabs (câu hỏi mở)
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
| Speech-to-speech (Realtime) | Model nghe giọng nói và trả lời bằng giọng nói trực tiếp (OpenAI Realtime), không qua chuỗi STT → LLM → TTS |
| Client secret | Khoá tạm thời, ngắn hạn do ai-service xin từ OpenAI cho một phiên giọng nói; API key thật không bao giờ tới trình duyệt |
| Luyện phỏng vấn với AI | Buổi phỏng vấn giọng nói mô phỏng nhà tuyển dụng để mentee luyện nói (FR-10.x), không liên quan xác thực mentor |
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
Từ v2.1 có thêm phụ thuộc tuỳ chọn **OpenAI Realtime** cho phỏng vấn giọng nói (`OPENAI_API_KEY`); trống thì chế độ giọng nói
bị tắt (production trả 503 `VOICE_UNAVAILABLE`), mọi tính năng khác không đổi.

### 2.2 Đối tượng người dùng
- **Mentee**: sinh viên/người đi làm muốn học lập trình có định hướng, cần mentor.
- **Mentor**: người có kinh nghiệm, nhận mentee, mở lịch, thu phí (tuỳ chọn), phải vượt qua AI
  Interview và được admin duyệt trước khi được kích hoạt.
- **Admin**: quản trị người dùng, nội dung Learning Hub, giám sát giao dịch/referral, duyệt kết
  quả AI Interview.

### 2.3 Giả định và ràng buộc
- Dữ liệu ban đầu (mentor mẫu, nội dung Learning Hub) được seed bằng script
  (`db/init/learning-service.sql`, `scripts/seed_demo.py`).
- Nạp ví dùng cổng thử nghiệm (sandbox / MoMo test / VNPay sandbox), không xử lý tiền thật; học phí luôn trả từ ví.
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
| D7 | Tái sử dụng embedding (NFR-7) | matching-service lưu SHA-256 của văn bản chuẩn hoá cạnh mỗi vector; chỉ gọi model khi hash thay đổi | Tránh tính lại khi hồ sơ không đổi nội dung |
| D8 *(quyền sở hữu embedding)* | Quyền sở hữu embedding | Toàn bộ chỉ mục embedding thuộc matching-service (`matching_db`); profile-service chỉ báo "hồ sơ vừa đổi" và không chờ kết quả | Mỗi service sở hữu đúng phần việc của mình: đổi model/format văn bản không đụng tới profile-service, và lưu hồ sơ không bao giờ bị chặn bởi matching-service. Bối cảnh, hệ quả, phương án khác: [adr.md](adr.md) ADR-03 |
| D8 *(đặt lịch)* | Mentee đặt lịch | Phải có yêu cầu mentoring được chấp nhận; phiên nằm trọn trong khung lịch rảnh; khoá advisory theo mentor khi tạo phiên | Đúng FR-5.4 và tránh đặt trùng khi có yêu cầu đồng thời |
| D9 | Giữ chỗ khi ví không đủ tiền *(v2.0)* | Giữ khung giờ **15 phút** để mentee nạp thêm; hết hạn thì nhả khung giờ *(trước đây: phiên chưa thanh toán tự huỷ sau 30 phút)* | Giải phóng khung giờ bị giữ chỗ |
| D10 | Referral hợp lệ *(v2.0)* | Mã gắn với **cặp (người giới thiệu, mentor M)**; người được giới thiệu chưa từng học với M dùng mã ở yêu cầu đặt buổi thường đầu tiên với M (không giảm giá); thưởng **30.000đ tiền khuyến mãi** sau khi buổi hoàn thành, đã thanh toán và qua 7 ngày không bị hoàn tiền; tối đa 5 lượt thưởng/tháng/người | Chống gian lận cơ bản (FR-6.6) |
| D11 | Frontend gọi backend | Route handler Next.js làm proxy `/api/<service>/**` | Cùng origin (không cần CORS), không bao giờ expose `/internal/*` |
| D12 | Vị trí mã nguồn AI hội thoại | Service riêng **ai-service** (Python/FastAPI) sở hữu **trọn vẹn** engine, luồng nghiệp vụ và dữ liệu (CSDL riêng `ai_db`, API `/api/ai/**`); không service Java nào còn logic AI *(v1.2 — trước đó luồng & dữ liệu nằm ở mentoring-service)* | Hệ sinh thái AI chủ yếu ở Python; gom cả luồng về Python bỏ được vòng gọi HTTP hai chiều và việc gửi kèm toàn bộ lịch sử hội thoại mỗi lượt; đổi model/prompt/lược đồ dữ liệu không đụng tới code Java; AI Interview và CV enrichment dùng chung client LLM & cơ chế fallback |
| D13 *(v2.0)* | Kênh trả học phí | **Ví VND là kênh duy nhất**; cổng sandbox/MoMo/VNPay chỉ để nạp ví. Số dư = tổng các bút toán (không có cột số dư sửa trực tiếp); mỗi thao tác tiền có khoá idempotency | Một mô hình tiền duy nhất, dễ đối soát và kiểm thử; hoàn tiền/tạm giữ không phụ thuộc cổng |
| D14 *(v2.0)* | Loại tiền trong ví | **Tiền nạp** (tiền thật) và **tiền khuyến mãi** (thưởng giới thiệu, admin cấp). Trả học phí trừ khuyến mãi trước; hoàn tiền buổi học về đúng nguồn đã trừ; tiền khuyến mãi không hoàn ra nguồn nạp | Đúng bản chốt "tiền khuyến mãi chỉ dùng trong nền tảng" |
| D15 *(v2.0)* | Thời hạn số dư | Tiền khuyến mãi hết hạn sau 12 tháng kể từ lúc cấp (dùng khoản sắp hết trước). Tiền nạp không bị tịch thu: ví không phát sinh giao dịch 12 tháng → "ngủ", người dùng tự kích hoạt lại. Nhắc trước 30 và 7 ngày | Có thời hạn mà không chiếm tiền thật của người học |
| D16 *(v2.0)* | Hoàn tiền nạp về nguồn | Chỉ tiền nạp, trong 7 ngày từ lần nạp gần nhất, tối đa = min(tiền nạp khả dụng, tiền nạp trong 7 ngày); tối đa 2 yêu cầu/tháng; ngoài ra do admin xử lý | Đúng bản chốt; chặn dùng ví như tài khoản rút tiền |
| D17 *(v2.0)* | Cấp độ & giá | Cấp Junior/Senior/Expert do admin duyệt từ điểm phỏng vấn (60/75/88); giá trong khung 100–200k / 200–400k / 400–700k, bước 10.000đ; giá chốt lúc gửi yêu cầu đặt; đổi cấp thì giá được kẹp về khung mới, buổi đã đặt không đổi | Đúng bản chốt "khung giá theo năng lực" |
| D18 *(v2.0)* | Phòng học & vắng mặt | Jitsi Meet tự host, JWT do mentoring-service cấp; nhật ký vào phòng là căn cứ duy nhất xác định vắng mặt (chờ 10 phút; trải nghiệm 5 phút); tự hoàn thành sau 24 giờ | Quy tắc vắng mặt kiểm chứng được, không dựa lời hai bên |
| D19 *(v2.0)* | Huỷ buổi | Mentee huỷ ≥24h hoàn 100%, 4–24h hoàn 50%, <4h hoặc vắng hoàn 0%; mentor huỷ/vắng hoàn 100% + 1 lỗi vi phạm; bỏ điểm xin lỗi và cơ chế buổi miễn phí | Đúng bản chốt "chính sách huỷ" |
| D20 *(v2.0)* | Hoa hồng & thu nhập | Hoa hồng 15% một mức (kể cả buổi trải nghiệm); thu nhập mentor chờ 72 giờ; khiếu nại giữ thu nhập đến khi admin kết luận | Đúng bản chốt; một mức duy nhất để đơn giản hoá kế toán |
| D21 *(v2.1)* | Công nghệ phỏng vấn giọng nói | **Speech-to-speech — OpenAI Realtime** (`gpt-realtime`, giọng `marin`) qua WebRTC trực tiếp từ trình duyệt, ai-service chỉ cấp client secret ngắn hạn; **không** dùng chuỗi STT → LLM → TTS (ví dụ ElevenLabs). Model chỉ điều khiển cuộc hỏi (tool `begin_topic`, `end_interview`); chấm điểm vẫn do engine hiện có (DeepSeek / rule-based) trên bản chép lời | Độ trễ mỗi lượt thấp hơn, ngắt lời tự nhiên, model nghe được ngập ngừng/tốc độ nói, chỉ một kết nối từ trình duyệt thay vì một pipeline phía server qua 3 nhà cung cấp. **Đánh đổi**: phụ thuộc một nhà cung cấp, âm thanh được xử lý ở nhà cung cấp tại Mỹ (cần đồng ý rõ ràng), chi phí tính theo phút. Bộ chấm chỉ cần danh sách bản chép lời nên có thể thay Realtime bằng stack nối tầng (ElevenLabs Agents hoặc LiveKit/Pipecat) về sau mà không đụng phần chấm điểm |

---

## 3. Yêu cầu chức năng

Cột **Trạng thái**: ✅ đã hiện thực và được kiểm thử (xem [testing-report.md](testing-report.md)); ⚒ đang hiện thực (chưa nghiệm thu).

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
| FR-2.5 | Sinh embedding hồ sơ | Hồ sơ thay đổi → profile-service báo matching-service lập lại chỉ mục (không chờ kết quả); `IndexSyncJob` đối soát định kỳ nên chỉ mục tự hội tụ kể cả khi thông báo bị mất | ✅ |

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
| FR-4.1 | Sinh embedding | matching-service chuẩn hoá văn bản hồ sơ rồi sinh vector bằng sentence-transformers `all-MiniLM-L6-v2` (384 chiều), lưu vào `matching_db` | ✅ |
| FR-4.2 | Lưu trữ vector | Cột `VECTOR(384)` (pgvector) + chỉ mục HNSW cosine | ✅ |
| FR-4.3 | Truy vấn Top-K | K = max(50, 5×limit) mentor gần nhất theo cosine distance | ✅ |
| FR-4.4 | Lọc ràng buộc cứng | Loại mentor chưa được duyệt, tạm ngưng nhận mentee, chưa có lịch rảnh, đầy sức chứa, khác lĩnh vực | ✅ |
| FR-4.5 | Xếp hạng kết quả | `final = 0.6·similarity + 0.15·rating/5 + 0.1·min(years/10, 1) + 0.1·scheduleFit + 0.05·responsiveness` (US-35; mentor < 3 đánh giá dùng trung vị rating nền tảng) | ✅ |
| FR-4.6 | Giải thích gợi ý | Kỹ năng trùng, chuyên môn khớp mục tiêu, cùng lĩnh vực, mức tương đồng, đánh giá, kinh nghiệm + thống kê pipeline | ✅ |

### 3.5 Module: Mentoring Workflow (mentoring-service)

| ID | Yêu cầu | Mô tả | Trạng thái |
|---|---|---|---|
| FR-5.1 | Xem danh sách mentor đề xuất | Kèm điểm phù hợp và lý do | ✅ |
| FR-5.2 | Gửi yêu cầu mentoring | Tới mentor đã được xác thực, không trùng yêu cầu đang hoạt động | ✅ |
| FR-5.3 | Mentor phản hồi yêu cầu | Chấp nhận (khi còn sức chứa) / từ chối kèm lời nhắn | ✅ |
| FR-5.4 | Đặt lịch phiên mentoring | Trong lịch rảnh của mentor, không trùng lịch, đặt trước ≥ 3 giờ, giá lấy theo giá mentor đang đặt (buổi 60 phút); học phí **tạm giữ từ ví** (D9, D13); giao diện chỉ cho chọn khung giờ còn trống | ✅ |
| FR-5.5 | Nhắc lịch/thông báo | Thông báo trong ứng dụng + email; nhắc lịch trước **24 giờ và 15 phút**, nhắc lại khi dời/huỷ lịch | ✅ |
| FR-5.6 | Đánh giá sau phiên | Rating 1–5 + nhận xét, 1 lần/phiên, cập nhật rating mentor | ✅ |
| FR-5.7 | Lịch sử mentoring | Danh sách phiên theo trạng thái | ✅ |
| FR-5.8 | Buổi trải nghiệm | 15 phút, phí cố định 30.000đ, mỗi cặp 1 lần, trả từ ví, hoa hồng như buổi thường, không chấm sao (D20) | ✅ |
| FR-5.9 | Phòng học trực tuyến | Phòng video + chat trong hệ thống (Jitsi, JWT); chỉ người tham gia hợp lệ vào được, rớt mạng vào lại được | ✅ (hai bên vào cùng phòng đã kiểm trên trình duyệt 22/10) |
| FR-5.10 | Tham dự & vắng mặt | Nhật ký vào phòng; chờ 10 phút (trải nghiệm 5 phút) rồi báo vắng; tự hoàn thành sau 24 giờ; hai bên báo ngược nhau → tranh chấp (D18) | ✅ |
| FR-5.11 | Chính sách huỷ | Ba bậc theo thời điểm (D19); mentor huỷ/vắng hoàn 100% + lỗi vi phạm, 3 lỗi/30 ngày → PAUSED; mentee huỷ trước khi mentor xác nhận → 100% | ✅ |
| FR-5.12 | Chặn liên hệ ngoài nền tảng | Tin nhắn luôn che số điện thoại, email, mạng xã hội, đường dẫn ngoài; 3 vi phạm/30 ngày báo admin | ✅ |

### 3.6 Module: Ví, thanh toán & Referral (payment-service)

| ID | Yêu cầu | Mô tả | Trạng thái |
|---|---|---|---|
| FR-6.1 | Nạp ví | Qua cổng sandbox/MoMo test/VNPay sandbox; 50.000đ–5.000.000đ/lần, trần tiền nạp khả dụng 20.000.000đ; giao dịch lỗi/trùng IPN không đổi số dư (D13) | ✅ |
| FR-6.2 | Tạm giữ & xác nhận | Đặt lịch tạm giữ học phí từ ví (khuyến mãi trước, D14); phiên CONFIRMED khi mentor xác nhận; có job đối soát | ✅ |
| FR-6.3 | Trạng thái & hoàn tiền buổi học | Hoàn theo chính sách huỷ (D19) về đúng nguồn đã trừ; mỗi lần hoàn là một dòng, tổng ≤ số đã trả | ✅ |
| FR-6.4 | Mã giới thiệu | Mã riêng cho từng cặp (người giới thiệu, mentor) — chỉ cấp khi đã hoàn thành ≥ 1 buổi thường đã trả tiền với mentor đó | ✅ |
| FR-6.5 | Ghi nhận referral | Người mới dùng mã ở yêu cầu đặt buổi thường đầu tiên với mentor đó; không áp dụng cho tự giới thiệu, người đã học với mentor, mã sai | ✅ |
| FR-6.6 | Thưởng referral | 30.000đ **tiền khuyến mãi**, sau 7 ngày kể từ khi buổi hoàn thành mà không bị hoàn tiền; tối đa 5 lượt/tháng; bất thường chuyển admin (D10) | ✅ |
| FR-6.7 | Hoàn tiền nạp | Theo D16 (7 ngày, min(...), tối đa 2 yêu cầu/tháng); admin xử lý ngoại lệ có lý do | ✅ |
| FR-6.8 | Hạn dùng số dư | Khuyến mãi hết hạn 12 tháng; ví "ngủ" sau 12 tháng không giao dịch; nhắc 30 và 7 ngày (D15) | ✅ |
| FR-6.9 | Hoa hồng & thu nhập mentor | 15%; chờ 72 giờ; khiếu nại giữ thu nhập; yêu cầu nhận tiền ≥ 200.000đ, cần tài khoản ngân hàng, admin xác nhận (D20) | ✅ |
| FR-6.10 | Đóng băng ví | Admin khoá tài khoản → huỷ buổi chưa diễn ra, hoàn 100%, đóng băng ví đến khi mở khoá | ✅ |

### 3.7 Module: AI Interview (ai-service `app/interview`)

| ID | Yêu cầu | Mô tả | Trạng thái |
|---|---|---|---|
| FR-7.1 | Khởi tạo phỏng vấn | Mentor đã có hồ sơ bắt đầu phỏng vấn; tiếp tục được nếu bị gián đoạn | ✅ |
| FR-7.2 | Hỏi đáp nhiều lượt thích ứng | Mỗi câu trả lời được chấm; câu tiếp theo **DEEPEN** (đào sâu) hoặc **PIVOT** (chuyển chủ đề) theo lĩnh vực và câu trả lời | ✅ |
| FR-7.3 | Giới hạn số lượt | 5 lượt (quyết định D2) | ✅ |
| FR-7.4 | Tổng hợp đánh giá | Điểm 0–100, tóm tắt, điểm mạnh, điểm yếu, khuyến nghị APPROVE/REJECT/NEEDS_REVIEW | ✅ |
| FR-7.5 | Admin review | Admin đọc toàn bộ hội thoại, duyệt hoặc từ chối kèm nhận xét; mentor bị từ chối được phỏng vấn lại | ✅ |
| FR-7.6 | Đề xuất cấp độ | Từ điểm 0–100: <60 không đạt, 60–74 Junior, 75–87 Senior, ≥88 Expert; admin chọn cấp khác đề xuất hoặc từ chối, bắt buộc ghi lý do; gián đoạn tiếp tục trong 24 giờ; làm lại sau 7 ngày, tối đa 3 lượt; mentor đã duyệt xin nâng cấp sau 90 ngày (không tính vào 3 lượt, chỉ lên cấp cao hơn, không đạt thì giữ cấp cũ và vẫn nhận mentee) | ✅ |
| FR-7.7 | Phỏng vấn bằng giọng nói | Trên `/interview` mentor chọn **chat** (như cũ) hoặc **giọng nói**. Cùng quy tắc: 3 lượt, chờ 7 ngày, xin nâng cấp sau 90 ngày (`kind = UPGRADE`), admin duyệt; riêng "tiếp tục trong 24 giờ" không áp dụng — buổi giọng nói là một lần ngồi. Bắt buộc tick đồng ý âm thanh được OpenAI xử lý (400 `VOICE_CONSENT_REQUIRED`, lưu `consent_external_ai`). `POST /api/ai/interviews/voice` tạo buổi `mode = VOICE` (`max_turns` = số chủ đề, mặc định 4) và trả client secret; gọi lại khi buổi đang làm < 30 phút → cùng buổi, client secret mới (nối lại khi rớt cuộc gọi); > 30 phút chưa có bản chép lời → ABANDONED (tính một lượt). Hết buổi trình duyệt gửi bản chép lời (`POST /api/ai/interviews/{id}/voice-transcript`) → gộp theo chủ đề thành `interview_turns`, chấm bằng engine + rubric hiện có, rồi đi đúng luồng hoàn thành của chat (PENDING_REVIEW, đồng bộ xác thực, thông báo). Mentor chỉ xem nhận xét từng câu sau khi admin quyết định; trang admin có nhãn "Giọng nói". Không ghi âm (để bản sau) | ⚒ |

### 3.8 Module: CV Parsing + Chatbot Enrichment (ai-service `app/cv`, `app/enrichment`)

| ID | Yêu cầu | Mô tả | Trạng thái |
|---|---|---|---|
| FR-8.1 | Upload CV | PDF ≤ 5MB, ≤ 10 trang; mentee (kèm chatbot) và mentor (điền nhanh hồ sơ) | ✅ |
| FR-8.2 | Parse CV | Trích xuất vai trò, kỹ năng, số năm kinh nghiệm, dự án (kèm công nghệ), học vấn | ✅ |
| FR-8.3 | Chatbot hỏi thêm | Câu hỏi dựa trên CV, không hỏi lại thông tin đã có trong CV hoặc đã được trả lời | ✅ |
| FR-8.4 | Tổng hợp goal | Sau 4 lượt tổng hợp thành đoạn mục tiêu chuẩn hoá | ✅ |
| FR-8.5 | Kích hoạt re-embedding | Gửi sang profile-service cập nhật goal và gộp kỹ năng từ CV; matching-service lập lại chỉ mục vì văn bản chuẩn hoá đã đổi | ✅ |
| FR-8.6 | Quyền riêng tư CV | Chỉ chủ CV, admin và mentor có yêu cầu mentoring `PENDING`/`ACCEPTED` với chủ CV tải được file (kiểm tra qua mentoring-service, lỗi ⇒ từ chối); chủ CV xem danh sách và **xoá** CV của mình (xoá hội thoại, bản ghi, file, gỡ liên kết trong hồ sơ). Chi tiết: [cv-data-policy.md](cv-data-policy.md) | ✅ (API) |

---

### 3.9 Module: Cấp độ mentor & khung học phí (profile-service, ai-service) — v2.0

| ID | Yêu cầu | Mô tả | Trạng thái |
|---|---|---|---|
| FR-9.1 | Cấp độ mentor | `tier` ∈ {JUNIOR, SENIOR, EXPERT} gán lúc admin duyệt; số năm kinh nghiệm chỉ để hiển thị | ✅ |
| FR-9.2 | Khung giá | JUNIOR 100–200k, SENIOR 200–400k, EXPERT 400–700k mỗi buổi 60 phút (cấu hình được; là giả định, khảo sát trước khi chốt) | ✅ |
| FR-9.3 | Chọn giá | Mentor chọn giá trong khung, bước 10.000đ, đổi lúc nào cũng được nhưng chỉ áp cho yêu cầu đặt mới | ✅ |
| FR-9.4 | Đổi cấp độ | Giá nằm ngoài khung mới thì tự kẹp về biên gần nhất và báo mentor; buổi đã đặt giữ giá | ✅ |
| FR-9.5 | Đổi mentor | Huỷ buổi cũ theo chính sách huỷ, đặt buổi mới theo giá mentor mới, không bù chênh lệch | ✅ |

Bộ lọc "miễn phí" trong đề xuất mentor bị gỡ (không còn buổi miễn phí).

### 3.10 Module: Luyện phỏng vấn với AI (ai-service) — v2.1

Mentee luyện **nói** trong một buổi phỏng vấn mô phỏng bằng giọng nói. Khác hẳn phỏng vấn xác thực mentor (FR-7.x): không
xếp cấp, không có admin duyệt, kết quả trả ngay cho mentee. Quy tắc chi tiết: [ban-chot-nghiep-vu.md](ban-chot-nghiep-vu.md) §16.

| ID | Yêu cầu | Mô tả | Trạng thái |
|---|---|---|---|
| FR-10.1 | Lượt miễn phí | Mỗi mentee **1 lượt miễn phí trọn đời** (`PRACTICE_FREE_LIMIT = 1`); lượt bị dùng khi buổi `COMPLETED` hoặc `ABANDONED`. `GET /api/ai/practice-interviews/eligibility` → `{freeLimit, used, canStart, reason, inProgressId}`; hết lượt → 409 `PRACTICE_FREE_USED` kèm lời mời "Đặt phỏng vấn thử với mentor". Luyện có phí ngoài lượt miễn phí: ngoài phạm vi | ⚒ |
| FR-10.2 | Khởi tạo buổi luyện | Mentee chọn loại phỏng vấn (BACKEND, FRONTEND, SYSTEM_DESIGN, BEHAVIORAL), cấp độ (INTERN, FRESHER, JUNIOR), vị trí ứng tuyển (2–120 ký tự), công ty (tuỳ chọn, ≤ 120) và tick đồng ý âm thanh được OpenAI xử lý (400 `VOICE_CONSENT_REQUIRED`). `POST /api/ai/practice-interviews` chọn chủ đề từ ngân hàng `practice_bank` theo loại × cấp và trả client secret | ⚒ |
| FR-10.3 | Phỏng vấn bằng giọng nói | AI đóng vai **người phỏng vấn tuyển dụng** cho vị trí và cấp độ mentee chọn; đánh dấu chủ đề bằng tool `begin_topic`, kết thúc bằng `end_interview`; câu BEHAVIORAL hỏi theo STAR. Tối đa một buổi IN_PROGRESS mỗi mentee; buổi < 30 phút được tiếp tục (cùng buổi, client secret mới), quá 30 phút → ABANDONED (tính là đã dùng lượt miễn phí) | ⚒ |
| FR-10.4 | Chấm điểm | Rubric riêng, mỗi tiêu chí 0–10: kỹ thuật 35% · giải quyết vấn đề & chiều sâu 25% · diễn đạt rõ ràng 25% · cấu trúc (STAR hoặc cách tiếp cận) 15%. DeepSeek (prompt `practice-v1`) khi có `DEEPSEEK_API_KEY`, ngược lại rule-based theo khái niệm kỳ vọng của từng chủ đề; cùng cơ chế chống prompt injection như phỏng vấn mentor | ⚒ |
| FR-10.5 | Kết quả trả ngay | `POST /api/ai/practice-interviews/{id}/complete` (chủ buổi, buổi IN_PROGRESS) trả ngay: nhận xét từng câu, 3 điểm mạnh, 3 điểm cần cải thiện (hiển thị như danh sách việc cần làm, chỉ là văn bản), điểm tổng 0–100. 400 `EMPTY_TRANSCRIPT` nếu chưa hỏi chủ đề nào | ⚒ |
| FR-10.6 | Báo cáo nói | Số từ đệm ("ừm", "à", "ờ", "uh", "um", "kiểu như", "thì là"), số từ trung bình mỗi câu trả lời, số câu trả lời dưới 20 từ — tính từ bản chép lời, không phân tích âm thanh | ⚒ |
| FR-10.7 | Lịch sử & bước tiếp theo | `GET /api/ai/practice-interviews/me` (mới nhất trước), `GET /api/ai/practice-interviews/{id}` (chủ buổi hoặc admin); trang kết quả có nút "Đặt phỏng vấn thử với mentor" dẫn tới luồng phỏng vấn thử với mentor đã có (US-58) | ⚒ |

Quy tắc chung của chế độ giọng nói (FR-7.7, FR-10.x): `OPENAI_API_KEY` trống → ở production (`APP_ENV=prod`) endpoint bắt đầu
trả 503 `VOICE_UNAVAILABLE` và không tạo gì; ngoài production vẫn tạo buổi và trả `voice: null` để kiểm thử gửi bản chép lời
tổng hợp, giao diện hiện "Phỏng vấn giọng nói chưa được bật".

---

## 4. Yêu cầu phi chức năng

| ID | Loại | Yêu cầu | Cách đáp ứng | Kết quả đo |
|---|---|---|---|---|
| NFR-1 | Hiệu năng | Top-K matching < 2 giây với vài nghìn profile | Tính khoảng cách ngay trong PostgreSQL (pgvector + HNSW), vector mentee lấy bằng subquery | ~5.000 mentor: p95 **5,7 ms**, max 6,8 ms |
| NFR-2 | Bảo mật | Hash mật khẩu, JWT có hạn, phân quyền theo role | BCrypt; access token 30 phút; refresh token lưu dạng SHA-256, xoay vòng, phát hiện tái sử dụng; chặn brute-force (Redis); `@PreAuthorize`; internal token cho `/internal/*` | `AuthServiceTest` (9 test) và nhóm kiểm tra DoD 1 trong e2e đều pass |
| NFR-3 | Khả năng mở rộng | Microservices, triển khai độc lập qua Docker | 7 service + 7 CSDL riêng, mỗi service 1 Dockerfile; trạng thái của matching-service (chỉ mục embedding) nằm trong `matching_db`, tiến trình không giữ trạng thái nên chạy được nhiều bản | — |
| NFR-4 | Khả dụng | Chạy ổn định bằng Docker Compose | Healthcheck mọi service, `depends_on` theo trạng thái healthy, job retry/đối soát | `docker compose up` → 7/7 service healthy |
| NFR-5 | Khả năng bảo trì | Tổ chức module rõ ràng, có test | Kiến trúc phân lớp controller/service/repository; 156 unit test + 66 kiểm tra e2e; CI GitHub Actions | 156/156 unit test pass, 66/66 e2e PASS (06/10/2026) |
| NFR-6 | Minh bạch AI | Kết quả matching giải thích được | Danh sách lý do + kỹ năng trùng + thống kê mentor bị loại theo từng ràng buộc + trọng số | — |
| NFR-7 | Tái sử dụng dữ liệu | Không tính lại embedding nếu profile không đổi | Hash SHA-256 văn bản chuẩn hoá trong `matching_db` (D7) | Kiểm thử e2e: lưu lại hồ sơ không đổi → lập chỉ mục trả `UNCHANGED` |
| NFR-8 | Độ tin cậy AI Interview | Luôn có bước con người xác nhận | Trạng thái PENDING_REVIEW bắt buộc; matching chỉ lấy mentor APPROVED; prompt chống prompt-injection | Kiểm thử e2e: mentor chờ duyệt không xuất hiện trong matching |

---

## 5. Kiến trúc & công nghệ

Chi tiết: [architecture.md](architecture.md).

### 5.1 Kiến trúc tổng quan
Microservices, giao tiếp REST đồng bộ, contract-first (`contracts/*.yaml`, OpenAPI 3.0). Frontend
Next.js đóng vai trò cổng vào duy nhất của trình duyệt (proxy `/api/**`). Tác vụ nền chạy bằng
`@Scheduled` trong từng service Java (nhắc lịch, huỷ phiên quá hạn, đối soát thanh toán) và bằng
asyncio task trong service Python (`IndexSyncJob` đồng bộ chỉ mục embedding, job đồng bộ goal).

| Service | Port | Người phụ trách | Chức năng chính | Tính năng AI gắn kèm |
|---|---|---|---|---|
| auth-service | 8081 | Quang | Tài khoản, JWT, RBAC | — |
| learning-service | 8085 | Quang | Learning Hub | — |
| profile-service | 8082 | Thảo | Career profile, lịch rảnh | — (không giữ dữ liệu AI) |
| matching-service | 8090 | Thảo | AI Matching + chỉ mục embedding (`matching_db`) | **AI Matching** (Thảo) |
| mentoring-service | 8083 | Thắng | Yêu cầu, lịch, đánh giá, thông báo | — |
| payment-service | 8084 | Thắng | Thanh toán sandbox, referral | — |
| ai-service | 8091 | Thắng (`app/interview`), Quang (`app/cv`, `app/enrichment`) | AI hội thoại: engine + luồng nghiệp vụ + dữ liệu (`ai_db`) | **AI Interview** (Thắng); **CV Parsing + Chatbot enrichment** (Quang) |

### 5.2 Công nghệ sử dụng

| Thành phần | Công nghệ |
|---|---|
| Frontend | Next.js 14 (App Router), React 18 |
| Backend (5 service) | Java 21, Spring Boot 3.3 (Web, Security, Data JPA, Validation, Actuator) |
| Backend (matching-service, ai-service) | Python 3.11, FastAPI, Pydantic, asyncpg; httpx + pypdf + PyJWT (ai-service) |
| Cơ sở dữ liệu | PostgreSQL 16 (1 DB riêng/service) |
| Vector Database | pgvector (HNSW, cosine) trong `matching_db` — CSDL riêng của matching-service (image `pgvector/pgvector:pg16`) |
| Embedding model | sentence-transformers `all-MiniLM-L6-v2` (384 chiều) |
| LLM (tuỳ chọn) | DeepSeek API (định dạng OpenAI, JSON Output mode), mặc định model `deepseek-flash` |
| Giọng nói (tuỳ chọn, v2.1) | OpenAI Realtime (`gpt-realtime`, giọng `marin`, chép lời `gpt-4o-transcribe`) qua WebRTC từ trình duyệt (D21) |
| Xử lý PDF | pypdf (ai-service) |
| Xác thực | JJWT (HS256), BCrypt, PyJWT |
| Cache/Rate limit | Redis 7 (đếm số lần đăng nhập sai) |
| Hạ tầng | Docker, Docker Compose |
| CI/CD | GitHub Actions (build + unit test theo matrix, e2e bằng docker compose) |
| Thanh toán | Cổng sandbox tự xây dựng (giao diện `PaymentGateway` để thay bằng cổng thật) |

### 5.3 Ngoại lệ kiến trúc đã duyệt
`matching-service` đọc TRỰC TIẾP (read-only) các bảng `mentor_profiles`, `mentee_profiles`,
`mentor_availability` trong DB của `profile-service` bằng role PostgreSQL `matching_reader` chỉ có
quyền `SELECT` — để (a) lấy văn bản nguồn cho embedding mà profile-service không cần biết format văn
bản, và (b) lấy dữ kiện lọc/xếp hạng của K ứng viên bằng một truy vấn thay vì gọi HTTP cho từng mentor.
Vector nằm ở `matching_db` của chính matching-service. Mọi thao tác ghi vào các bảng hồ sơ chỉ do
`profile-service` thực hiện. Xem `CONVENTIONS.md` mục 7 và [adr.md](adr.md) ADR-01.

---

## 6. Tiêu chí nghiệm thu (Definition of Done)

Mỗi tiêu chí được kiểm chứng tự động bằng `scripts/e2e_acceptance.py` (kết quả lần chạy cuối:
**69/69 kiểm tra PASS** (lần chạy 22/10/2026, sau khi cập nhật theo bản chốt v2.0; toàn bộ 20 script e2e: 663/663), chi tiết tại [testing-report.md](testing-report.md)).

- [x] Người dùng đăng ký/đăng nhập được với 3 vai trò mentee/mentor/admin
- [x] Mentee tạo được Career Profile; matching-service lập chỉ mục embedding sau khi lưu — **nhất quán cuối cùng**: e2e chờ tối đa 30 giây qua `GET /api/matching/index-status` (giới hạn trên khi thông báo bị mất: 1 chu kỳ `INDEX_SYNC_INTERVAL` = 60 giây), xem [testing-report.md](testing-report.md) §3
- [x] Mentee upload CV, chatbot hỏi thêm dựa trên CV, kết quả được tổng hợp và kích hoạt re-embedding
- [x] Mentor tạo được profile, trải qua AI Interview multi-turn, kết quả được admin review trước khi kích hoạt
- [x] Mentor chưa qua AI Interview không xuất hiện trong kết quả matching
- [x] Mentee nhận được danh sách mentor đề xuất từ Matching Service, có điểm phù hợp và lý do đề xuất
- [x] Danh sách đề xuất đã loại các mentor không thoả lịch rảnh/sức chứa (không chỉ dựa thuần vector)
- [x] Mentee gửi yêu cầu → mentor chấp nhận → đặt lịch → thanh toán sandbox → booking được xác nhận *(v1.x — trả trực tiếp qua cổng; v2.0 thay bằng tiêu chí ví bên dưới)*
- [x] Sau phiên, mentee đánh giá được mentor
- [x] Referral code hoạt động: người giới thiệu được ghi nhận và được thưởng khi có giao dịch hợp lệ *(v2.0: mã theo mentor, thưởng 30.000đ khuyến mãi)*
- [x] Toàn bộ hệ thống chạy được bằng `docker compose up` trên máy demo

**Tiêu chí bổ sung v2.0** (kiểm chứng bằng `scripts/e2e_v2_*.py` và các script e2e cũ đã cập nhật theo bản chốt):

- [x] Mentee nạp ví qua cổng thử nghiệm; giao dịch lỗi hoặc IPN trùng không đổi số dư
- [x] Đặt lịch tạm giữ học phí từ ví (khuyến mãi trước); thiếu tiền thì giữ chỗ 15 phút rồi nhả khung giờ
- [x] Buổi hoàn thành: chia học phí mentor/nền tảng (15%); thu nhập khả dụng sau 72 giờ; khiếu nại giữ thu nhập
- [x] Huỷ buổi theo 3 bậc (≥24h 100%, 4–24h 50%, <4h 0%); mentor huỷ/vắng hoàn 100% + lỗi vi phạm
- [x] Hoàn tiền nạp về nguồn trong 7 ngày đúng công thức min(...); không hoàn khuyến mãi hay tiền tạm giữ
- [x] Số dư: khuyến mãi hết hạn 12 tháng, ví "ngủ" sau 12 tháng, thông báo nhắc 30/7 ngày
- [x] Admin gán cấp Junior/Senior/Expert khi duyệt; mentor chỉ chọn giá trong khung; buổi đã đặt giữ giá
- [x] Buổi trải nghiệm 15 phút 30.000đ, mỗi cặp một lần
- [x] Phòng học Jitsi: chỉ người tham gia vào được; nhật ký vào phòng quyết định vắng mặt; tự hoàn thành sau 24 giờ
- [x] Referral theo cặp mentor: thưởng 30.000đ khuyến mãi sau 7 ngày, tối đa 5 lượt/tháng; tự giới thiệu/đã học với mentor bị từ chối
- [x] Admin khoá mentee: buổi chưa diễn ra bị huỷ, hoàn 100%, ví đóng băng

**Tiêu chí bổ sung v2.1 — phỏng vấn giọng nói** (chưa nghiệm thu):

- [ ] Mentor chọn chế độ giọng nói; bản chép lời được gộp theo chủ đề, chấm bằng engine + rubric hiện có và chuyển PENDING_REVIEW như chat; admin thấy nhãn "Giọng nói"
- [ ] Không tick đồng ý → 400 `VOICE_CONSENT_REQUIRED`; thiếu `OPENAI_API_KEY` ở production → 503 `VOICE_UNAVAILABLE`, không tạo buổi
- [ ] Buổi giọng nói đang làm < 30 phút được nối lại với client secret mới; quá 30 phút không có bản chép lời → ABANDONED, tính một lượt
- [ ] Mentee luyện phỏng vấn 1 lần miễn phí; lần thứ hai → 409 `PRACTICE_FREE_USED` kèm lời mời đặt phỏng vấn thử với mentor
- [ ] Kết quả luyện phỏng vấn hiện ngay: nhận xét từng câu, 3 điểm mạnh, 3 điểm cần cải thiện, điểm 0–100, báo cáo nói
- [ ] Chấm luyện phỏng vấn chạy được bằng rule-based khi không có `DEEPSEEK_API_KEY` (CI)
- [ ] Thử thật trên trình duyệt có micro với `OPENAI_API_KEY` (HTTPS hoặc localhost)

---

## 7. Phân công công việc

Chi tiết ownership, quy ước git, contract-first workflow trong `CONVENTIONS.md`.

| Thành viên | Service | Frontend feature folder | Tính năng AI tự bảo vệ |
|---|---|---|---|
| **Phạm Ninh Phương Thảo** | `profile-service`, `matching-service` | `profile`, `matching` | **AI Matching** |
| **Đinh Quyết Thắng** | `mentoring-service`, `payment-service`, `ai-service/app/interview` | `mentoring`, `payment` | **AI Interview** |
| **Phạm Ngọc Quang** | `auth-service`, `learning-service`, `ai-service/app/cv` + `app/enrichment` | `auth`, `learning` | **CV Parsing + Chatbot enrichment** (engine, luồng và dữ liệu đều ở `ai-service`) |

Mỗi người sở hữu đúng 1 tính năng AI riêng để có thể tự bảo vệ trước hội đồng (đồ án chấm điểm cá nhân).

---

## 8. Quy trình nghiệp vụ

Quy trình chi tiết dạng luồng màn hình + sơ đồ tuần tự + sơ đồ trạng thái được trình bày tại
[business-domain-mentor-mentee.md](business-domain-mentor-mentee.md), gồm:

1. Đăng ký, đăng nhập, xác thực email, làm mới token
2. Mentor: tạo hồ sơ → khai báo lịch rảnh → AI Interview → admin duyệt
3. Mentee: tạo hồ sơ → upload CV → chatbot enrichment → re-embedding
4. Tìm mentor phù hợp (AI Matching)
5. Nạp ví → gửi yêu cầu → chấp nhận → đặt lịch (tạm giữ từ ví) → nhắc lịch → phòng học → hoàn thành → chia hoa hồng → đánh giá; buổi trải nghiệm 15 phút
6. Huỷ phiên 3 bậc, vắng mặt, hoàn tiền buổi học; hoàn tiền nạp; hạn dùng số dư
7. Giới thiệu người học theo cặp mentor & thưởng khuyến mãi
8. Learning Hub: học khoá học, theo dõi tiến độ; admin quản lý nội dung

---

## 9. Đặc tả API (tóm tắt)

Bản đầy đủ theo từng endpoint: [api-reference.md](api-reference.md); schema chi tiết: `contracts/*.yaml`.

**Quy ước chung:**
- JSON `camelCase`, SQL `snake_case`.
- Lỗi: `{ "error": { "code": "STRING_CODE", "message": "..." } }`.
- Endpoint `/api/**` yêu cầu `Authorization: Bearer <JWT>` (trừ đăng ký/đăng nhập/refresh/xác thực email).
- Endpoint `/internal/**` chỉ nhận header `X-Internal-Token`, không đi qua frontend.

| Service | Số endpoint (không kể `/health`) | Nhóm chức năng |
|---|---|---|
| auth-service | 12 | register, login, refresh, logout, verify-email, verify-token, me, change-password, admin users |
| profile-service | 14 | mentor/mentee profile, availability, mentor search, enrichment-chat, internal (summary, mentor, verification, rating, active-mentees, xoá cv-file) |
| matching-service | 4 | matching mentors, internal reindex, index-status, admin rebuild embeddings |
| learning-service | 24 | courses, enroll, progress, materials, roadmaps, admin CRUD |
| mentoring-service | 21 | requests, sessions, reviews, notifications, admin stats, internal sessions, internal notifications, internal relationships |
| payment-service | 10 | charge, transactions, referrals, admin stats/transactions/referrals, internal referrals/refund |
| ai-service | 15 | interviews (+ admin interviews, admin stats), CV upload/parse/file/mine/delete, enrichment conversations. *v2.1 ⚒ thêm 7: `interviews/voice`, `interviews/{id}/voice-transcript`, 5 endpoint `practice-interviews` (chưa tính vào tổng bên dưới)* |
| **Tổng** | **100** (+ 7 `/health` = 107, khớp `contracts/*.yaml` và mã nguồn) | |

### 9.1 Sơ đồ gọi API giữa các service

```
browser ──► frontend (Next.js 14 + TypeScript, proxy /api/<service>/**)
               ├─► auth-service ─────────────► payment-service   [POST /internal/referrals]
               ├─► profile-service ──────────► matching-service  [POST /internal/embeddings/reindex,
               │                                                   bắn rồi quên — không chờ kết quả]
               ├─► matching-service ─────────► matching-db (chỉ mục embedding, read-write)
               │                    └────────► profile-db  (READ-ONLY, ngoại lệ đã duyệt)
               ├─► learning-service
               ├─► mentoring-service ────────► profile-service   [/internal/mentor/*, /internal/profile-summary]
               │                    └────────► payment-service   [POST /internal/payments/refund]
               ├─► ai-service ───────────────► profile-service   [/internal/mentor/*, enrichment-chat,
               │              │                                    DELETE /internal/profile/{id}/cv-file]
               │              ├──────────────► mentoring-service [POST /internal/notifications,
               │              │                                    GET /internal/relationships]
               │              ├──────────────► DeepSeek API (tuỳ chọn)
               │              └──────────────► OpenAI Realtime [POST /realtime/client_secrets] (tuỳ chọn, v2.1)
               └─► payment-service ──────────► mentoring-service [GET /internal/sessions/{id}, POST .../payment-succeeded]
browser ◄══ WebRTC (âm thanh + kênh dữ liệu oai-events) ══► OpenAI Realtime   [v2.1, dùng client secret ngắn hạn]
```
