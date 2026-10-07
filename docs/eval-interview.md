# Đánh giá bộ chấm AI Interview (US-24, PRD 6.1 Evaluation)

> **PROVISIONAL — số liệu tạm thời.** PRD yêu cầu nhãn của 2 người chấm độc lập. Hiện cột `rater1`/`rater2` còn trống nên mọi chỉ số bên dưới được tính trên `draft_label` (nhãn nháp do chính người viết bộ dữ liệu gán). Khi hai thành viên điền `rater1` và `rater2`, chạy lại script: nhãn chuẩn tự chuyển sang trung bình / đa số của hai người chấm và báo cáo sẽ ghi rõ nguồn nhãn.

_Sinh tự động bởi `scripts/eval/interview/run_eval.py` ngày 2026-10-08. Đừng sửa tay phần số liệu — chạy lại script._

## 1. Bộ dữ liệu

- `scripts/eval/interview/answers.csv`: **40 câu trả lời** do nhóm tự viết, 10 câu cho mỗi dải điểm **0–2 / 3–5 / 6–8 / 9–10** (thang điểm câu 0–10 của rubric).
- Ngôn ngữ: en = 17, vi = 23; lĩnh vực: backend = 11, data = 6, devops = 8, frontend = 5, general = 6, mobile = 4.
- Mỗi câu gắn với một chủ đề có thật trong ngân hàng câu hỏi (`app/interview/question_bank.py`), nên engine chấm đúng với khái niệm kỳ vọng của chủ đề đó. Có 1 câu cố ý chèn lệnh cho người chấm (A08) để kiểm tra cờ PROMPT_INJECTION.
- Cột nhãn: `rater1`, `rater2` (để trống, chờ 2 thành viên chấm độc lập), `draft_label` (nhãn nháp). Người chấm cho **điểm câu 0–10** theo rubric 4 tiêu chí (kỹ thuật 40%, kinh nghiệm 30%, giao tiếp 15%, hướng dẫn 15%) — xem bảng mô tả mức điểm ở `docs/ai-features.md` §2.5.
- Nguồn nhãn lần chạy này: DRAFT = 40.

## 2. Phương pháp

- Nhãn chuẩn = trung bình `rater1` và `rater2` khi có đủ; nếu chưa có thì dùng `draft_label`.
- Chỉ số chính: tỉ lệ câu có |điểm AI − nhãn| ≤ 2 điểm, **mục tiêu ≥ 80% cho mỗi engine**. Kèm MAE và độ lệch trung bình (AI − nhãn, dương = AI chấm rộng tay).
- Ma trận khuyến nghị: mỗi câu được coi như một buổi phỏng vấn 1 câu; khuyến nghị = `rubric.recommend(điểm × 10)` (≥ 70 APPROVE, 50–69 NEEDS_REVIEW, < 50 REJECT; có cờ ⇒ NEEDS_REVIEW).
- Rule-based chạy đúng code production (`rule_based.assess` + `rubric.detect_injection`). DeepSeek chạy `deepseek_engine.evaluate` với prompt production khi có `DEEPSEEK_API_KEY`; lượt phải fallback được đếm riêng.

## 3. Kết quả

| Engine | Số câu | Trong ±2 | Mục tiêu | MAE | Độ lệch TB | Fallback |
|---|---|---|---|---|---|---|
| RULE_BASED | 40 | 33/40 (82.5%) | ≥ 80% — đạt | 1.10 | +0.44 | 0 |
| DEEPSEEK | — | **chưa chạy** (không có `DEEPSEEK_API_KEY`) | ≥ 80% | — | — | — |

### 3.1 RULE_BASED — theo dải điểm

| Dải (theo bộ dữ liệu) | Số câu | Nhãn TB | AI TB | MAE | Trong ±2 |
|---|---|---|---|---|---|
| 0-2 | 10 | 0.80 | 1.79 | 1.09 | 8/10 (80.0%) |
| 3-5 | 10 | 3.60 | 4.92 | 1.32 | 7/10 (70.0%) |
| 6-8 | 10 | 6.80 | 7.10 | 0.96 | 10/10 (100.0%) |
| 9-10 | 10 | 9.10 | 8.24 | 1.04 | 8/10 (80.0%) |

Ma trận khuyến nghị (RULE_BASED):

