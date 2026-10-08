# Kết quả đánh giá AI Matching

Dữ liệu: 36 mentor (30 đủ điều kiện, 6 bẫy không đủ điều kiện), 40 mentee (4 phong cách viết × 10 topic). Nhãn: 3 cùng topic, 2 topic liên quan, 0 còn lại / không đủ điều kiện. Top-K retrieval = 15. Chỉ số trung bình trên 40 truy vấn.

- **NDCG@5**: chất lượng thứ hạng có trọng số theo mức phù hợp.  **P@3**: tỷ lệ mentor phù hợp (nhãn ≥ 2) trong top 3.
- **MRR**: nghịch đảo thứ hạng của mentor đúng topic đầu tiên.  **Vi phạm@5**: tỷ lệ mentor KHÔNG đủ điều kiện trong top 5 (thấp là tốt).

## 1. So sánh model embedding

| Model | Cấu hình | NDCG@5 | P@3 | MRR | Vi phạm@5 | ms/văn bản |
|---|---|---|---|---|---|---|
| all-MiniLM-L6-v2 | vector | 0.712 | 0.683 | 0.834 | 0.170 | 13.3 |
| all-MiniLM-L6-v2 | pipeline | 0.924 | 0.992 | 0.975 | 0.000 | 13.3 |
| paraphrase-multilingual-MiniLM-L12-v2 | vector | 0.840 | 0.858 | 0.913 | 0.100 | 26.9 |
| paraphrase-multilingual-MiniLM-L12-v2 | pipeline | 0.921 | 0.992 | 0.988 | 0.000 | 26.9 |
| intfloat/multilingual-e5-small | vector | 0.840 | 0.800 | 0.988 | 0.135 | 27.4 |
| intfloat/multilingual-e5-small | pipeline | 0.882 | 1.000 | 0.896 | 0.000 | 27.4 |

## 2. Ablation — all-MiniLM-L6-v2

| Cấu hình | NDCG@5 | P@3 | MRR | Vi phạm@5 |
|---|---|---|---|---|
| keyword | 0.774 | 0.758 | 0.915 | 0.110 |
| vector | 0.712 | 0.683 | 0.834 | 0.170 |
| hybrid | 0.815 | 0.800 | 0.929 | 0.130 |
| vector+filter | 0.919 | 0.992 | 0.969 | 0.000 |
| pipeline | 0.924 | 0.992 | 0.975 | 0.000 |
| hybrid+filter | 0.928 | 1.000 | 0.975 | 0.000 |
| hybrid+pipeline | 0.928 | 1.000 | 0.975 | 0.000 |

## 2. Ablation — paraphrase-multilingual-MiniLM-L12-v2

| Cấu hình | NDCG@5 | P@3 | MRR | Vi phạm@5 |
|---|---|---|---|---|
| keyword | 0.774 | 0.758 | 0.915 | 0.110 |
| vector | 0.840 | 0.858 | 0.913 | 0.100 |
| hybrid | 0.842 | 0.850 | 0.919 | 0.120 |
| vector+filter | 0.920 | 0.992 | 0.981 | 0.000 |
| pipeline | 0.921 | 0.992 | 0.988 | 0.000 |
| hybrid+filter | 0.928 | 1.000 | 0.988 | 0.000 |
| hybrid+pipeline | 0.927 | 1.000 | 0.988 | 0.000 |

## 2. Ablation — intfloat/multilingual-e5-small

| Cấu hình | NDCG@5 | P@3 | MRR | Vi phạm@5 |
|---|---|---|---|---|
| keyword | 0.774 | 0.758 | 0.915 | 0.110 |
| vector | 0.840 | 0.800 | 0.988 | 0.135 |
| hybrid | 0.847 | 0.817 | 0.955 | 0.120 |
| vector+filter | 0.931 | 1.000 | 1.000 | 0.000 |
| pipeline | 0.882 | 1.000 | 0.896 | 0.000 |
| hybrid+filter | 0.936 | 1.000 | 1.000 | 0.000 |
| hybrid+pipeline | 0.885 | 1.000 | 0.908 | 0.000 |

## 3. NDCG@5 theo phong cách viết của mentee (vector thuần)

| Cấu hình | Có dấu | Không dấu | Việt–Anh | Mơ hồ |
|---|---|---|---|---|
| keyword (BM25) | 0.855 | 0.822 | 0.809 | 0.612 |
| all-MiniLM-L6-v2 | 0.779 | 0.819 | 0.801 | 0.447 |
| paraphrase-multilingual-MiniLM-L12-v2 | 0.890 | 0.848 | 0.848 | 0.773 |
| intfloat/multilingual-e5-small | 0.882 | 0.839 | 0.872 | 0.768 |
