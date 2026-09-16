# Tài liệu đồ án — MentorHub

Nền tảng học tập và kết nối Mentor-Mentee trong lĩnh vực lập trình.
Nhóm: Phạm Ngọc Quang (B22DCDT243), Đinh Quyết Thắng (B22DCCN809), Phạm Ninh Phương Thảo (B22DCCN803) —
Lớp E22CNPM03 — GVHD: Đào Ngọc Phong.

## Danh mục tài liệu

| Tài liệu | Nội dung | Gợi ý dùng cho chương báo cáo |
|---|---|---|
| [SRD-Mentor-Mentee-Platform.md](SRD-Mentor-Mentee-Platform.md) | Đặc tả yêu cầu v1.0: phạm vi, yêu cầu chức năng/phi chức năng, quyết định thiết kế, tiêu chí nghiệm thu | Ch.1 Giới thiệu · Ch.2 Phân tích yêu cầu |
| [business-domain-mentor-mentee.md](business-domain-mentor-mentee.md) | Use case, luồng nghiệp vụ chi tiết, sơ đồ tuần tự, sơ đồ trạng thái | Ch.2 Phân tích yêu cầu · Ch.3 Thiết kế |
| [architecture.md](architecture.md) | Kiến trúc microservices, cấu trúc mã nguồn, bảo mật, nhất quán dữ liệu, tác vụ nền, triển khai, CI/CD | Ch.3 Thiết kế hệ thống |
| [database-design.md](database-design.md) | ERD và mô tả bảng của 5 CSDL | Ch.3 Thiết kế CSDL |
| [api-reference.md](api-reference.md) | 99 endpoint (106 kể cả `/health`) của 7 service, quyền truy cập, ví dụ | Ch.3 Thiết kế API · Phụ lục |
| [ai-features.md](ai-features.md) | AI Matching (matching-service), AI Interview và CV Parsing + Chatbot enrichment (ai-service, DeepSeek + rule-based): thuật toán, công thức, prompt, ví dụ, hạn chế, câu hỏi bảo vệ | Ch.4 Hiện thực các tính năng AI (phần cá nhân) |
| [testing-report.md](testing-report.md) | Chiến lược, 106 unit test, 65 kiểm tra e2e, hiệu năng, bảo mật, lỗi phát hiện, giới hạn | Ch.5 Kiểm thử & đánh giá |
| [deployment-guide.md](deployment-guide.md) | Cài đặt, cấu hình, tài khoản demo, kịch bản demo ~20 phút, xử lý sự cố | Ch.5 Triển khai · Phụ lục |
| [ui-design.md](ui-design.md) | Design system giao diện (DESIGN.md, tokens.json, Tailwind v4), điểm điều chỉnh, ảnh chụp màn hình | Ch.3 Thiết kế giao diện |
| [user-guide.md](user-guide.md) | Hướng dẫn sử dụng theo vai trò | Phụ lục |
| [archive/](archive/) | SRD v0.2 (bản trước khi hiện thực) | Tham khảo lịch sử |

Tài liệu kỹ thuật khác trong repo: `CONVENTIONS.md` (quy ước nhóm), `contracts/*.yaml` (OpenAPI).

## Phân công theo tài liệu

| Thành viên | Phần cần nắm vững khi bảo vệ |
|---|---|
| Phạm Ninh Phương Thảo | `ai-features.md` §1 · profile/matching trong `architecture.md`, `database-design.md` §2, `api-reference.md` §2–3 |
| Đinh Quyết Thắng | `ai-features.md` §2 (ai-service `app/interview`) · mentoring/payment trong `business-domain-mentor-mentee.md` §2.4, §2.6, §3.1–3.3; `database-design.md` §3–4 |
| Phạm Ngọc Quang | `ai-features.md` §3 (ai-service `app/cv`, `app/enrichment`) · auth/learning; bảo mật trong `architecture.md` §3; `database-design.md` §1, §5 |

## Số liệu chính (17/09/2026)

| Hạng mục | Giá trị |
|---|---|
| Service | 7 backend (5 Java, 2 Python) + 1 frontend, 5 CSDL PostgreSQL, Redis |
| Endpoint | 99 nghiệp vụ + 7 `/health` = 106 (OpenAPI) |
| Trang giao diện | 25 |
| Unit test | 106/106 pass |
| Kiểm thử chấp nhận e2e | 65/65 pass — đạt 11/11 tiêu chí DoD |
| Độ trễ AI Matching (~5.000 mentor) | p95 5,7 ms (yêu cầu < 2 s) |

## Xuất sơ đồ cho báo cáo Word
Các sơ đồ viết bằng Mermaid. Dán khối mã vào <https://mermaid.live> → *Actions* → tải PNG/SVG; hoặc
dùng `npx @mermaid-js/mermaid-cli -i docs/architecture.md -o out.md` để xuất hàng loạt.
