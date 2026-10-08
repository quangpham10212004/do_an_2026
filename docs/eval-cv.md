# Đánh giá CV parsing (US-29, PRD 6.2 Evaluation)

> **PROVISIONAL — số liệu tạm thời.** PRD yêu cầu nhãn của 2 người chấm độc lập. Hiện cột `rater1`/`rater2` còn trống nên mọi chỉ số bên dưới được tính trên `draft_label` (nhãn nháp do chính người viết bộ dữ liệu gán). Khi hai thành viên điền `rater1` và `rater2`, chạy lại script: nhãn chuẩn tự chuyển sang trung bình / đa số của hai người chấm và báo cáo sẽ ghi rõ nguồn nhãn.

_Sinh tự động bởi `scripts/eval/cv/run_eval.py` ngày 2026-10-08 — chạy lại script thay vì sửa tay số liệu._

## 1. Bộ dữ liệu

- **20 CV PDF có lớp văn bản** ở `scripts/eval/cv/pdf/`, sinh từ `cv_data.py` bằng `make_cvs.py` (cùng kiểu với `scripts/make_sample_cv.py`, nhưng dùng font Unicode để CV tiếng Việt có dấu).
- Ngôn ngữ: en = 10, vi = 10; bố cục: classic = 5, compact = 4, table = 3, timeline = 4, two-column = 4. `two-column` vẽ hai cột xen kẽ từng dòng (như CV xuất từ Word/Canva) nên văn bản trích ra bị trộn cột; `compact` không có mục Kỹ năng riêng; `table` liệt kê kỹ năng dạng bảng; `timeline` để mốc thời gian trên dòng riêng.
- Nhãn: `scripts/eval/cv/gold.csv` — mỗi CV một dòng: `rater1_skills`/`rater1_years`, `rater2_skills`/`rater2_years` (để trống, chờ 2 thành viên), `draft_skills`/`draft_years` (nhãn nháp). Kỹ năng ghi tên chuẩn, ngăn cách bằng `;`.
- Nguồn nhãn lần chạy này: DRAFT = 20.
- Mốc tham chiếu cho "nay/present": 11/2026; sai số ±1 năm đủ để chạy lại trong năm 2027.

## 2. Phương pháp

- Văn bản trích bằng `app/cv/extractor.py` (pypdf) như khi người dùng upload, rồi parse bằng engine.
- Kỹ năng so khớp không phân biệt hoa thường / dấu chấm / khoảng trắng. Precision, recall, F1 tính **micro** trên toàn bộ cặp (CV, kỹ năng). Mục tiêu: F1 ≥ 0.8 (DeepSeek), ≥ 0.6 (rule-based).
- Số năm kinh nghiệm: đúng khi |dự đoán − nhãn| ≤ 1; parser trả null được coi là 0 năm.

## 3. Kết quả

| Engine | CV | Precision | Recall | F1 | Mục tiêu F1 | Năm KN ±1 | Fallback |
|---|---|---|---|---|---|---|---|
| RULE_BASED | 20 | 0.993 | 0.933 | **0.962** | ≥ 0.6 — đạt | 20/20 | 0 |
| DEEPSEEK | — | — | — | **chưa chạy** (không có `DEEPSEEK_API_KEY`) | ≥ 0.8 | — | — |

### 3.1 RULE_BASED — theo bố cục

| layout | CV | P | R | Năm ±1 |
|---|---|---|---|---|
| classic | 5 | 1.00 | 0.91 | 5/5 |
| compact | 4 | 1.00 | 0.93 | 4/4 |
| table | 3 | 0.97 | 0.97 | 3/3 |
| timeline | 4 | 1.00 | 0.91 | 4/4 |
| two-column | 4 | 1.00 | 0.96 | 4/4 |

### 3.1b RULE_BASED — theo ngôn ngữ

| lang | CV | P | R | Năm ±1 |
|---|---|---|---|---|
| en | 10 | 1.00 | 0.91 | 10/10 |
| vi | 10 | 0.99 | 0.96 | 10/10 |

### 3.1c RULE_BASED — từng CV

