# Đánh giá bộ chấm AI Interview (US-24, PRD 6.1 Evaluation)

> **PROVISIONAL — số liệu tạm thời.** Một số mẫu còn thiếu nhãn từ hai người chấm độc lập. Số lượng theo từng nguồn nhãn được ghi trong báo cáo.

_Sinh tự động bởi `scripts/eval/interview/run_eval.py` ngày 2026-11-27. Đừng sửa tay phần số liệu — chạy lại script._

## 1. Bộ dữ liệu

- `scripts/eval/interview/answers.csv`: **40 câu trả lời** do nhóm tự viết, 10 câu cho mỗi dải điểm **0–2 / 3–5 / 6–8 / 9–10** (thang điểm câu 0–10 của rubric).
- Ngôn ngữ: en = 17, vi = 23; lĩnh vực: backend = 11, data = 6, devops = 8, frontend = 5, general = 6, mobile = 4.
- Mỗi câu gắn với một chủ đề có thật trong ngân hàng câu hỏi (`app/interview/question_bank.py`), nên engine chấm đúng với khái niệm kỳ vọng của chủ đề đó. Có 1 câu cố ý chèn lệnh cho người chấm (A08) để kiểm tra cờ PROMPT_INJECTION.
- Cột nhãn gồm `rater1`, `rater2` cho hai thành viên chấm độc lập và `draft_label` cho nhãn nháp. Người chấm cho **điểm câu 0–10** theo rubric 4 tiêu chí (kỹ thuật 40%, kinh nghiệm 30%, giao tiếp 15%, hướng dẫn 15%) — xem bảng mô tả mức điểm ở `docs/ai-features.md` §2.5.
- Nguồn nhãn lần chạy này: DRAFT = 40.

## 2. Phương pháp

- Nhãn chuẩn ưu tiên trung bình hai người chấm, sau đó là nhãn của một người chấm và cuối cùng là nhãn nháp. Chia nhãn gốc cho 2 để tính MAE trên thang 5. Bốn điểm thành phần trong CSV dùng thang 10.
- Chỉ số chính: tỉ lệ câu có |điểm AI − nhãn| ≤ 1 điểm, **mục tiêu ≥ 80% cho mỗi engine**. Kèm MAE và độ lệch trung bình (AI − nhãn, dương = AI chấm rộng tay).
- Ma trận kết quả dùng `live.grade` với mỗi câu như một buổi một câu. Ngưỡng là ≥ 3.5 PASSED, < 2.5 FAILED, còn lại hoặc có cờ là UNCLEAR. Kết quả tham chiếu suy ra từ điểm nhãn theo cùng ngưỡng, sau khi làm tròn giống production.
- Rule-based chạy đúng code production (`rule_based.assess` + `rubric.detect_injection`). DeepSeek chạy `deepseek_engine.evaluate` với prompt production khi có `DEEPSEEK_API_KEY`; lượt phải fallback được đếm riêng.

## 3. Kết quả

| Engine | Số câu | Trong ±1 | Mục tiêu | MAE (thang 5) | Độ lệch TB | Fallback |
|---|---|---|---|---|---|---|
| RULE_BASED | 40 | 33/40 (82.5%) | ≥ 80% — đạt | 0.56 | +0.24 | 0 |
| DEEPSEEK | — | **chưa chạy** (không có `DEEPSEEK_API_KEY`) | ≥ 80% | — | — | — |

### 3.1 RULE_BASED — theo dải điểm

| Dải nhãn gốc (thang 10) | Số câu | Nhãn TB | AI TB | MAE | Trong ±1 |
|---|---|---|---|---|---|
| 0-2 | 10 | 0.40 | 0.91 | 0.56 | 8/10 (80.0%) |
| 3-5 | 10 | 1.80 | 2.48 | 0.68 | 7/10 (70.0%) |
| 6-8 | 10 | 3.40 | 3.58 | 0.50 | 10/10 (100.0%) |
| 9-10 | 10 | 4.55 | 4.15 | 0.50 | 8/10 (80.0%) |

Ma trận kết quả (RULE_BASED)

| Nhãn \ AI | PASSED | UNCLEAR | FAILED |
|---|---|---|---|
| **PASSED** | 14 | 2 | 0 |
| **UNCLEAR** | 2 | 1 | 1 |
| **FAILED** | 0 | 6 | 14 |

Kết quả trùng nhau: 29/40 (72.5%).

Các câu lệch quá ±1 (RULE_BASED)

| Câu | Dải | Nhãn | AI | T / D / C / M | Ghi chú |
|---|---|---|---|---|---|
| A09 (en, devops) | 0-2 | 0.75 | 2.1 | 5.0 / 5.0 / 4.0 / 0.0 | AI cao hơn |
| A38 (en, mobile) | 9-10 | 4.5 | 3.2 | 10.0 / 2.0 / 9.0 / 2.5 | AI thấp hơn |
| A35 (vi, devops) | 9-10 | 4.75 | 3.6 | 8.0 / 9.0 / 8.0 / 0.0 | AI thấp hơn |
| A06 (vi, backend) | 0-2 | 0.5 | 1.6 | 3.5 / 4.0 / 4.0 / 0.0 | AI cao hơn |
| A11 (vi, backend) | 3-5 | 1.5 | 2.6 | 8.0 / 4.0 / 5.0 / 0.0 | AI cao hơn |
| A15 (vi, general) | 3-5 | 2.0 | 3.1 | 8.0 / 2.0 / 5.0 / 10.0 | AI cao hơn |
| A20 (en, general) | 3-5 | 2.25 | 3.3 | 8.0 / 4.0 / 7.0 / 7.5 | AI cao hơn |

## 4. Nhận xét

- Engine rule-based chấm theo tín hiệu bề mặt (khái niệm kỳ vọng, tín hiệu kinh nghiệm, số liệu, cấu trúc, từ khoá hướng dẫn). Nó không kiểm chứng được tính đúng: câu trả lời SAI nhưng dùng đúng thuật ngữ vẫn có thể được điểm kỹ thuật (xem các câu dải 0–2 có thuật ngữ), và câu trả lời ĐÚNG nhưng dùng từ ngữ khác danh sách khái niệm sẽ bị chấm thấp. Luồng xác thực trực tiếp chuyển trường hợp UNCLEAR cho quản trị viên xem xét.
- Bộ dữ liệu và `draft_label` do cùng người viết engine tạo ra nên có nguy cơ thiên vị (vô tình viết câu trả lời "hợp" với luật). Số liệu chỉ có giá trị khi 2 người chấm độc lập điền `rater1`/`rater2`.
- Bộ đánh giá dùng câu trả lời dạng văn bản. Luồng xác thực trực tiếp còn bao gồm phiên nhiều câu, chép lời giọng nói và xử lý các câu bỏ trống.

## 5. Cách chạy lại

```bash
# Python 3.11 + dependency của ai-service (pip install -r ai-service/requirements.txt)
python scripts/eval/interview/run_eval.py                 # rule-based; ghi docs/eval-interview.md
DEEPSEEK_API_KEY=sk-... python scripts/eval/interview/run_eval.py   # thêm DeepSeek
```

Kết quả từng câu: `scripts/eval/interview/results_<engine>.csv`.
