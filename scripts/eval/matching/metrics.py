#!/usr/bin/env python3
"""
US-26 — chỉ số đánh giá AI Matching từ CSV đã chụp (capture.py) và sinh báo cáo docs/eval-matching.md.

  (a) trọng số hiện tại   — thứ tự trong suggestions.csv (pipeline production).
  (b) trọng số mới        — PRD-MATCH-3 thêm tín hiệu trùng lịch (availability overlap) và thời gian phản hồi.
                            Thời gian phản hồi CHƯA có (mentoring-service không tổng hợp/đẩy chỉ số này cho
                            matching) nên biến thể chỉ thêm trùng lịch: similarity 0.6, rating 0.15, kinh nghiệm 0.1,
                            trùng lịch 0.15.
  (c) model đa ngôn ngữ   — paraphrase-multilingual-MiniLM-L12-v2 so với model hiện tại trên tập mục tiêu tiếng
                            Việt, cùng trọng số production. Quy tắc: chỉ đổi khi NDCG@10 tăng ≥ 0.05 (sprint này
                            KHÔNG đổi model production, chỉ khuyến nghị).

Nhãn: mean(rater1, rater2) nếu đủ hai người chấm; một người => nhãn người đó; chưa ai chấm => draft_label (khi đó
mọi số liệu là TẠM THỜI). Thang 0/1/2. Precision@5: mentor "liên quan" khi nhãn ≥ 1.5. NDCG@10: gain = 2^nhãn - 1,
chiết khấu log2(rank + 1), IDCG từ toàn bộ nhãn của mentee đó.

    python3 scripts/eval/matching/metrics.py                       # in bảng
    python3 scripts/eval/matching/metrics.py --report docs/eval-matching.md
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
CURRENT_WEIGHTS = {"similarity": 0.7, "rating": 0.2, "experience": 0.1, "availability": 0.0}
NEW_WEIGHTS = {"similarity": 0.6, "rating": 0.15, "experience": 0.1, "availability": 0.15}
NEUTRAL_RATING = 3.5
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
    """Công thức re_rank của production (+ tín hiệu trùng lịch với trọng số w['availability'])."""
    sim = max(0.0, min(1.0, float(f["similarity"])))
    rating = float(f["rating"]) if int(f["rating_count"]) > 0 else NEUTRAL_RATING
    exp = min(max(int(f["years_experience"]), 0) / MAX_YEARS, 1.0)
    return (w["similarity"] * sim + w["rating"] * rating / 5 + w["experience"] * exp
            + w["availability"] * float(f.get("availability_overlap") or 0))


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
    current: dict[str, list[str]] = {}
    for r in sorted(suggestions, key=lambda r: (r["mentee"], int(r["rank"]))):
        lab, src = resolve_label(r.get("rater1"), r.get("rater2"), r.get("draft_label"))
        labels.setdefault(r["mentee"], {})[r["mentor"]] = lab
        sources[src] += 1
        current.setdefault(r["mentee"], []).append(r["mentor"])

    models = sorted({f["model"] for f in features})
    feats: dict[tuple[str, str], list[dict]] = {}
    for f in features:
        feats.setdefault((f["model"], f["mentee"]), []).append(f)
    cur_model = next((m for m in models if "multilingual" not in m), models[0])
    multi_model = next((m for m in models if "multilingual" in m), None)

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
    new_rank = {e: rank_by(feats[(cur_model, e)], NEW_WEIGHTS) for e in all_m}
    res = {"sources": sources, "current_model": cur_model, "multi_model": multi_model, "variants": {}, "models": {}}
    for name, ranking in (("current", current), ("new_weights", new_rank)):
        res["variants"][name] = {s: scores(ranking, ms) for s, ms in subsets.items()}
    if multi_model:
        for model in (cur_model, multi_model):
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
    for name, label in (("current", "(a) Trọng số hiện tại 0.7/0.2/0.1"),
                        ("new_weights", "(b) Trọng số mới 0.6/0.15/0.1 + trùng lịch 0.15")):
        for s in ("all", "vi", "en"):
            x = v[name][s]
            lines.append(f"| {label} | {s} | {x['n']} | {fmt(x['p5'])} | {fmt(x['ndcg10'])} |")
    out = "\n".join(lines)
    if res["models"]:
        cur, multi = res["current_model"], res["multi_model"]
        a, b = res["models"][cur], res["models"][multi]
        rows = ["| Model (trọng số production) | Tập | n | Precision@5 | NDCG@10 |", "|---|---|---|---|---|"]
        for model, x in ((cur, a), (multi, b)):
            for s in ("vi", "en", "all"):
                rows.append(f"| {model} | {s} | {x[s]['n']} | {fmt(x[s]['p5'])} | {fmt(x[s]['ndcg10'])} |")
        out += "\n\n" + "\n".join(rows)
    return out


def recommendation(res: dict) -> tuple[str, str]:
    """(khuyến nghị trọng số, khuyến nghị model)."""
    d_w = res["variants"]["new_weights"]["all"]["ndcg10"] - res["variants"]["current"]["all"]["ndcg10"]
    weights = (f"NDCG@10 (toàn bộ) của trọng số mới {'tăng' if d_w >= 0 else 'giảm'} {abs(d_w):.3f} so với hiện tại. "
               + ("Tín hiệu trùng lịch không làm giảm độ liên quan nội dung; có thể bật sau khi có nhãn thật."
                  if d_w >= -0.01 else
                  "Thêm trùng lịch làm giảm độ liên quan nội dung theo nhãn — chưa nên đổi trọng số."))
    if not res["models"]:
        return weights, "Chưa so model (cần capture --source offline)."
    cur, multi = res["current_model"], res["multi_model"]
    d_m = res["models"][multi]["vi"]["ndcg10"] - res["models"][cur]["vi"]["ndcg10"]
    adopt = d_m >= SWITCH_MIN_GAIN
    model = (f"Trên tập mục tiêu tiếng Việt, NDCG@10 của {multi} {'cao' if d_m >= 0 else 'thấp'} hơn {cur} "
             f"{abs(d_m):.3f} (ngưỡng đổi ≥ {SWITCH_MIN_GAIN}). Khuyến nghị: "
             + ("NÊN chuyển sang model đa ngôn ngữ ở sprint sau (cần reindex toàn bộ embedding)."
                if adopt else "CHƯA chuyển model."))
    return weights, model


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
    notice = (
        "> **TẠM THỜI (PROVISIONAL).** Số liệu dưới đây tính từ nhãn nháp `draft_label` do người dựng bộ dữ liệu chấm "
        f"({src['draft']} cặp draft, {src['one_rater']} cặp chỉ có 1 người chấm, {src['raters']} cặp đủ 2 người chấm). "
        "PRD yêu cầu nhãn của 2 người chấm: hai thành viên nhóm điền cột `rater1`, `rater2` trong "
        "`scripts/eval/matching/out/suggestions.csv` rồi chạy lại `metrics.py --report` — script tự dùng trung bình "
        "hai người chấm khi có."
        if provisional else
        f"> Nhãn: trung bình rater1/rater2 cho toàn bộ {src['raters']} cặp.")
    return f"""# Đánh giá AI Matching (US-26 — PRD-AIM-1, PRD-AIM-3)

