# Hướng dẫn triển khai & kịch bản demo — MentorHub

## 1. Yêu cầu hệ thống

| Thành phần | Phiên bản | Ghi chú |
|---|---|---|
| Docker Engine / Docker Desktop | ≥ 24, có Docker Compose v2 | Bắt buộc |
| RAM trống | ≥ 6 GB | 5 JVM + 2 service Python (model embedding) + 5 PostgreSQL |
| Dung lượng đĩa | ≥ 8 GB | Image Maven/PyTorch CPU/Node |
| Python | ≥ 3.9 | Chỉ để chạy script seed / e2e / benchmark (chỉ dùng thư viện chuẩn) |
| Cổng trống | 3000, 5433–5437, 6379, 8081–8085, 8090, 8091 | |
| Internet | Lần build đầu; khi bật DeepSeek | Tải dependency, model embedding và font Google (Nunito, tự host khi build frontend); engine rule-based chạy offline được |

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
> cần `docker compose down -v` để khởi tạo lại.

## 3. Cấu hình (`.env`)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `JWT_SECRET` | chuỗi dev | Secret ký JWT dùng chung cho mọi service — **bắt buộc đổi khi triển khai thật**, ≥ 32 byte |
| `INTERNAL_API_KEY` | `dev-internal-key` | Khoá xác thực lời gọi `/internal/*` giữa các service |
| `DEEPSEEK_API_KEY` | trống | ai-service: có giá trị → AI Interview & CV enrichment dùng DeepSeek (lỗi thì tự fallback); trống → engine rule-based |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | Địa chỉ API DeepSeek (định dạng OpenAI) |
| `DEEPSEEK_MODEL` | `deepseek-flash` | Model DeepSeek, ví dụ `deepseek-v4-pro` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | `admin@mmp.local` / `Admin@123` | Tài khoản admin tạo sẵn |
| `FRONTEND_URL` | `http://localhost:3000` | Dùng trong liên kết xác thực email và liên kết giới thiệu |
| `REMINDER_BEFORE` | `PT24H` | Nhắc lịch trước giờ bắt đầu (ISO-8601 duration) |

Các tham số khác (đặt trong `environment` của service tương ứng trong `docker-compose.yml`):
`INTERVIEW_MAX_TURNS` (5), `ENRICHMENT_MAX_TURNS` (4), `AI_SERVICE_TIMEOUT` (PT150S) — mentoring-service;
`DEEPSEEK_MAX_TOKENS` (4000), `DEEPSEEK_TIMEOUT_SECONDS` (60) — ai-service; `EMBEDDING_MODEL` (matching-service),
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
   năng đã cập nhật, thời điểm embedding đổi.

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

> Mẹo: chạy `python3 scripts/e2e_acceptance.py` để kiểm tra nhanh toàn hệ thống (65 kiểm tra, ~3 giây).
> Script này tạo thêm người dùng/mentor thử nghiệm, nên trước buổi demo hãy làm sạch dữ liệu:
> `docker compose down -v && docker compose up -d --build` rồi chạy lại `seed_demo.py`.

## 6. Chạy từng service khi phát triển

```bash
# CSDL + Redis bằng Docker
docker compose up -d auth-db profile-db mentoring-db payment-db learning-db redis

# Service Java (cổng CSDL mặc định trong application.yml trỏ về localhost:543x)
cd auth-service && mvn spring-boot:run

# matching-service
cd matching-service && python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt && uvicorn app.main:app --port 8090 --reload

# ai-service
cd ai-service && python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt && uvicorn app.main:app --port 8091 --reload

# frontend (proxy tới localhost:808x theo mặc định)
cd frontend && npm install && npm run dev
```

## 7. Xử lý sự cố

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Service Java restart liên tục | CSDL chưa sẵn sàng hoặc schema cũ | `docker compose logs <service>`; nếu đã sửa SQL: `docker compose down -v` rồi `up` lại |
| Tìm mentor báo "hoàn thành hồ sơ" dù đã lưu | Embedding đang chờ (matching-service chưa lên) | Chờ `matching-service` healthy; job retry tự sinh lại trong 1 phút, hoặc admin bấm *Bổ sung embedding còn thiếu* |
| Không thấy mentor nào | Chưa seed, hoặc mentor chưa được duyệt/chưa có lịch rảnh/khác lĩnh vực | Chạy `seed_demo.py`; xem dòng thống kê pipeline trên trang |
| Đặt lịch báo "Mentor không rảnh" | Thời điểm ngoài khung rảnh (giờ Việt Nam) hoặc phiên vượt quá giờ kết thúc | Chọn giờ nằm trọn trong khung lịch hiển thị ở hồ sơ mentor |
| Upload CV báo không đọc được | PDF ảnh scan | Dùng PDF có lớp văn bản (xuất từ Word/Google Docs) |
| matching-service 401 với mọi token | `JWT_SECRET` giữa các service khác nhau | Đặt cùng giá trị trong `.env`, `docker compose up -d` lại |
| AI Interview / tải CV báo "Dịch vụ AI tạm thời không khả dụng" | ai-service chưa chạy | `docker compose ps ai-service`, `docker compose logs ai-service` |
| Đã điền `DEEPSEEK_API_KEY` nhưng `/health` của 8091 vẫn `llmEnabled: false` | Container chưa nhận biến mới | `docker compose up -d ai-service` sau khi sửa `.env` |
| Cổng bị chiếm | Ứng dụng khác dùng 3000/5433/8081… | Tắt ứng dụng đó hoặc đổi cổng host trong `docker-compose.yml` |
