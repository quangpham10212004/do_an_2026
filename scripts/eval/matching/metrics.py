#!/usr/bin/env python3
"""
US-26 — chỉ số đánh giá AI Matching từ CSV đã chụp (capture.py) và sinh báo cáo scripts/eval/matching/out/report.md.

Bốn cấu hình re-ranking: similarity; thêm rating; thêm kinh nghiệm; đủ 5 tín hiệu với trùng lịch và phản hồi.
So sánh thêm model đa ngôn ngữ khi dữ liệu có cả hai model, với cùng trọng số production.

Nhãn: mean(rater1, rater2) nếu đủ hai người chấm; một người => nhãn người đó; chưa ai chấm => draft_label (khi đó
mọi số liệu là TẠM THỜI). Thang 0/1/2. Precision@5: mentor "liên quan" khi nhãn ≥ 1.5. NDCG@10: gain = 2^nhãn - 1,
chiết khấu log2(rank + 1), IDCG từ toàn bộ nhãn của mentee đó.

    python3 scripts/eval/matching/metrics.py                       # in bảng
    python3 scripts/eval/matching/metrics.py --report scripts/eval/matching/out/report.md
"""
import argparse
import csv
import math
import pathlib
import sys
from datetime import date

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE))

RELEVANT_THRESHOLD = 1.5
SWITCH_MIN_GAIN = 0.05
CURRENT_WEIGHTS = {"similarity": 0.60, "rating": 0.15, "experience": 0.10, "schedule": 0.10, "responsiveness": 0.05}
VARIANTS = {
    "similarity": ("Similarity (1.0)", {"similarity": 1.0}),
    "similarity_rating": ("+ Rating (0.8 / 0.2)", {"similarity": 0.8, "rating": 0.2}),
    "similarity_rating_experience": ("+ Kinh nghiệm (0.7 / 0.2 / 0.1)",
                                      {"similarity": 0.7, "rating": 0.2, "experience": 0.1}),
    "full": ("Đủ 5 tín hiệu (0.60 / 0.15 / 0.10 / 0.10 / 0.05)", CURRENT_WEIGHTS),
}
NEUTRAL_RATING = 3.5
MIN_REVIEWS = 3
NEUTRAL_RESPONSIVENESS = 0.5
MAX_YEARS = 10


# ---------------------------------------------------------------- hàm thuần (có unit test)

def _num(value) -> float | None:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    return float(s)


def resolve_label(rater1, rater2, draft) -> tuple[float, str]:
    """(nhãn, nguồn): trung bình 2 người chấm > 1 người chấm > draft_label."""
    r1, r2 = _num(rater1), _num(rater2)
    if any(r is not None and r not in (0, 1, 2) for r in (r1, r2)):
        raise ValueError("Nhãn rater phải thuộc thang 0/1/2")
    if r1 is not None and r2 is not None:
        return (r1 + r2) / 2, "raters"
    if r1 is not None or r2 is not None:
        return (r1 if r1 is not None else r2), "one_rater"
    return float(_num(draft) or 0.0), "draft"


def precision_at_k(labels: list[float], k: int, threshold: float = RELEVANT_THRESHOLD) -> float:
    """Tỉ lệ mục liên quan (nhãn ≥ threshold) trong k vị trí đầu; danh sách ngắn hơn k vẫn chia cho k."""
    if k <= 0:
        raise ValueError("k phải > 0")
    return sum(1 for x in labels[:k] if x >= threshold) / k


def dcg_at_k(labels: list[float], k: int) -> float:
    return sum((2 ** rel - 1) / math.log2(i + 2) for i, rel in enumerate(labels[:k]))


def ndcg_at_k(ranked: list[float], all_labels: list[float], k: int) -> float:
    """NDCG@k; IDCG tính từ toàn bộ nhãn đã chấm của mentee (sắp giảm dần). Không có mục liên quan => 0."""
    ideal = dcg_at_k(sorted(all_labels, reverse=True), k)
    return 0.0 if ideal == 0 else dcg_at_k(ranked, k) / ideal