| Người chấm \ AI | APPROVE | NEEDS_REVIEW | REJECT |
|---|---|---|---|
| **APPROVE** | 14 | 2 | 0 |
| **NEEDS_REVIEW** | 2 | 1 | 1 |
| **REJECT** | 0 | 6 | 14 |

Khuyến nghị trùng nhau: 29/40 (72.5%).

Các câu lệch quá ±2 (RULE_BASED):

| Câu | Dải | Nhãn | AI | T / D / C / M | Ghi chú |
|---|---|---|---|---|---|
| A38 (en, mobile) | 9-10 | 9.0 | 6.3 | 10.0 / 2.0 / 9.0 / 2.5 | AI thấp hơn |
| A09 (en, devops) | 0-2 | 1.5 | 4.1 | 5.0 / 5.0 / 4.0 / 0.0 | AI cao hơn |
| A35 (vi, devops) | 9-10 | 9.5 | 7.1 | 8.0 / 9.0 / 8.0 / 0.0 | AI thấp hơn |
| A06 (vi, backend) | 0-2 | 1.0 | 3.2 | 3.5 / 4.0 / 4.0 / 0.0 | AI cao hơn |
| A11 (vi, backend) | 3-5 | 3.0 | 5.2 | 8.0 / 4.0 / 5.0 / 0.0 | AI cao hơn |
| A15 (vi, general) | 3-5 | 4.0 | 6.1 | 8.0 / 2.0 / 5.0 / 10.0 | AI cao hơn |
| A20 (en, general) | 3-5 | 4.5 | 6.6 | 8.0 / 4.0 / 7.0 / 7.5 | AI cao hơn |

## 4. Nhận xét

- Engine rule-based chấm theo tín hiệu bề mặt (khái niệm kỳ vọng, tín hiệu kinh nghiệm, số liệu, cấu trúc, từ khoá hướng dẫn). Nó không kiểm chứng được tính đúng: câu trả lời SAI nhưng dùng đúng thuật ngữ vẫn có thể được điểm kỹ thuật (xem các câu dải 0–2 có thuật ngữ), và câu trả lời ĐÚNG nhưng dùng từ ngữ khác danh sách khái niệm sẽ bị chấm thấp. Đây là lý do mọi kết quả đều chờ admin duyệt (NFR-8) và khuyến nghị bật engine DeepSeek khi triển khai.
- Bộ dữ liệu và `draft_label` do cùng người viết engine tạo ra nên có nguy cơ thiên vị (vô tình viết câu trả lời "hợp" với luật). Số liệu chỉ có giá trị khi 2 người chấm độc lập điền `rater1`/`rater2`.
- Sau lần chạy đầu tiên chỉ có MỘT thay đổi luật, mang tính tổng quát: thêm tín hiệu kinh nghiệm tiếng Anh `our team/service/app/...` (trước đó câu tiếng Anh kể dự án bằng "our ..." bị chấm depth ≤ 2). Tỉ lệ trong ±2 trước và sau thay đổi đều là 33/40.
- Rule-based không được tinh chỉnh theo từng câu của bộ dữ liệu; thay đổi luật chấm phải giữ unit test `tests/test_interview_rule_based.py` / `tests/test_interview_rubric.py` xanh.

## 5. Chỉ số online (PRD 6.1)

Tỉ lệ đồng thuận giữa quyết định admin và khuyến nghị AI nằm ở `GET /api/ai/admin/stats` (`decisionsComparable`, `decisionsAgreeing`, `agreementRate`) và hiển thị trên bảng điều khiển admin + trang Duyệt mentor. Định nghĩa: chỉ tính các buổi đã có quyết định mà AI khuyến nghị APPROVE hoặc REJECT; đồng thuận khi APPROVE↔APPROVE, REJECT↔REJECT; REQUEST_RETAKE tính là không đồng thuận; buổi AI khuyến nghị NEEDS_REVIEW không có hướng để so nên được đếm riêng (`decisionsOnNeedsReview`). Mục tiêu ≥ 80%.

## 6. Cách chạy lại

```bash
# Python 3.11 + dependency của ai-service (pip install -r ai-service/requirements.txt)
python scripts/eval/interview/run_eval.py                 # rule-based; ghi docs/eval-interview.md
DEEPSEEK_API_KEY=sk-... python scripts/eval/interview/run_eval.py   # thêm DeepSeek
```

Kết quả từng câu: `scripts/eval/interview/results_<engine>.csv`.
