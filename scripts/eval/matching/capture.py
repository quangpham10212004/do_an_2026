#!/usr/bin/env python3
"""
US-26 — chụp gợi ý top-10 của AI Matching cho 30 mentee đánh giá → CSV để chấm nhãn.

Hai nguồn:

  --source offline (mặc định) — chạy lại pipeline NGAY TRONG TIẾN TRÌNH bằng chính code production của
      matching-service: profile_text.normalize_mentor/normalize_mentee (text đưa vào model), cosine trên vector
      chuẩn hoá (giống pgvector <=>), hard filter cùng lĩnh vực (mọi mentor đánh giá đều APPROVED/ACCEPTING/có
      lịch/còn chỗ) và matching_pipeline.re_rank (trọng số hiện tại). Không cần docker; tách biệt khỏi dữ liệu
      e2e trong DB dùng chung. Tính đặc trưng cho model hiện tại và một model đối chiếu.
  --source api — gọi GET /api/matching/mentors của hệ thống đang chạy cho các mentee đã seed bằng seed_eval.py
      (cần ids.json), bỏ mentor không thuộc bộ đánh giá (mentor e2e cùng lĩnh vực trong DB dùng chung). Chỉ có
      model đang chạy; phép so model của metrics.py cần nguồn offline.

Đầu ra (thư mục --out, mặc định scripts/eval/matching/out):
  suggestions.csv  mentee, rank, mentor, score, rater1, rater2, draft_label (+ cột tham khảo cho người chấm).
                   Chạy lại GIỮ NGUYÊN rater1/rater2 đã điền (khớp theo mentee+mentor).
  features.csv     đặc trưng từng cặp (mentee, mentor, model), gồm availability_overlap và responsiveness.
  --rater-sheet    xuất CSV trống để chấm theo mục tiêu và kỹ năng, ẩn điểm, thứ hạng và nhãn nháp.

Cần dependency của matching-service (sentence-transformers, asyncpg, starlette — chỉ để import code production):
    pip install -r matching-service/requirements.txt
    python3 scripts/eval/matching/capture.py
"""
import argparse
import csv
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "matching-service"))
sys.path.insert(0, str(ROOT / "scripts"))

import dataset  # noqa: E402
from app.config import EMBEDDING_MODEL as CURRENT_MODEL  # noqa: E402

MONOLINGUAL_MODEL = "all-MiniLM-L6-v2"
MULTILINGUAL_MODEL = "paraphrase-multilingual-MiniLM-L12-v2"
TOP_K = 10
SUGGESTION_FIELDS = ["mentee", "rank", "mentor", "score", "rater1", "rater2", "draft_label",
                     "mentee_name", "goal_language", "mentee_goal", "mentor_name", "mentor_skills"]
FEATURE_FIELDS = ["mentee", "mentor", "model", "similarity", "rating", "rating_count", "years_experience",
                  "availability_overlap", "responsiveness", "rating_used"]
RATER_FIELDS = ["mentee", "mentor", "mentee_goal", "mentor_skills", "label"]


def _profile_text():
    from app.services import profile_text  # code production của matching-service
    return profile_text


def embed_all(model_name: str, texts: list[str]) -> list[list[float]]:
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer(model_name)
    return [v.tolist() for v in model.encode(texts, normalize_embeddings=True, batch_size=32)]