def weighted_score(f: dict, w: dict) -> float:
    """Tổng điểm trên cùng bộ đặc trưng, với trọng số của biến thể đang xét."""
    sim = max(0.0, min(1.0, float(f["similarity"])))
    rating = _num(f.get("rating_used"))
    if rating is None:
        rating = float(f["rating"]) if int(f["rating_count"]) >= MIN_REVIEWS else NEUTRAL_RATING
    exp = min(max(int(f["years_experience"]), 0) / MAX_YEARS, 1.0)
    responsive = _num(f.get("responsiveness"))
    if responsive is None:
        responsive = NEUTRAL_RESPONSIVENESS
    return (w["similarity"] * sim + w.get("rating", 0) * (rating / 5) + w.get("experience", 0) * exp
            + w.get("schedule", 0) * float(f.get("availability_overlap") or 0)
            + w.get("responsiveness", 0) * responsive)


def rank_by(features: list[dict], w: dict) -> list[str]:
    """Mentor theo điểm giảm dần (hoà điểm: giữ thứ tự mentor key để tất định)."""
    ordered = sorted(features, key=lambda f: (-round(weighted_score(f, w), 4), f["mentor"]))
    return [f["mentor"] for f in ordered]


def mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


# ---------------------------------------------------------------- đọc dữ liệu + tính

def load(out: pathlib.Path):
    with (out / "suggestions.csv").open(encoding="utf-8") as fh:
        suggestions = list(csv.DictReader(fh))
    with (out / "features.csv").open(encoding="utf-8") as fh:
        features = list(csv.DictReader(fh))
    return suggestions, features


def evaluate(suggestions: list[dict], features: list[dict]) -> dict:
    import dataset
    langs = {e["key"]: e["goal_language"] for e in dataset.mentee_dicts()}
    labels: dict[str, dict[str, float]] = {}
    sources = {"raters": 0, "one_rater": 0, "draft": 0}
    for r in suggestions:
        lab, src = resolve_label(r.get("rater1"), r.get("rater2"), r.get("draft_label"))
        labels.setdefault(r["mentee"], {})[r["mentor"]] = lab
        sources[src] += 1
    models = list(dict.fromkeys(f["model"] for f in features))
    feats: dict[tuple[str, str], list[dict]] = {}
    for f in features:
        feats.setdefault((f["model"], f["mentee"]), []).append(f)
    cur_model = models[0]  # capture.py ghi model production trước
    comparison_model = models[1] if len(models) > 1 else None

    def scores(ranking: dict[str, list[str]], mentees: list[str]) -> dict:
        p5, n10 = [], []
        for e in mentees:
            judged = labels[e]
            ranked = [judged.get(m, 0.0) for m in ranking[e]]  # mentor chưa chấm => 0 (an toàn)
            p5.append(precision_at_k(ranked, 5))
            n10.append(ndcg_at_k(ranked, list(judged.values()), 10))
        return {"p5": mean(p5), "ndcg10": mean(n10), "n": len(mentees), "per": dict(zip(mentees, n10))}

    all_m = sorted(labels)
    subsets = {"all": all_m, "vi": [e for e in all_m if langs[e] == "vi"], "en": [e for e in all_m if langs[e] == "en"]}
    res = {"sources": sources, "current_model": cur_model, "variants": {}, "models": {}}
    for name, (_, weights) in VARIANTS.items():
        ranking = {e: rank_by(feats[(cur_model, e)], weights) for e in all_m}
        res["variants"][name] = {s: scores(ranking, ms) for s, ms in subsets.items()}
    if comparison_model:
        for model in (cur_model, comparison_model):
            ranking = {e: rank_by(feats[(model, e)], CURRENT_WEIGHTS) for e in all_m}
            res["models"][model] = {s: scores(ranking, ms) for s, ms in subsets.items()}
    # Trần Precision@5: số mentor liên quan của mỗi mentee có hạn (thường 1–3) nên P@5 tối đa < 1.
    res["p5_ceiling"] = mean([precision_at_k(sorted(labels[e].values(), reverse=True), 5) for e in all_m])
    res["n_pairs"] = len(suggestions)
    res["n_mentees"] = len(all_m)
    return res


