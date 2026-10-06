# Tài liệu đồ án — MentorHub

Nền tảng học tập và kết nối Mentor-Mentee trong lĩnh vực lập trình.
Nhóm: Phạm Ngọc Quang (B22DCDT243), Đinh Quyết Thắng (B22DCCN809), Phạm Ninh Phương Thảo (B22DCCN803) —
Lớp E22CNPM03 — GVHD: Đào Ngọc Phong.

## Danh mục tài liệu

| Tài liệu | Nội dung | Gợi ý dùng cho chương báo cáo |
|---|---|---|
| [SRD-Mentor-Mentee-Platform.md](SRD-Mentor-Mentee-Platform.md) | Đặc tả yêu cầu v1.0: phạm vi, yêu cầu chức năng/phi chức năng, quyết định thiết kế, tiêu chí nghiệm thu | Ch.1 Giới thiệu · Ch.2 Phân tích yêu cầu |
| [business-domain-mentor-mentee.md](business-domain-mentor-mentee.md) | Use case, luồng nghiệp vụ chi tiết, sơ đồ tuần tự, sơ đồ trạng thái | Ch.2 Phân tích yêu cầu · Ch.3 Thiết kế |
| [architecture.md](architecture.md) | Kiến trúc microservices, cấu trúc mã nguồn, bảo mật, nhất quán dữ liệu, tác vụ nền, triển khai, CI/CD, hạn chế đã biết | Ch.3 Thiết kế hệ thống |
| [adr.md](adr.md) | **Sổ quyết định kiến trúc (ADR)**: đọc `profile_db` read-only, best-effort + đối soát, `R-1` chuyển chỉ mục embedding sang matching-service, schema không migration, proxy thay API Gateway | Ch.3 Thiết kế hệ thống · Chuẩn bị bảo vệ |
| [database-design.md](database-design.md) | ERD và mô tả bảng của 7 CSDL (gồm `matching_db`) | Ch.3 Thiết kế CSDL |
| [api-reference.md](api-reference.md) | 100 endpoint (107 kể cả `/health`) của 7 service, quyền truy cập, ví dụ | Ch.3 Thiết kế API · Phụ lục |
| [ai-features.md](ai-features.md) | AI Matching (matching-service), AI Interview và CV Parsing + Chatbot enrichment (ai-service, DeepSeek + rule-based): thuật toán, công thức, prompt, ví dụ, hạn chế, câu hỏi bảo vệ | Ch.4 Hiện thực các tính năng AI (phần cá nhân) |
| [testing-report.md](testing-report.md) | Chiến lược, unit test, kiểm tra e2e theo DoD (DoD 2 nay là nhất quán cuối cùng), hiệu năng, bảo mật, lỗi phát hiện, giới hạn | Ch.5 Kiểm thử & đánh giá |
| [deployment-guide.md](deployment-guide.md) | Cài đặt, cấu hình, tài khoản demo, kịch bản demo ~20 phút, xử lý sự cố, **nâng cấp/migration CSDL** | Ch.5 Triển khai · Phụ lục |
| [cv-data-policy.md](cv-data-policy.md) | **Chính sách dữ liệu CV**: nơi lưu, giới hạn, quyền truy cập, gửi DeepSeek, thời hạn lưu, cách xoá, phần chưa hiện thực | Ch.4 (phần CV) · Ch.5 Bảo mật |
| [ui-design.md](ui-design.md) | Design system giao diện (DESIGN.md, tokens.json, Tailwind v4), điểm điều chỉnh, ảnh chụp màn hình | Ch.3 Thiết kế giao diện |
| [user-guide.md](user-guide.md) | Hướng dẫn sử dụng theo vai trò | Phụ lục |
| [system-analysis-status.md](system-analysis-status.md) | **Hiện trạng hệ thống & sổ khoảng trống**: những gì đã có, refactor đang dở, danh sách cần cập nhật theo mức ưu tiên, kế hoạch 3 đợt | Quản lý tiến độ · Rà soát trước khi nộp |
| [archive/](archive/) | SRD v0.2 (bản trước khi hiện thực) | Tham khảo lịch sử |

