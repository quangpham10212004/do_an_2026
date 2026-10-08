# Đánh giá AI Matching (US-26 — PRD-AIM-1, PRD-AIM-3)

_Sinh tự động bởi `scripts/eval/matching/metrics.py --report` ngày 2026-10-08._

> **TẠM THỜI (PROVISIONAL).** Số liệu dưới đây tính từ nhãn nháp `draft_label` do người dựng bộ dữ liệu chấm (234 cặp draft, 0 cặp chỉ có 1 người chấm, 0 cặp đủ 2 người chấm). PRD yêu cầu nhãn của 2 người chấm: hai thành viên nhóm điền cột `rater1`, `rater2` trong `scripts/eval/matching/out/suggestions.csv` rồi chạy lại `metrics.py --report` — script tự dùng trung bình hai người chấm khi có.

## 1. Phương pháp

- **Dữ liệu chấm**: với mỗi mentee, top-10 gợi ý của pipeline production (`capture.py`) → `suggestions.csv`
  (`mentee, rank, mentor, score, rater1, rater2, draft_label`). Thang nhãn: 2 = rất phù hợp, 1 = phù hợp một
  phần, 0 = không phù hợp — chỉ xét **nội dung** (mentor có giúp đúng mục tiêu không), không xét giá/rating/lịch.
- **Nhãn dùng để tính**: trung bình rater1+rater2 khi có cả hai; một người chấm → nhãn người đó; chưa ai chấm → `draft_label`.
- **Precision@5**: tỉ lệ mentor liên quan (nhãn ≥ 1.5) trong 5 vị trí đầu.
  **NDCG@10**: gain `2^nhãn − 1`, chiết khấu `log2(hạng + 1)`, IDCG từ toàn bộ nhãn đã chấm của mentee. Báo cáo trung
  bình trên các mentee. Các hàm có unit test với ví dụ tính tay (`test_metrics.py`).
- **Pipeline**: `capture.py --source offline` chạy lại đúng code production của matching-service
  (`profile_text.normalize_*` → model → cosine trên vector chuẩn hoá → hard filter cùng lĩnh vực →
  `matching_pipeline.re_rank`) ngay trong tiến trình, nên không phụ thuộc dữ liệu e2e trong DB dùng chung.
  `--source api` (sau `seed_eval.py`) lấy thứ tự từ API thật để đối chiếu.
- **Biến thể**
  - (a) trọng số hiện tại: similarity 0.7, rating 0.2, kinh nghiệm 0.1 (mentor chưa có đánh giá nhận rating trung tính 3.5).
  - (b) trọng số mới (PRD-MATCH-3): similarity 0.6, rating 0.15, kinh nghiệm 0.1, **trùng lịch 0.15**. Tín hiệu
    trùng lịch = tỉ lệ ngày mentee muốn học mà mentor có khung rảnh giao với buổi mentee chọn (không khai báo → 1.0).
    **Tín hiệu thời gian phản hồi chưa tồn tại** (mentoring-service không tổng hợp thời gian phản hồi của mentor và
    không đẩy sang profile/matching) nên chưa đưa vào biến thể này.
  - (c) model: `paraphrase-multilingual-MiniLM-L12-v2` so với `all-MiniLM-L6-v2` trên tập mục tiêu tiếng Việt, cùng trọng số (a).
    Quy tắc đổi: chỉ khi NDCG@10 tăng ≥ 0.05. **Sprint này không đổi model production**, chỉ khuyến nghị.

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
có và không có sở thích lịch học). 234 cặp (mentee, mentor) được chấm.

## 3. Kết quả

| Biến thể | Tập | n | Precision@5 | NDCG@10 |
|---|---|---|---|---|
| (a) Trọng số hiện tại 0.7/0.2/0.1 | all | 30 | 0.233 | 0.914 |
| (a) Trọng số hiện tại 0.7/0.2/0.1 | vi | 17 | 0.247 | 0.891 |
| (a) Trọng số hiện tại 0.7/0.2/0.1 | en | 13 | 0.215 | 0.944 |
| (b) Trọng số mới 0.6/0.15/0.1 + trùng lịch 0.15 | all | 30 | 0.240 | 0.940 |
| (b) Trọng số mới 0.6/0.15/0.1 + trùng lịch 0.15 | vi | 17 | 0.259 | 0.929 |
| (b) Trọng số mới 0.6/0.15/0.1 + trùng lịch 0.15 | en | 13 | 0.215 | 0.955 |

| Model (trọng số production) | Tập | n | Precision@5 | NDCG@10 |
|---|---|---|---|---|
| all-MiniLM-L6-v2 | vi | 17 | 0.247 | 0.891 |
| all-MiniLM-L6-v2 | en | 13 | 0.215 | 0.944 |
| all-MiniLM-L6-v2 | all | 30 | 0.233 | 0.914 |
| paraphrase-multilingual-MiniLM-L12-v2 | vi | 17 | 0.271 | 0.912 |
| paraphrase-multilingual-MiniLM-L12-v2 | en | 13 | 0.215 | 0.944 |
| paraphrase-multilingual-MiniLM-L12-v2 | all | 30 | 0.247 | 0.926 |

Trần Precision@5 (xếp hạng lý tưởng theo nhãn) = **0.253** — mỗi mentee chỉ có 1–3 mentor
"rất phù hợp" trong pool nên Precision@5 không thể đạt 1; hãy so Precision@5 với trần này.

## 4. Khuyến nghị

- **Trọng số**: NDCG@10 (toàn bộ) của trọng số mới tăng 0.026 so với hiện tại. Tín hiệu trùng lịch không làm giảm độ liên quan nội dung; có thể bật sau khi có nhãn thật.
- **Model**: Trên tập mục tiêu tiếng Việt, NDCG@10 của paraphrase-multilingual-MiniLM-L12-v2 cao hơn all-MiniLM-L6-v2 0.021 (ngưỡng đổi ≥ 0.05). Khuyến nghị: CHƯA chuyển model.
- Nhãn nháp chỉ xét nội dung nên tín hiệu trùng lịch không thể làm tăng điểm theo nhãn; giá trị của nó (giảm yêu cầu
  bị từ chối vì lệch lịch) cần đo bằng tỉ lệ chấp nhận yêu cầu trên dữ liệu thật.
- Các kết luận trên phải được xác nhận lại sau khi có nhãn rater1/rater2.

Đối chiếu với hệ thống thật (`seed_eval.py` + `capture.py --source api`, chạy ngày 2026-10-08 trên stack docker
dùng chung): NDCG@10 (a) 0.925 / (b) 0.953 — cùng xu hướng với bản offline. Bản API chỉ có 191/234 cặp vì DB dùng
chung chứa hàng trăm mentor e2e lĩnh vực `backend` đẩy một số mentor đánh giá ra ngoài `limit=50`; vì vậy bản
offline (tách biệt, tất định) là nguồn số liệu chính của báo cáo.

## 5. Tái lập

```bash
pip install -r matching-service/requirements.txt          # sentence-transformers (+ asyncpg/starlette để import code)
python3 scripts/eval/matching/capture.py                   # offline: 2 model, ghi out/suggestions.csv + features.csv
python3 scripts/eval/matching/metrics.py --report docs/eval-matching.md
# Tuỳ chọn, đối chiếu với hệ thống đang chạy:
python3 scripts/eval/matching/seed_eval.py && python3 scripts/eval/matching/capture.py --source api --out /tmp/eval-api
python3 -m pytest scripts/eval/matching/test_metrics.py
```