def fmt(x: float) -> str:
    return f"{x:.3f}"


def tables(res: dict) -> str:
    v = res["variants"]
    lines = ["| Biến thể | Tập | n | Precision@5 | NDCG@10 |", "|---|---|---|---|---|"]
    for name, (label, _) in VARIANTS.items():
        for s in ("all", "vi", "en"):
            x = v[name][s]
            lines.append(f"| {label} | {s} | {x['n']} | {fmt(x['p5'])} | {fmt(x['ndcg10'])} |")
    out = "\n".join(lines)
    if res["models"]:
        rows = ["| Model (trọng số production) | Tập | n | Precision@5 | NDCG@10 |", "|---|---|---|---|---|"]
        for model, x in res["models"].items():
            for s in ("vi", "en", "all"):
                rows.append(f"| {model} | {s} | {x[s]['n']} | {fmt(x[s]['p5'])} | {fmt(x[s]['ndcg10'])} |")
        out += "\n\n" + "\n".join(rows)
    return out


def recommendation(res: dict) -> tuple[str, str]:
    """(khuyến nghị trọng số, khuyến nghị model)."""
    variants = res["variants"]
    best = max(VARIANTS, key=lambda name: variants[name]["all"]["ndcg10"])
    d_w = variants["full"]["all"]["ndcg10"] - variants["similarity_rating_experience"]["all"]["ndcg10"]
    weights = (f"Cấu hình có NDCG@10 cao nhất trên tập all là {VARIANTS[best][0]} "
               f"({fmt(variants[best]['all']['ndcg10'])}). Chênh lệch giữa cấu hình đủ 5 tín hiệu và cấu hình "
               f"3 tín hiệu là {d_w:+.3f}.")
    if not res["models"] or not res["models"][res["current_model"]]["vi"]["n"]:
        return weights, "Cần kết quả của cả hai model trên tập tiếng Việt để áp dụng ngưỡng chuyển model."
    cur, comparison = res["models"]
    d_m = res["models"][comparison]["vi"]["ndcg10"] - res["models"][cur]["vi"]["ndcg10"]
    model = (f"Trên tập mục tiêu tiếng Việt, chênh lệch NDCG@10 của {comparison} so với {cur} là {d_m:+.3f}. "
             f"Ngưỡng tăng để cân nhắc chuyển từ model hiện tại là {SWITCH_MIN_GAIN}.")
    return weights, model


def label_sources(sources: dict) -> str:
    return "Nguồn nhãn: " + ", ".join(f"{name}: {count}" for name, count in sources.items() if count or name == "raters")


