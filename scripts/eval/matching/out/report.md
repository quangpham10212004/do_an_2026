# Đánh giá AI Matching (US-26 — PRD-AIM-1, PRD-AIM-3)

_Sinh tự động bởi `scripts/eval/matching/metrics.py --report` ngày 2026-11-27._

> Nguồn nhãn: raters: 0, draft: 234.
> **TẠM THỜI (PROVISIONAL).** Cần hai người chấm độc lập cho mỗi cặp để xác nhận kết quả. `matching-service/labels.json` dùng mã UUID và một trường `grade` cho bộ đánh giá embedding riêng.

## 1. Phương pháp

- Mỗi người chấm dùng một bản riêng của CSV xuất qua `capture.py --rater-sheet`, dựa trên `mentee_goal` và
  `mentor_skills`. Thang nhãn 2 = rất phù hợp, 1 = phù hợp một phần, 0 = không phù hợp.
  Ghép nhãn vào `rater1` và `rater2` trong `suggestions.csv` theo cặp mã `mentee`, `mentor`.
- **Nhãn dùng để tính**: trung bình rater1+rater2 khi có cả hai; một người chấm → nhãn người đó; chưa ai chấm → `draft_label`.
- **Precision@5**: tỉ lệ mentor liên quan (nhãn ≥ 1.5) trong 5 vị trí đầu.
  **NDCG@10**: gain `2^nhãn − 1`, chiết khấu `log2(hạng + 1)`, IDCG từ toàn bộ nhãn đã chấm của mentee. Báo cáo trung
  bình trên các mentee. Các hàm có unit test với ví dụ tính tay (`test_metrics.py`).
- Bản offline dùng chuẩn hoá văn bản và `matching_pipeline.re_rank` của matching-service trên bộ dữ liệu mẫu.
  Trùng lịch lấy từ lịch mẫu hằng tuần, bằng tỉ lệ ngày có khung rảnh giao với buổi mentee muốn học
  (chưa khai báo sở thích → 1.0). Mentor có dưới 3 đánh giá dùng mức fallback 3.5 trong bản offline.
  Thời gian phản hồi là dữ liệu giả lập theo mentor. Hàm production cho điểm 1 nếu trung vị ≤ 24 giờ,
  0.5 nếu trung vị > 24 và ≤ 72 giờ, 0 nếu > 72 giờ và 0.5 khi thiếu dữ liệu.
  Bản `--source api` lưu thứ hạng API trong `suggestions.csv`. Bảng ablation tính lại thứ hạng từ
  tín hiệu trả về trong `features.csv` với cùng bốn cấu hình.
- Cả bốn cấu hình dùng cùng embedding (`paraphrase-multilingual-MiniLM-L12-v2`) và tập ứng viên, với các tín hiệu lần lượt là similarity,
  rating, kinh nghiệm, trùng lịch và thời gian phản hồi. Bảng so model dùng cấu hình đủ 5 tín hiệu
  cho cả hai model khi có dữ liệu. Ngưỡng so model trên tập tiếng Việt là NDCG@10 tăng ≥ 0.05.

## 2. Bộ dữ liệu

Pool mentor riêng cho đánh giá (`scripts/eval/matching/dataset.py`, seed vào hệ thống bằng `seed_eval.py`) —
`seed_demo.py` chỉ có 6 mentor đã duyệt, quá ít để đo NDCG@10. Mỗi lĩnh vực ≤ 10 mentor nên top-10 luôn là toàn bộ
pool hợp lệ cùng lĩnh vực: mọi biến thể chỉ hoán vị cùng một tập và mọi cặp đều có nhãn.

| Lĩnh vực | Mentor | Mentee |
|---|---|---|
| backend | 10 | 9 |
| data | 8 | 6 |
| devops | 6 | 5 |
| frontend | 7 | 6 |
| mobile | 6 | 4 |

30 mentee (17 mục tiêu tiếng Việt, 13 tiếng Anh; trình độ BEGINNER/INTERMEDIATE/ADVANCED;
có và không có sở thích lịch học). Bộ dữ liệu có 234 cặp mentee–mentor.

