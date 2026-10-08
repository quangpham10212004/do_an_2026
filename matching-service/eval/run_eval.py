"""
Đánh giá chất lượng AI Matching: so sánh model embedding + ablation các bước pipeline.

Chạy (từ thư mục matching-service):
    python -m eval.run_eval                       # 3 model mặc định
    python -m eval.run_eval --models all-MiniLM-L6-v2 BAAI/bge-m3
Kết quả ghi vào eval/results/results.md và results.json.

Các cấu hình (ablation):
    keyword            BM25 trên văn bản (không có vector)
    vector             top-K theo cosine, chưa lọc, chưa re-rank
    hybrid             gộp BM25 + vector bằng Reciprocal Rank Fusion
    vector+filter      vector + hard filter
    pipeline           vector + hard filter + re-rank  (= pipeline đang chạy thật)
    hybrid+filter      hybrid + hard filter
    hybrid+pipeline    hybrid + hard filter + re-rank
Các bước filter / re-rank dùng đúng hàm của app.services.matching_pipeline.
"""
import argparse
import json
import math
import re
import time
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

from app.services import matching_pipeline as mp
from eval import dataset

K_RETRIEVE = 15  # K mô phỏng top-K retrieval (dữ liệu nhỏ nên K nhỏ hơn production = 50)
RRF_C = 60

MODELS = {
    "all-MiniLM-L6-v2": ("", ""),
    "paraphrase-multilingual-MiniLM-L12-v2": ("", ""),
    "intfloat/multilingual-e5-small": ("query: ", "passage: "),
    "BAAI/bge-m3": ("", ""),
}
DEFAULT_MODELS = ["all-MiniLM-L6-v2", "paraphrase-multilingual-MiniLM-L12-v2", "intfloat/multilingual-e5-small"]
VARIANTS = ["keyword", "vector", "hybrid", "vector+filter", "pipeline", "hybrid+filter", "hybrid+pipeline"]


# ------------------------------ metrics ------------------------------
def ndcg_at(rels: list[int], ideal: list[int], k: int) -> float:
    def dcg(xs):
        return sum((2 ** r - 1) / math.log2(i + 2) for i, r in enumerate(xs[:k]))

    best = dcg(sorted(ideal, reverse=True))
    return dcg(rels) / best if best > 0 else 0.0


def precision_at(rels: list[int], k: int, thr: int = 2) -> float:
    return sum(1 for r in rels[:k] if r >= thr) / k


def mrr(rels: list[int], thr: int = 3) -> float:
    for i, r in enumerate(rels):
        if r >= thr:
            return 1 / (i + 1)
    return 0.0


# ------------------------------ retrieval ------------------------------
def tokenize(text: str) -> list[str]:
    return re.findall(r"\w+", text.lower())


class BM25:
    def __init__(self, docs: list[list[str]], k1: float = 1.5, b: float = 0.75):
        self.docs, self.k1, self.b = docs, k1, b
        self.avg = sum(len(d) for d in docs) / len(docs)
        df = Counter(t for d in docs for t in set(d))
        n = len(docs)
        self.idf = {t: math.log(1 + (n - f + 0.5) / (f + 0.5)) for t, f in df.items()}

    def score(self, query: list[str]) -> np.ndarray:
        out = np.zeros(len(self.docs))
        for i, d in enumerate(self.docs):
            tf = Counter(d)
            for t in query:
                if t in tf:
                    out[i] += self.idf[t] * tf[t] * (self.k1 + 1) / (tf[t] + self.k1 * (1 - self.b + self.b * len(d) / self.avg))
        return out


def rrf(*rankings: list[int]) -> list[int]:
    score: dict[int, float] = defaultdict(float)
    for r in rankings:
        for pos, idx in enumerate(r):
            score[idx] += 1 / (RRF_C + pos + 1)
    return sorted(score, key=lambda i: -score[i])


def run_variant(variant: str, mentee: dict, mentors: list[dict], dist: np.ndarray, bm25: np.ndarray) -> list[int]:
    """Trả về danh sách chỉ số mentor đã xếp hạng (tối đa 10)."""
    vec_rank = list(np.argsort(dist))
    kw_rank = [int(i) for i in np.argsort(-bm25)]
    if variant == "keyword":
        return kw_rank[:10]
    if variant == "vector":
        return vec_rank[:10]
    retrieved = vec_rank if variant.startswith("vector") or variant == "pipeline" else rrf(vec_rank, kw_rank)
    retrieved = retrieved[:K_RETRIEVE]
    if variant == "hybrid":
        return retrieved[:10]
    cands = []
    for i in retrieved:
        c = dict(mentors[i])
        c["distance"] = float(dist[i])
        c["_idx"] = i
        cands.append(c)
    kept, _ = mp.hard_filter(cands, mentee["domain"])
    if variant.endswith("filter"):
        return [c["_idx"] for c in kept][:10]
    return [c["_idx"] for c in mp.re_rank(kept)][:10]


