#!/usr/bin/env python3
"""Đánh giá chất lượng matching offline trên profiles.jsonl (không cần DB, không cần chạy service).

Quy trình:
  1) label : tạo file nhãn. Mentee giả = hồ sơ entry/junior/mid, ứng viên mentor = hồ sơ senior.
             Gộp top-K của mọi model (pooling) rồi ghi ra labels.json để BẠN chấm điểm tay.
  2) (bạn mở labels.json, điền "grade": 0 = không hợp, 1 = hợp, 2 = rất hợp)
  3) eval  : đọc labels.json, in NDCG@K / Recall@K / MRR cho từng model để so sánh.

Ví dụ:
  python -I scripts/eval_embeddings.py label PROFILES.jsonl labels.json --queries 25
  python -I scripts/eval_embeddings.py eval  PROFILES.jsonl labels.json

Đổi/thêm model bằng --models (mặc định so 3 model). Text mentor dùng đúng normalize_mentor() của service,
nên kết quả phản ánh pipeline thật; muốn thử format text khác thì sửa mentor_text()/mentee_text() bên dưới.
"""
import argparse
import importlib.util
import json
import math
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODELS = [
    "paraphrase-multilingual-MiniLM-L12-v2",  # model đang dùng trong config.py
    "intfloat/multilingual-e5-base",
    "BAAI/bge-m3",
]
# e5 yêu cầu tiền tố; model khác không cần.
PREFIX = {"e5": ("query: ", "passage: ")}
# Dữ liệu crawl lệch về senior (117/175) nên mid cũng làm mentee; mentor = senior, hai tập không giao nhau.
MENTEE_LEVELS = {"entry", "junior", "mid"}
MENTOR_LEVELS = {"senior"}
K = 10