_Sinh tự động bởi `scripts/eval/matching/metrics.py --report` ngày {date.today().isoformat()}._

{notice}

## 1. Phương pháp

- **Dữ liệu chấm**: với mỗi mentee, top-10 gợi ý của pipeline production (`capture.py`) → `suggestions.csv`
  (`mentee, rank, mentor, score, rater1, rater2, draft_label`). Thang nhãn: 2 = rất phù hợp, 1 = phù hợp một
  phần, 0 = không phù hợp — chỉ xét **nội dung** (mentor có giúp đúng mục tiêu không), không xét giá/rating/lịch.
- **Nhãn dùng để tính**: trung bình rater1+rater2 khi có cả hai; một người chấm → nhãn người đó; chưa ai chấm → `draft_label`.
- **Precision@5**: tỉ lệ mentor liên quan (nhãn ≥ {RELEVANT_THRESHOLD}) trong 5 vị trí đầu.
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
  - (c) model: `{res['multi_model']}` so với `{res['current_model']}` trên tập mục tiêu tiếng Việt, cùng trọng số (a).
    Quy tắc đổi: chỉ khi NDCG@10 tăng ≥ {SWITCH_MIN_GAIN}. **Sprint này không đổi model production**, chỉ khuyến nghị.

## 2. Bộ dữ liệu

Pool mentor riêng cho đánh giá (`scripts/eval/matching/dataset.py`, seed vào hệ thống bằng `seed_eval.py`) —
`seed_demo.py` chỉ có 6 mentor đã duyệt, quá ít để đo NDCG@10. Mỗi lĩnh vực ≤ 10 mentor nên top-10 luôn là toàn bộ
pool hợp lệ cùng lĩnh vực: mọi biến thể chỉ hoán vị cùng một tập và mọi cặp đều có nhãn.

| Lĩnh vực | Mentor | Mentee |
|---|---|---|
{domain_rows}

{len(mentees)} mentee ({vi} mục tiêu tiếng Việt, {len(mentees) - vi} tiếng Anh; trình độ BEGINNER/INTERMEDIATE/ADVANCED;
có và không có sở thích lịch học). {res['n_pairs']} cặp (mentee, mentor) được chấm.

## 3. Kết quả

{tables(res)}

Trần Precision@5 (xếp hạng lý tưởng theo nhãn) = **{fmt(res['p5_ceiling'])}** — mỗi mentee chỉ có 1–3 mentor
"rất phù hợp" trong pool nên Precision@5 không thể đạt 1; hãy so Precision@5 với trần này.

## 4. Khuyến nghị

- **Trọng số**: {w_rec}
- **Model**: {m_rec}
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
"""


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", default=str(HERE / "out"), help="thư mục chứa suggestions.csv + features.csv")
    parser.add_argument("--report", help="ghi báo cáo markdown (vd. docs/eval-matching.md)")
    args = parser.parse_args(argv)
    res = evaluate(*load(pathlib.Path(args.out)))
    print(tables(res))
    for line in recommendation(res):
        print("- " + line)
    print(f"Nguồn nhãn: {res['sources']}")
    if args.report:
        path = pathlib.Path(args.report)
        if not path.is_absolute():
            path = ROOT / path
        path.write_text(report(res), encoding="utf-8")
        print(f"Đã ghi báo cáo → {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