def evaluate(variant, data, dist_m, bm25_m):
    per = []
    for qi, e in enumerate(data["mentees"]):
        order = run_variant(variant, e, data["mentors"], dist_m[qi], bm25_m[qi])
        rels = [e["relevance"][data["mentors"][i]["mentor_id"]] for i in order]
        ideal = list(e["relevance"].values())
        inelig = sum(1 for i in order[:5] if not data["mentors"][i]["eligible"]) / 5
        per.append({
            "style": e["style"], "ndcg5": ndcg_at(rels, ideal, 5), "p3": precision_at(rels, 3),
            "mrr": mrr(rels), "inelig5": inelig,
        })
    return per


def agg(per, key):
    return float(np.mean([p[key] for p in per]))


# ------------------------------ main ------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", nargs="+", default=DEFAULT_MODELS)
    ap.add_argument("--out", default=str(Path(__file__).parent / "results"))
    args = ap.parse_args()

    from sentence_transformers import SentenceTransformer

    data = dataset.build()
    mentors, mentees = data["mentors"], data["mentees"]
    m_texts = [dataset.mentor_text(m) for m in mentors]
    e_texts = [dataset.mentee_text(e) for e in mentees]
    bm = BM25([tokenize(t) for t in m_texts])
    bm25_m = np.array([bm.score(tokenize(t)) for t in e_texts])

    results: dict[str, dict] = {}
    latency: dict[str, float] = {}
    for name in args.models:
        qp, pp = MODELS.get(name, ("", ""))
        print(f"== {name}", flush=True)
        model = SentenceTransformer(name)
        t0 = time.perf_counter()
        mv = model.encode([pp + t for t in m_texts], normalize_embeddings=True)
        ev = model.encode([qp + t for t in e_texts], normalize_embeddings=True)
        latency[name] = (time.perf_counter() - t0) / (len(m_texts) + len(e_texts)) * 1000
        dist_m = 1 - ev @ mv.T
        results[name] = {v: evaluate(v, data, dist_m, bm25_m) for v in VARIANTS}
        del model

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Kết quả đánh giá AI Matching",
        "",
        f"Dữ liệu: {len(mentors)} mentor ({sum(m['eligible'] for m in mentors)} đủ điều kiện, "
        f"{sum(not m['eligible'] for m in mentors)} bẫy không đủ điều kiện), {len(mentees)} mentee "
        "(4 phong cách viết × 10 topic). Nhãn: 3 cùng topic, 2 topic liên quan, 0 còn lại / không đủ điều kiện. "
        f"Top-K retrieval = {K_RETRIEVE}. Chỉ số trung bình trên {len(mentees)} truy vấn.",
        "",
        "- **NDCG@5**: chất lượng thứ hạng có trọng số theo mức phù hợp.  **P@3**: tỷ lệ mentor phù hợp (nhãn ≥ 2) trong top 3.",
        "- **MRR**: nghịch đảo thứ hạng của mentor đúng topic đầu tiên.  **Vi phạm@5**: tỷ lệ mentor KHÔNG đủ điều kiện trong top 5 (thấp là tốt).",
        "",
    ]

    def table(title, rows, cols):
        lines.append(f"## {title}\n")
        lines.append("| " + " | ".join(cols) + " |")
        lines.append("|" + "---|" * len(cols))
        for r in rows:
            lines.append("| " + " | ".join(r) + " |")
        lines.append("")

    # 1. So sánh model (vector thuần và pipeline đầy đủ)
    rows = []
    for name in args.models:
        for v in ("vector", "pipeline"):
            p = results[name][v]
            rows.append([name, v, f"{agg(p, 'ndcg5'):.3f}", f"{agg(p, 'p3'):.3f}", f"{agg(p, 'mrr'):.3f}",
                         f"{agg(p, 'inelig5'):.3f}", f"{latency[name]:.1f}"])
    table("1. So sánh model embedding", rows, ["Model", "Cấu hình", "NDCG@5", "P@3", "MRR", "Vi phạm@5", "ms/văn bản"])

    # 2. Ablation theo từng model
    for name in args.models:
        rows = [[v, f"{agg(results[name][v], 'ndcg5'):.3f}", f"{agg(results[name][v], 'p3'):.3f}",
                 f"{agg(results[name][v], 'mrr'):.3f}", f"{agg(results[name][v], 'inelig5'):.3f}"] for v in VARIANTS]
        table(f"2. Ablation — {name}", rows, ["Cấu hình", "NDCG@5", "P@3", "MRR", "Vi phạm@5"])

    # 3. Theo phong cách viết (vector thuần)
    styles = ["vi", "vi_nodiac", "mixed", "vague"]
    rows = []
    for name in args.models:
        for v in ("keyword", "vector"):
            if v == "keyword" and name != args.models[0]:
                continue
            label = "keyword (BM25)" if v == "keyword" else name
            per = results[name][v]
            rows.append([label] + [f"{np.mean([p['ndcg5'] for p in per if p['style'] == s]):.3f}" for s in styles])
    table("3. NDCG@5 theo phong cách viết của mentee (vector thuần)", rows,
          ["Cấu hình", "Có dấu", "Không dấu", "Việt–Anh", "Mơ hồ"])

    (out / "results.md").write_text("\n".join(lines), encoding="utf-8")
    (out / "results.json").write_text(json.dumps(
        {n: {v: {k: agg(p, k) for k in ("ndcg5", "p3", "mrr", "inelig5")} for v, p in r.items()} for n, r in results.items()},
        indent=2), encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