def dot(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def offline_features(models: list[str]) -> list[dict]:
    """Một dòng cho mỗi (mentee, mentor cùng lĩnh vực, model)."""
    from app.services import ranking_signals

    pt = _profile_text()
    mentors = dataset.mentor_dicts()
    mentees = dataset.mentee_dicts()
    mentor_texts = [pt.normalize_mentor(m) for m in mentors]
    mentee_texts = [pt.normalize_mentee(e) for e in mentees]
    rows = []
    for model_name in models:
        print(f"  embed {len(mentor_texts)} mentor + {len(mentee_texts)} mentee bằng {model_name}")
        vectors = embed_all(model_name, mentor_texts + mentee_texts)
        mv, ev = vectors[:len(mentors)], vectors[len(mentors):]
        for e, e_vec in zip(mentees, ev):
            for m, m_vec in zip(mentors, mv):
                if m["domain"] != e["domain"]:  # hard filter domainMismatch
                    continue
                similarity = max(0.0, min(1.0, dot(e_vec, m_vec)))  # = 1 - cosine distance, kẹp như re_rank
                rows.append({"mentee": e["key"], "mentor": m["key"], "model": model_name,
                             "similarity": round(similarity, 6), "rating": m["rating"],
                             "rating_count": m["rating_count"], "years_experience": m["years_experience"],
                             "availability_overlap": round(dataset.availability_overlap(m, e), 4),
                             "responsiveness": ranking_signals.responsiveness(m["median_response_hours"]),
                             "rating_used": ranking_signals.effective_rating(m["rating"], m["rating_count"], None)})
    return rows


def api_features(ids_path: pathlib.Path) -> tuple[list[dict], dict[str, list[dict]]]:
    """Đặc trưng từ API đang chạy (chỉ model hiện tại). ids.json do seed_eval.py ghi: key -> {userId, token?}."""
    from common import MATCHING, call
    ids = json.loads(ids_path.read_text(encoding="utf-8"))
    mentor_by_user = {v["userId"]: k for k, v in ids["mentors"].items()}
    rows = []
    ranking = {}
    for e in dataset.mentee_dicts():
        info = ids["mentees"][e["key"]]
        res = call("GET", f"{MATCHING}/api/matching/mentors?menteeId={info['userId']}&limit=50&useProfileDefaults=false",
                   token=info["accessToken"])
        stages = res["pipeline"].get("stages") or {}
        model = stages.get("retrieve", {}).get("model", CURRENT_MODEL)
        for r in res["mentors"]:
            key = mentor_by_user.get(r["mentorId"])
            if key is None:  # mentor ngoài bộ đánh giá (dữ liệu e2e cùng lĩnh vực)
                continue
            rows.append({"mentee": e["key"], "mentor": key, "model": model,
                         "similarity": r["similarityScore"], "rating": r["rating"], "rating_count": r["ratingCount"],
                         "years_experience": r["yearsExperience"],
                         "availability_overlap": r["scheduleFit"], "responsiveness": r["responsiveness"],
                         "rating_used": r["ratingUsed"]})
            ranking.setdefault(e["key"], []).append({"mentor_id": key, "final_score": r["finalScore"]})
    if len({row["model"] for row in rows}) > 1:
        raise SystemExit("API trả về nhiều model embedding trong cùng một lần capture.")
    return rows, ranking


def production_ranking(features: list[dict], model: str) -> dict[str, list[dict]]:
    """Xếp hạng bằng matching_pipeline.re_rank (trọng số production) cho từng mentee."""
    from app.services.matching_pipeline import re_rank

    mentors = {m["key"]: m for m in dataset.mentor_dicts()}
    by_mentee: dict[str, list[dict]] = {}
    for f in features:
        if f["model"] != model:
            continue
        by_mentee.setdefault(f["mentee"], []).append({
            "mentor_id": f["mentor"], "distance": 1 - float(f["similarity"]), "rating": float(f["rating"]),
            "rating_count": int(f["rating_count"]), "years_experience": int(f["years_experience"]),
            "schedule_fit": f["availability_overlap"],
            "median_response_hours": mentors[f["mentor"]]["median_response_hours"]})
    return {k: re_rank(sorted(v, key=lambda candidate: candidate["mentor_id"])) for k, v in by_mentee.items()}


def read_existing_ratings(path: pathlib.Path) -> dict[tuple[str, str], tuple[str, str]]:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as fh:
        return {(r["mentee"], r["mentor"]): (r.get("rater1", ""), r.get("rater2", "")) for r in csv.DictReader(fh)}


def write_csv(path: pathlib.Path, fields: list[str], rows: list[dict], *, mode: str = "w") -> None:
    with path.open(mode, newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)


def write_rater_sheet(path: pathlib.Path, suggestions: list[dict]) -> None:
    ordered = sorted(suggestions, key=lambda row: (row["mentee"], row["mentor"]))
    rows = [{field: row[field] for field in RATER_FIELDS if field != "label"} for row in ordered]
    write_csv(path, RATER_FIELDS, rows, mode="x")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", choices=["offline", "api"], default="offline")
    parser.add_argument("--out", default=str(HERE / "out"))
    parser.add_argument("--ids", default=str(HERE / "out" / "ids.json"), help="(api) file do seed_eval.py ghi")
    parser.add_argument("--rater-sheet", type=pathlib.Path, help="đường dẫn CSV chấm độc lập")
    args = parser.parse_args(argv)
    out = pathlib.Path(args.out)
    if args.rater_sheet:
        sheet = args.rater_sheet.resolve()
        capture_outputs = {(out / name).resolve() for name in ("features.csv", "suggestions.csv")}
        if sheet.exists() or sheet in capture_outputs:
            parser.error("--rater-sheet cần đường dẫn mới, khác features.csv và suggestions.csv")
    out.mkdir(parents=True, exist_ok=True)

    dataset.check_dataset()
    if args.source == "offline":
        comparison_model = MONOLINGUAL_MODEL if CURRENT_MODEL == MULTILINGUAL_MODEL else MULTILINGUAL_MODEL
        features = offline_features([CURRENT_MODEL, comparison_model])
        ranking = production_ranking(features, CURRENT_MODEL)
    else:
        features, ranking = api_features(pathlib.Path(args.ids))

    mentees = {e["key"]: e for e in dataset.mentee_dicts()}
    mentors = {m["key"]: m for m in dataset.mentor_dicts()}
    existing = read_existing_ratings(out / "suggestions.csv")
    rows = []
    for e_key in sorted(ranking):
        e = mentees[e_key]
        for rank, c in enumerate(ranking[e_key][:TOP_K], start=1):
            m = mentors[c["mentor_id"]]
            r1, r2 = existing.get((e_key, m["key"]), ("", ""))
            rows.append({"mentee": e_key, "rank": rank, "mentor": m["key"], "score": c["final_score"],
                         "rater1": r1, "rater2": r2, "draft_label": dataset.draft_label(e, m["key"]),
                         "mentee_name": e["display_name"], "goal_language": e["goal_language"],
                         "mentee_goal": e["goal"], "mentor_name": m["display_name"],
                         "mentor_skills": ", ".join(m["skills"])})
    captured_pairs = {(row["mentee"], row["mentor"]) for row in rows}
    missing_rated = sum(pair not in captured_pairs and any(labels) for pair, labels in existing.items())
    if missing_rated:
        raise SystemExit(f"Capture thiếu {missing_rated} cặp đã được chấm. Dùng --out khác để giữ nhãn hiện có.")

    write_csv(out / "features.csv", FEATURE_FIELDS, features)
    write_csv(out / "suggestions.csv", SUGGESTION_FIELDS, rows)
    if args.rater_sheet:
        write_rater_sheet(args.rater_sheet, rows)
    kept = sum(1 for r in rows if r["rater1"] or r["rater2"])
    print(f"Đã ghi {len(rows)} dòng gợi ý ({len(ranking)} mentee) → {out / 'suggestions.csv'}"
          f" (giữ {kept} dòng đã có nhãn rater)")
    print(f"Đã ghi {len(features)} dòng đặc trưng → {out / 'features.csv'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