## 3. Kết quả

| Biến thể | Tập | n | Precision@5 | NDCG@10 |
|---|---|---|---|---|
| Similarity (1.0) | all | 30 | 0.253 | 0.932 |
| Similarity (1.0) | vi | 17 | 0.282 | 0.919 |
| Similarity (1.0) | en | 13 | 0.215 | 0.949 |
| + Rating (0.8 / 0.2) | all | 30 | 0.247 | 0.936 |
| + Rating (0.8 / 0.2) | vi | 17 | 0.271 | 0.927 |
| + Rating (0.8 / 0.2) | en | 13 | 0.215 | 0.948 |
| + Kinh nghiệm (0.7 / 0.2 / 0.1) | all | 30 | 0.247 | 0.926 |
| + Kinh nghiệm (0.7 / 0.2 / 0.1) | vi | 17 | 0.271 | 0.912 |
| + Kinh nghiệm (0.7 / 0.2 / 0.1) | en | 13 | 0.215 | 0.944 |
| Đủ 5 tín hiệu (0.60 / 0.15 / 0.10 / 0.10 / 0.05) | all | 30 | 0.247 | 0.939 |
| Đủ 5 tín hiệu (0.60 / 0.15 / 0.10 / 0.10 / 0.05) | vi | 17 | 0.271 | 0.930 |
| Đủ 5 tín hiệu (0.60 / 0.15 / 0.10 / 0.10 / 0.05) | en | 13 | 0.215 | 0.951 |

| Model (trọng số production) | Tập | n | Precision@5 | NDCG@10 |
|---|---|---|---|---|
| paraphrase-multilingual-MiniLM-L12-v2 | vi | 17 | 0.271 | 0.930 |
| paraphrase-multilingual-MiniLM-L12-v2 | en | 13 | 0.215 | 0.951 |
| paraphrase-multilingual-MiniLM-L12-v2 | all | 30 | 0.247 | 0.939 |
| all-MiniLM-L6-v2 | vi | 17 | 0.259 | 0.937 |
| all-MiniLM-L6-v2 | en | 13 | 0.215 | 0.958 |
| all-MiniLM-L6-v2 | all | 30 | 0.240 | 0.946 |

Trần Precision@5 trên bộ nhãn hiện tại là **0.253**, tính bằng cách xếp hạng lý tưởng
cho từng mentee.

## 4. Diễn giải

- **Trọng số**: Cấu hình có NDCG@10 cao nhất trên tập all là Đủ 5 tín hiệu (0.60 / 0.15 / 0.10 / 0.10 / 0.05) (0.939). Chênh lệch giữa cấu hình đủ 5 tín hiệu và cấu hình 3 tín hiệu là +0.014.
- **Model**: Trên tập mục tiêu tiếng Việt, chênh lệch NDCG@10 của all-MiniLM-L6-v2 so với paraphrase-multilingual-MiniLM-L12-v2 là +0.007. Ngưỡng tăng để cân nhắc chuyển từ model hiện tại là 0.05.
- Các nhãn đo độ phù hợp giữa mục tiêu và kỹ năng. Tác động của lịch và thời gian phản hồi lên hành vi
  đặt lịch cần được đo trên dữ liệu sử dụng thực tế.

## 5. Tái lập

```bash
pip install -r matching-service/requirements.txt          # sentence-transformers (+ asyncpg/starlette để import code)
python3 scripts/eval/matching/capture.py
python3 scripts/eval/matching/metrics.py --report scripts/eval/matching/out/report.md
# Tuỳ chọn, đối chiếu với hệ thống đang chạy:
python3 scripts/eval/matching/seed_eval.py && python3 scripts/eval/matching/capture.py --source api --out /tmp/eval-api
# Tuỳ chọn, xuất phiếu chấm trống sang đường dẫn mới:
python3 scripts/eval/matching/capture.py --rater-sheet /tmp/matching-rater-sheet.csv
python3 -m pytest scripts/eval/matching/test_metrics.py
```