def report(res: dict) -> str:
    import dataset
    mentees = dataset.mentee_dicts()
    mentors = dataset.mentor_dicts()
    by_domain = {}
    for m in mentors:
        by_domain.setdefault(m["domain"], [0, 0])[0] += 1
    for e in mentees:
        by_domain.setdefault(e["domain"], [0, 0])[1] += 1
    src = res["sources"]
    provisional = src["draft"] > 0 or src["one_rater"] > 0
    w_rec, m_rec = recommendation(res)
    domain_rows = "\n".join(f"| {d} | {c[0]} | {c[1]} |" for d, c in sorted(by_domain.items()))
    vi = sum(1 for e in mentees if e["goal_language"] == "vi")
    notice = f"> {label_sources(src)}."
    if provisional:
        notice += ("\n> **TẠM THỜI (PROVISIONAL).** Cần hai người chấm độc lập cho mỗi cặp để xác nhận kết quả. "
                   "`matching-service/labels.json` dùng mã UUID và một trường `grade` cho bộ đánh giá embedding riêng.")
    return f"""# Đánh giá AI Matching (US-26 — PRD-AIM-1, PRD-AIM-3)

_Sinh tự động bởi `scripts/eval/matching/metrics.py --report` ngày {date.today().isoformat()}._

{notice}

## 1. Phương pháp

- Mỗi người chấm dùng một bản riêng của CSV xuất qua `capture.py --rater-sheet`, dựa trên `mentee_goal` và
  `mentor_skills`. Thang nhãn 2 = rất phù hợp, 1 = phù hợp một phần, 0 = không phù hợp.
  Ghép nhãn vào `rater1` và `rater2` trong `suggestions.csv` theo cặp mã `mentee`, `mentor`.
- **Nhãn dùng để tính**: trung bình rater1+rater2 khi có cả hai; một người chấm → nhãn người đó; chưa ai chấm → `draft_label`.
- **Precision@5**: tỉ lệ mentor liên quan (nhãn ≥ {RELEVANT_THRESHOLD}) trong 5 vị trí đầu.
  **NDCG@10**: gain `2^nhãn − 1`, chiết khấu `log2(hạng + 1)`, IDCG từ toàn bộ nhãn đã chấm của mentee. Báo cáo trung
  bình trên các mentee. Các hàm có unit test với ví dụ tính tay (`test_metrics.py`).
- Bản offline dùng chuẩn hoá văn bản và `matching_pipeline.re_rank` của matching-service trên bộ dữ liệu mẫu.
  Trùng lịch lấy từ lịch mẫu hằng tuần, bằng tỉ lệ ngày có khung rảnh giao với buổi mentee muốn học
  (chưa khai báo sở thích → 1.0). Mentor có dưới 3 đánh giá dùng mức fallback 3.5 trong bản offline.
  Thời gian phản hồi là dữ liệu giả lập theo mentor. Hàm production cho điểm 1 nếu trung vị ≤ 24 giờ,
  0.5 nếu trung vị > 24 và ≤ 72 giờ, 0 nếu > 72 giờ và 0.5 khi thiếu dữ liệu.
  Bản `--source api` lưu thứ hạng API trong `suggestions.csv`. Bảng ablation tính lại thứ hạng từ
  tín hiệu trả về trong `features.csv` với cùng bốn cấu hình.
- Cả bốn cấu hình dùng cùng embedding (`{res['current_model']}`) và tập ứng viên, với các tín hiệu lần lượt là similarity,
  rating, kinh nghiệm, trùng lịch và thời gian phản hồi. Bảng so model dùng cấu hình đủ 5 tín hiệu
  cho cả hai model khi có dữ liệu. Ngưỡng so model trên tập tiếng Việt là NDCG@10 tăng ≥ {SWITCH_MIN_GAIN}.

## 2. Bộ dữ liệu

Pool mentor riêng cho đánh giá (`scripts/eval/matching/dataset.py`, seed vào hệ thống bằng `seed_eval.py`) —
`seed_demo.py` chỉ có 6 mentor đã duyệt, quá ít để đo NDCG@10. Mỗi lĩnh vực ≤ 10 mentor nên top-10 luôn là toàn bộ
pool hợp lệ cùng lĩnh vực: mọi biến thể chỉ hoán vị cùng một tập và mọi cặp đều có nhãn.

| Lĩnh vực | Mentor | Mentee |
|---|---|---|
{domain_rows}

{len(mentees)} mentee ({vi} mục tiêu tiếng Việt, {len(mentees) - vi} tiếng Anh; trình độ BEGINNER/INTERMEDIATE/ADVANCED;
có và không có sở thích lịch học). Bộ dữ liệu có {res['n_pairs']} cặp mentee–mentor.

## 3. Kết quả

{tables(res)}

Trần Precision@5 trên bộ nhãn hiện tại là **{fmt(res['p5_ceiling'])}**, tính bằng cách xếp hạng lý tưởng
cho từng mentee.

## 4. Diễn giải

- **Trọng số**: {w_rec}
- **Model**: {m_rec}
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
"""


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", default=str(HERE / "out"), help="thư mục chứa suggestions.csv + features.csv")
    parser.add_argument("--report", help="ghi báo cáo markdown (vd. scripts/eval/matching/out/report.md)")
    args = parser.parse_args(argv)
    res = evaluate(*load(pathlib.Path(args.out)))
    print(tables(res))
    for line in recommendation(res):
        print("- " + line)
    print(label_sources(res["sources"]))
    if args.report:
        path = pathlib.Path(args.report)
        if not path.is_absolute():
            path = ROOT / path
        path.write_text(report(res), encoding="utf-8")
        print(f"Đã ghi báo cáo → {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