| CV | Bố cục | Gold | Dự đoán | Đúng | Bỏ sót | Thừa | Năm (nhãn / dự đoán) |
|---|---|---|---|---|---|---|---|
| CV01 (vi) | classic | 10 | 10 | 10 | — | — | 4 / 4 |
| CV02 (en) | classic | 10 | 10 | 10 | — | — | 3 / 3 |
| CV03 (vi) | two-column | 9 | 9 | 9 | — | — | 4 / 4 |
| CV04 (en) | table | 15 | 15 | 15 | — | — | 6 / 6 |
| CV05 (vi) | compact | 7 | 5 | 5 | Firebase;BLoC | — | 2 / 2 |
| CV06 (en) | timeline | 11 | 9 | 9 | Express;WordPress | — | 6 / 6 |
| CV07 (vi) | table | 7 | 8 | 7 | — | CI/CD | 5 / 5 |
| CV08 (en) | two-column | 7 | 7 | 7 | — | — | 7 / 7 |
| CV09 (vi) | classic | 8 | 7 | 7 | Redux | — | 0 / null |
| CV10 (en) | compact | 9 | 9 | 9 | — | — | 5 / 5 |
| CV11 (vi) | timeline | 7 | 7 | 7 | — | — | 4 / 4 |
| CV12 (en) | classic | 7 | 4 | 4 | Objective-C;SwiftUI;Combine | — | 7 / 7 |
| CV13 (vi) | two-column | 6 | 6 | 6 | — | — | 6 / 6 |
| CV14 (en) | table | 9 | 8 | 8 | Scala | — | 4 / 4 |
| CV15 (vi) | compact | 7 | 7 | 7 | — | — | 3 / 3 |
| CV16 (en) | timeline | 10 | 9 | 9 | Celery | — | 3 / 4 |
| CV17 (vi) | classic | 8 | 8 | 8 | — | — | 6 / 6 |
| CV18 (en) | two-column | 6 | 5 | 5 | Firebase | — | 7 / 7 |
| CV19 (vi) | timeline | 5 | 5 | 5 | — | — | 6 / 6 |
| CV20 (en) | compact | 5 | 5 | 5 | — | — | 1 / 1 |

## 4. Nguyên nhân lỗi chính (rule-based)

- **Bỏ sót do từ điển** (`app/cv/skills.py` không có mục này): BLoC, Celery, Combine, Firebase, Objective-C, Redux, Scala, SwiftUI, WordPress — 10/11 lượt bỏ sót.
- **Bỏ sót dù có trong từ điển** (biến thể viết không khớp mẫu): Express.
- **Nhận thừa**: CI/CD ×1 — chủ yếu là kỹ năng được suy ra từ từ khoá chung (ví dụ cùng tên với kỹ năng khác) hoặc nhãn nháp không ghi.
- **Số năm kinh nghiệm sai**: không có.
- Rule-based không kiểm chứng ngữ cảnh: kỹ năng nhắc tới trong học vấn hay mô tả dự án đều được tính là kỹ năng.

**Sửa parser trong US-29** (có unit test ở `ai-service/tests/test_cv.py`): lần chạy đầu tiên số năm kinh nghiệm chỉ đúng ±1 ở 15/20 CV (F1 kỹ năng không đổi 0.962). Nguyên nhân: (1) CV hai cột bị trộn dòng làm tiêu đề "Kinh nghiệm" không còn đứng riêng một dòng ⇒ không nhận ra mục, trả null; (2) dòng học vấn lọt vào mục kinh nghiệm và bị cộng; (3) khoảng chỉ có năm "2023 - 2026" bị tính từ tháng 1 tới tháng 12 (= 4 năm). Đã sửa: không nhận ra mục kinh nghiệm thì xét mọi dòng, bỏ qua dòng học vấn (đại học, university...), khoảng chỉ có năm tính bằng hiệu số năm ⇒ 20/20.

**Lưu ý độ tin cậy**: CV trong bộ này do nhóm viết và phần lớn liệt kê kỹ năng bằng tên chuẩn, nên F1 rule-based nhiều khả năng **lạc quan** so với CV thật (viết tắt lạ, lỗi chính tả, kỹ năng nằm trong hình ảnh). Nên bổ sung CV thật đã ẩn danh khi có.

## 5. Cách chạy lại

```bash
python scripts/eval/cv/run_eval.py                              # rule-based; ghi docs/eval-cv.md
DEEPSEEK_API_KEY=sk-... python scripts/eval/cv/run_eval.py      # thêm DeepSeek
python scripts/eval/cv/make_cvs.py                              # chỉ khi sửa cv_data.py (cần fpdf2)
```

Kết quả từng CV: `scripts/eval/cv/results_<engine>.csv`.