def _load_profile_text():
    # Nạp trực tiếp file để không kéo theo app/__init__ (DB, FastAPI...).
    spec = importlib.util.spec_from_file_location("profile_text", ROOT / "app" / "services" / "profile_text.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


PT = _load_profile_text()


def load_profiles(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def _bio(p):
    parts = [p.get("about") or ""]
    for e in (p.get("experience") or [])[:3]:
        parts.append(f"{e.get('position') or ''}: {e.get('description') or ''}")
    return " ".join(x for x in parts if x)[:1500]


# "current": như service hiện tại (skills đầy đủ). "compact": rút skills để About/Goal không bị cắt ở 128 token.
COMPACT_MENTOR_SKILLS = 8
COMPACT_MENTEE_SKILLS = 6


def mentor_text(p, fmt="current"):
    skills = p.get("skills")
    if fmt == "compact":
        skills = (skills or [])[:COMPACT_MENTOR_SKILLS]
    return PT.normalize_mentor({
        "domain": p.get("headline"),
        "skills": skills,
        "years_experience": p.get("years_experience"),
        "bio": _bio(p),
    })


def mentee_text(p, fmt="current", goal=None):
    # Mentee giả: kỹ năng hiện có + mục tiêu là phát triển theo hướng headline của chính họ.
    skills = (p.get("skills") or [])[:15]
    if fmt == "compact":
        skills = skills[:COMPACT_MENTEE_SKILLS]
    return PT.normalize_mentee({
        "domain": p.get("headline"),
        "skills": skills,
        "current_level": "BEGINNER" if p.get("level") == "entry" else "INTERMEDIATE",
        "goal": goal or f"Want to grow my career and get guidance as {p.get('headline') or 'an engineer'}",
    })


def summary(p):
    skills = ", ".join((p.get("skills") or [])[:12])
    return f"[{p.get('level')}, {p.get('years_experience')}y] {p.get('headline')} | {skills}"


def _prefixes(name):
    for key, pre in PREFIX.items():
        if key in name:
            return pre
    return "", ""


def rank_with_model(name, queries, mentors, qtexts, mtexts):
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer(name)
    qp, mp = _prefixes(name)
    q = model.encode([qp + t for t in qtexts], normalize_embeddings=True, show_progress_bar=False)
    m = model.encode([mp + t for t in mtexts], normalize_embeddings=True, show_progress_bar=False)
    sims = q @ m.T
    out = {}
    for i, qp_ in enumerate(queries):
        order = sims[i].argsort()[::-1]
        out[qp_["id"]] = [mentors[j]["id"] for j in order]
    return out


def split(profiles, n_queries, seed):
    mentees = [p for p in profiles if p.get("level") in MENTEE_LEVELS]
    mentors = [p for p in profiles if p.get("level") in MENTOR_LEVELS]
    random.Random(seed).shuffle(mentees)
    return mentees[:n_queries], mentors


def cmd_label(a):
    profiles = load_profiles(a.profiles)
    queries, mentors = split(profiles, a.queries, a.seed)
    if not queries or not mentors:
        raise SystemExit("Cần cả hồ sơ entry/junior/mid (mentee) và senior (mentor).")
    by_id = {p["id"]: p for p in mentors}
    qtexts = [mentee_text(p) for p in queries]
    mtexts = [mentor_text(p) for p in mentors]
    pooled = {p["id"]: [] for p in queries}
    for name in a.models:
        print(f"ranking với {name} ...")
        ranks = rank_with_model(name, queries, mentors, qtexts, mtexts)
        for qid, order in ranks.items():
            for cid in order[:K]:
                if cid not in pooled[qid]:
                    pooled[qid].append(cid)
    doc = {
        "guide": "Điền grade cho từng candidate: 0 = không hợp, 1 = hợp, 2 = rất hợp. Để null = coi như 0.",
        "queries": [
            {
                "id": q["id"],
                "mentee": summary(q),
                "candidates": [{"id": cid, "mentor": summary(by_id[cid]), "grade": None}
                               for cid in random.Random(q["id"]).sample(pooled[q["id"]], len(pooled[q["id"]]))],
            }
            for q in queries
        ],
    }
    Path(a.labels).write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    total = sum(len(q["candidates"]) for q in doc["queries"])
    print(f"đã ghi {a.labels}: {len(queries)} query, {total} cặp cần chấm. Candidate đã xáo trộn để không bị thiên vị theo thứ hạng.")


def ndcg(ranked, grades):
    dcg = sum((2 ** grades.get(c, 0) - 1) / math.log2(i + 2) for i, c in enumerate(ranked[:K]))
    ideal = sorted(grades.values(), reverse=True)[:K]
    idcg = sum((2 ** g - 1) / math.log2(i + 2) for i, g in enumerate(ideal))
    return dcg / idcg if idcg else None


def cmd_eval(a):
    profiles = {p["id"]: p for p in load_profiles(a.profiles)}
    doc = json.loads(Path(a.labels).read_text(encoding="utf-8"))
    labelled = {}
    for q in doc["queries"]:
        g = {c["id"]: (c["grade"] or 0) for c in q["candidates"]}
        if any(v > 0 for v in g.values()):
            labelled[q["id"]] = g
    if not labelled:
        raise SystemExit("Chưa có grade > 0 nào trong labels.json — hãy chấm điểm trước.")
    queries = [profiles[qid] for qid in labelled]
    _, mentors = split(list(profiles.values()), 0, 0)
    # Mỗi cấu hình = (tên, format text, mục tiêu mentee). Có --goals thì thêm bản mentee viết tiếng Việt.
    configs = [("en/" + f, f, None) for f in a.formats]
    if a.goals:
        raw = json.loads(Path(a.goals).read_text(encoding="utf-8"))
        goals = {qid: raw[qid[:8]] for qid in labelled if qid[:8] in raw}
        if len(goals) < len(labelled):
            print(f"cảnh báo: chỉ {len(goals)}/{len(labelled)} query có mục tiêu tiếng Việt; query còn lại dùng câu tiếng Anh")
        configs += [("vi/" + f, f, goals) for f in a.formats]
    print(f"{len(labelled)} query có nhãn, {len(mentors)} mentor\n")
    print(f"{'model':40} {'text':16} {'NDCG@10':>8} {'Recall@10':>10} {'MRR':>6}")
    for name in a.models:
        for label, fmt, goals in configs:
            qtexts = [mentee_text(p, fmt, (goals or {}).get(p["id"])) for p in queries]
            mtexts = [mentor_text(p, fmt) for p in mentors]
            ranks = rank_with_model(name, queries, mentors, qtexts, mtexts)
            nd, rc, rr = [], [], []
            for qid, g in labelled.items():
                ranked = ranks[qid]
                n = ndcg(ranked, g)
                if n is not None:
                    nd.append(n)
                rel = {c for c, v in g.items() if v > 0}
                rc.append(len(rel & set(ranked[:K])) / len(rel))
                rr.append(next((1 / (i + 1) for i, c in enumerate(ranked) if c in rel), 0))
            avg = lambda xs: sum(xs) / len(xs)
            print(f"{name:40} {label:16} {avg(nd):8.3f} {avg(rc):10.3f} {avg(rr):6.3f}")


def main():
    sys.stdout.reconfigure(encoding="utf-8")  # console Windows mặc định cp1252, không in được tiếng Việt
    ap =argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("mode", choices=["label", "eval"])
    ap.add_argument("profiles")
    ap.add_argument("labels")
    ap.add_argument("--models", nargs="+", default=DEFAULT_MODELS)
    ap.add_argument("--queries", type=int, default=25)
    ap.add_argument("--formats", nargs="+", default=["current", "compact"], choices=["current", "compact"],
                    help="eval: các format text mentor/mentee cần so sánh")
    ap.add_argument("--goals", help="eval: JSON {8 ký tự đầu của id mentee: mục tiêu tiếng Việt}, thêm bản vi/ để so sánh")
    ap.add_argument("--seed", type=int, default=42)
    a = ap.parse_args()
    (cmd_label if a.mode == "label" else cmd_eval)(a)


if __name__ == "__main__":
    main()