Tài liệu kỹ thuật khác trong repo: `CONVENTIONS.md` (quy ước nhóm), `contracts/*.yaml` (OpenAPI).

## Phân công theo tài liệu

| Thành viên | Phần cần nắm vững khi bảo vệ |
|---|---|
| Phạm Ninh Phương Thảo | `ai-features.md` §1 · profile/matching trong `architecture.md`, `database-design.md` §2–3, `api-reference.md` §2–3 · `adr.md` ADR-01, ADR-03 |
| Đinh Quyết Thắng | `ai-features.md` §2 (ai-service `app/interview`) · mentoring/payment trong `business-domain-mentor-mentee.md` §2.4, §2.5, §2.7, §3.1–3.3; `database-design.md` §4–6 · `adr.md` ADR-02 |
| Phạm Ngọc Quang | `ai-features.md` §3 (ai-service `app/cv`, `app/enrichment`) · auth/learning; bảo mật trong `architecture.md` §3; `database-design.md` §1, §5, §7 · `cv-data-policy.md` |

## Số liệu chính (06/10/2026)

> Số liệu đếm bằng lệnh ở [system-analysis-status.md](system-analysis-status.md) Phần E — chạy lại trước
> khi trích dẫn. Unit test, e2e và benchmark chạy lại ngày 06/10/2026 sau `R-1`.

| Hạng mục | Giá trị |
|---|---|
| Service | 7 backend (5 Java, 2 Python) + 1 frontend, 7 CSDL PostgreSQL (`matching_db` dùng pgvector), Redis |
| Endpoint | 100 nghiệp vụ + 7 `/health` = 107 (OpenAPI, khớp mã nguồn) |
| Trang giao diện | 26 (Next.js 14 + TypeScript, gồm `/mentors`) |
| Unit test | 156/156 pass (7 service, 0 skip) |
| Kiểm thử chấp nhận e2e | 66/66 PASS (66 lời gọi `check()`, 1 lời gọi nằm trong vòng lặp theo lượt phỏng vấn) — 11/11 tiêu chí DoD |
| Độ trễ AI Matching (~5.000 mentor) | p95 3,6 ms (yêu cầu < 2 s) — đo sau `R-1` |
| Độ trễ cập nhật chỉ mục embedding | Vài giây (thông báo best-effort); tối đa ~1 chu kỳ `INDEX_SYNC_INTERVAL` = 60 s nếu thông báo bị mất |

## Hạn chế đã biết (tóm tắt)

Chi tiết và lý do: [architecture.md](architecture.md) §8, [adr.md](adr.md).
- Chỉ mục embedding **nhất quán cuối cùng**: hồ sơ mới/sửa có thể chưa phản ánh trong matching tới ~60 s.
- Thanh toán chỉ là **sandbox**, không tích hợp cổng thật.
- **Không có API Gateway** riêng: frontend proxy đóng vai cổng vào; không rate-limit/tracing tập trung.
- **Bí mật mặc định cho dev** (`JWT_SECRET`, `INTERNAL_API_KEY`, mật khẩu CSDL, `matching_reader`; 7 service log
  WARN lúc khởi động khi `JWT_SECRET`/`INTERNAL_API_KEY` còn giá trị dev) — bắt
  buộc thay khi triển khai thật.
- **Không có công cụ migration**: đổi schema phải `docker compose down -v` ([deployment-guide.md](deployment-guide.md) §8).
- CV: đã có xem/xoá CV và giới hạn mentor theo quan hệ mentoring; còn thiếu thời hạn lưu tự động và mã
  hoá khi lưu ([cv-data-policy.md](cv-data-policy.md)).

## Xuất sơ đồ cho báo cáo Word
Các sơ đồ viết bằng Mermaid. Dán khối mã vào <https://mermaid.live> → *Actions* → tải PNG/SVG; hoặc
dùng `npx @mermaid-js/mermaid-cli -i docs/architecture.md -o out.md` để xuất hàng loạt.
