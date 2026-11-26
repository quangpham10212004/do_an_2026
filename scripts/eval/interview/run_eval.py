"""
US-24 — đánh giá offline bộ chấm AI Interview (PRD 6.1 Evaluation).

Bộ dữ liệu: scripts/eval/interview/answers.csv — 40 câu trả lời (10 câu cho mỗi dải điểm 0–2 / 3–5 / 6–8 / 9–10),
trải đều các lĩnh vực của ngân hàng câu hỏi, tiếng Việt và tiếng Anh.

Nhãn chuẩn của mỗi câu (thang 0–10, cùng thang với điểm câu của engine):
  - có cả rater1 và rater2  => trung bình hai người chấm
  - chỉ có một người chấm   => điểm của người đó
  - chưa có người chấm      => draft_label (báo cáo ghi PROVISIONAL)

Engine:
  - RULE_BASED: luôn chạy (tất định, offline) — rule_based.assess + phát hiện prompt injection như khi chấm thật.
  - DEEPSEEK  : chỉ chạy khi có biến môi trường DEEPSEEK_API_KEY (gọi deepseek_engine.evaluate như lượt cuối;
                lượt nào DeepSeek lỗi/không hợp lệ phải fallback thì được đếm riêng và KHÔNG tính vào chỉ số DeepSeek).

Chỉ số: MAE và tỉ lệ câu có |điểm AI − nhãn| ≤ 1 trên thang 5 (mục tiêu ≥ 80% cho mỗi engine).
Mỗi câu được xem như một buổi một câu để so kết quả PASSED / FAILED / UNCLEAR theo luồng xác thực trực tiếp.

Chạy (Python 3.11, cần dependency của ai-service — pydantic, httpx):
    python scripts/eval/interview/run_eval.py                       # in kết quả + ghi docs/eval-interview.md
    DEEPSEEK_API_KEY=sk-... python scripts/eval/interview/run_eval.py
"""
import argparse
import os
import pathlib
import sys
from collections import Counter, defaultdict
from datetime import date

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from common_eval import PROVISIONAL_NOTICE, REPO, num, read_csv, use_ai_service, write_csv  # noqa: E402

use_ai_service()
from app.interview import rubric, rule_based  # noqa: E402
from app.interview.models import InterviewContext, TurnRecord  # noqa: E402
from app.verification import live  # noqa: E402

HERE = pathlib.Path(__file__).resolve().parent
BANDS = ["0-2", "3-5", "6-8", "9-10"]
OUTCOMES = ["PASSED", "UNCLEAR", "FAILED"]
TOLERANCE = 1.0
TARGET = 0.80


def human_label(row: dict) -> tuple[float, str]:
    r1, r2 = num(row.get("rater1")), num(row.get("rater2"))
    if r1 is not None and r2 is not None:
        return (r1 + r2) / 2, "RATERS"
    if r1 is not None or r2 is not None:
        return (r1 if r1 is not None else r2), "ONE_RATER"
    return float(row["draft_label"]), "DRAFT"


def topic_of(row: dict):
    topic = rule_based.find_topic(row["domain"], row["topic"])
    if topic is None:
        raise SystemExit(f"{row['id']}: không tìm thấy chủ đề '{row['topic']}' trong ngân hàng câu hỏi")
    return topic


def grade_rule_based(row: dict) -> dict:
    topic = topic_of(row)
    result = rule_based.assess(row["answer"], topic.expected_concepts)
    flags = [rubric.FLAG_PROMPT_INJECTION] if rubric.detect_injection(row["answer"]) else []
    return {"score": result.total, "rubric": result.rubric, "flags": flags, "fallback": False}


def grade_deepseek(row: dict) -> dict:
    from app.interview import deepseek_engine
    from app.llm.deepseek import get_client

    topic = topic_of(row)
    ctx = InterviewContext(domain=row["domain"], skills=[], max_turns=1)
    current = TurnRecord(turn_no=1, topic=topic.name, strategy="OPENING", question=topic.question, answer=row["answer"])
    if rubric.detect_injection(row["answer"]):  # như engine.py: không gửi câu chèn lệnh tới LLM
        return {**grade_rule_based(row), "fallback": True}
    ev, fallback = deepseek_engine.evaluate(get_client(), ctx, [], current, True)
    return {"score": ev.score, "rubric": ev.rubric, "flags": ev.flags, "fallback": fallback}


def evaluate(rows: list[dict], engine: str) -> dict:
    grader = grade_rule_based if engine == "RULE_BASED" else grade_deepseek
    details = []
    for row in rows:
        label, source = human_label(row)
        g = grader(row)
        label_on_five = label / 2
        human_outcome = OUTCOMES[live.band(rubric.round1(label_on_five))]
        ai = live.grade([{"score": g["score"], "rubric": g["rubric"].model_dump(), "flags": g["flags"]}], planned=1)
        error = abs(ai["total"] - label_on_five)
        details.append({
            "id": row["id"], "band": row["band"], "lang": row["lang"], "domain": row["domain"],
            "label": label_on_five, "label_source": source, "ai_score": ai["total"],
            "technical": g["rubric"].technical, "depth": g["rubric"].depth,
            "communication": g["rubric"].communication, "mentoring": g["rubric"].mentoring,
            "flags": "|".join(g["flags"]), "fallback": g["fallback"],
            "abs_error": round(error, 3), "within_1": round(error, 3) <= TOLERANCE,
            "human_outcome": human_outcome, "ai_outcome": ai["outcome"],
        })
    counted = [d for d in details if not (engine == "DEEPSEEK" and d["fallback"])]
    within = sum(d["within_1"] for d in counted)
    by_band = defaultdict(list)
    for d in counted:
        by_band[d["band"]].append(d)
    return {
        "engine": engine, "details": details, "n": len(counted), "fallbacks": len(details) - len(counted),
        "within": within, "share": within / len(counted) if counted else 0.0,
        "mae": sum(d["abs_error"] for d in counted) / len(counted) if counted else 0.0,
        "bias": sum(d["ai_score"] - d["label"] for d in counted) / len(counted) if counted else 0.0,
        "by_band": by_band,
        "confusion": Counter((d["human_outcome"], d["ai_outcome"]) for d in counted),
        "sources": Counter(d["label_source"] for d in details),
    }


def pct(x: float) -> str:
    return f"{x * 100:.1f}%"


def band_table(res: dict) -> list[str]:
    lines = ["| Dải nhãn gốc (thang 10) | Số câu | Nhãn TB | AI TB | MAE | Trong ±1 |", "|---|---|---|---|---|---|"]
    for band in BANDS:
        items = res["by_band"].get(band, [])
        if not items:
            continue
        n = len(items)
        lines.append(f"| {band} | {n} | {sum(d['label'] for d in items) / n:.2f} | {sum(d['ai_score'] for d in items) / n:.2f} | "
                     f"{sum(d['abs_error'] for d in items) / n:.2f} | {sum(d['within_1'] for d in items)}/{n} ({pct(sum(d['within_1'] for d in items) / n)}) |")
    return lines


def confusion_table(res: dict) -> list[str]:
    lines = ["| Nhãn \\ AI | " + " | ".join(OUTCOMES) + " |", "|---|" + "---|" * len(OUTCOMES)]
    for h in OUTCOMES:
        lines.append(f"| **{h}** | " + " | ".join(str(res["confusion"].get((h, a), 0)) for a in OUTCOMES) + " |")
    agree = sum(res["confusion"].get((r, r), 0) for r in OUTCOMES)
    lines.append("")
    lines.append(f"Kết quả trùng nhau: {agree}/{res['n']} ({pct(agree / res['n'] if res['n'] else 0)}).")
    return lines


def misses(res: dict) -> list[str]:
    bad = sorted((d for d in res["details"] if not d["within_1"] and not d["fallback"]), key=lambda d: -d["abs_error"])
    if not bad:
        return ["Không có câu nào lệch quá ±1."]
    lines = ["| Câu | Dải | Nhãn | AI | T / D / C / M | Ghi chú |", "|---|---|---|---|---|---|"]
    for d in bad:
        lines.append(f"| {d['id']} ({d['lang']}, {d['domain']}) | {d['band']} | {d['label']} | {d['ai_score']} | "
                     f"{d['technical']} / {d['depth']} / {d['communication']} / {d['mentoring']} | {'AI cao hơn' if d['ai_score'] > d['label'] else 'AI thấp hơn'} |")
    return lines


def report(rows: list[dict], results: list[dict], deepseek_ran: bool) -> str:
    sources = results[0]["sources"]
    provisional = sources.get("DRAFT", 0) > 0 or sources.get("ONE_RATER", 0) > 0
    langs = Counter(r["lang"] for r in rows)
    domains = Counter(r["domain"] for r in rows)
    out = ["# Đánh giá bộ chấm AI Interview (US-24, PRD 6.1 Evaluation)", ""]
    if provisional:
        out += [PROVISIONAL_NOTICE, ""]
    out += [
        f"_Sinh tự động bởi `scripts/eval/interview/run_eval.py` ngày {date.today().isoformat()}. Đừng sửa tay phần số liệu — chạy lại script._",
        "",
        "## 1. Bộ dữ liệu",
        "",
        f"- `scripts/eval/interview/answers.csv`: **{len(rows)} câu trả lời** do nhóm tự viết, 10 câu cho mỗi dải điểm "
        "**0–2 / 3–5 / 6–8 / 9–10** (thang điểm câu 0–10 của rubric).",
        "- Ngôn ngữ: " + ", ".join(f"{k} = {v}" for k, v in sorted(langs.items())) + "; lĩnh vực: "
        + ", ".join(f"{k} = {v}" for k, v in sorted(domains.items())) + ".",
        "- Mỗi câu gắn với một chủ đề có thật trong ngân hàng câu hỏi (`app/interview/question_bank.py`), nên engine chấm "
        "đúng với khái niệm kỳ vọng của chủ đề đó. Có 1 câu cố ý chèn lệnh cho người chấm (A08) để kiểm tra cờ PROMPT_INJECTION.",
        "- Cột nhãn gồm `rater1`, `rater2` cho hai thành viên chấm độc lập và `draft_label` cho nhãn nháp. Người chấm "
        "cho **điểm câu 0–10** theo rubric 4 tiêu chí (kỹ thuật 40%, kinh nghiệm 30%, giao tiếp 15%, hướng dẫn 15%) — "
        "xem bảng mô tả mức điểm ở `docs/ai-features.md` §2.5.",
        f"- Nguồn nhãn lần chạy này: " + ", ".join(f"{k} = {v}" for k, v in sorted(sources.items())) + ".",
        "",
        "## 2. Phương pháp",
        "",
        "- Nhãn chuẩn ưu tiên trung bình hai người chấm, sau đó là nhãn của một người chấm và cuối cùng là nhãn nháp. "
        "Chia nhãn gốc cho 2 để tính MAE trên thang 5. Bốn điểm thành phần trong CSV dùng thang 10.",
        f"- Chỉ số chính: tỉ lệ câu có |điểm AI − nhãn| ≤ {TOLERANCE:g} điểm, **mục tiêu ≥ {TARGET * 100:.0f}% cho mỗi engine**. Kèm MAE "
        "và độ lệch trung bình (AI − nhãn, dương = AI chấm rộng tay).",
        f"- Ma trận kết quả dùng `live.grade` với mỗi câu như một buổi một câu. Ngưỡng là ≥ {live.PASS_SCORE} PASSED, "
        f"< {live.REJECT_SCORE} FAILED, còn lại hoặc có cờ là UNCLEAR. Kết quả tham chiếu suy ra từ điểm nhãn "
        "theo cùng ngưỡng, sau khi làm tròn giống production.",
        "- Rule-based chạy đúng code production (`rule_based.assess` + `rubric.detect_injection`). DeepSeek chạy "
        "`deepseek_engine.evaluate` với prompt production khi có `DEEPSEEK_API_KEY`; lượt phải fallback được đếm riêng.",
        "",
        "## 3. Kết quả",
        "",
        "| Engine | Số câu | Trong ±1 | Mục tiêu | MAE (thang 5) | Độ lệch TB | Fallback |",
        "|---|---|---|---|---|---|---|",
    ]
    for res in results:
        ok = "đạt" if res["share"] >= TARGET else "CHƯA đạt"
        out.append(f"| {res['engine']} | {res['n']} | {res['within']}/{res['n']} ({pct(res['share'])}) | ≥ 80% — {ok} | "
                   f"{res['mae']:.2f} | {res['bias']:+.2f} | {res['fallbacks']} |")
    if not deepseek_ran:
        out.append("| DEEPSEEK | — | **chưa chạy** (không có `DEEPSEEK_API_KEY`) | ≥ 80% | — | — | — |")
    for res in results:
        out += ["", f"### 3.{results.index(res) + 1} {res['engine']} — theo dải điểm", ""] + band_table(res)
        out += ["", f"Ma trận kết quả ({res['engine']})", ""] + confusion_table(res)
        out += ["", f"Các câu lệch quá ±1 ({res['engine']})", ""] + misses(res)
    out += [
        "",
        "## 4. Nhận xét",
        "",
        "- Engine rule-based chấm theo tín hiệu bề mặt (khái niệm kỳ vọng, tín hiệu kinh nghiệm, số liệu, cấu trúc, từ khoá "
        "hướng dẫn). Nó không kiểm chứng được tính đúng: câu trả lời SAI nhưng dùng đúng thuật ngữ vẫn có thể được điểm "
        "kỹ thuật (xem các câu dải 0–2 có thuật ngữ), và câu trả lời ĐÚNG nhưng dùng từ ngữ khác danh sách khái niệm sẽ bị "
        "chấm thấp. Luồng xác thực trực tiếp chuyển trường hợp UNCLEAR cho quản trị viên xem xét.",
        "- Bộ dữ liệu và `draft_label` do cùng người viết engine tạo ra nên có nguy cơ thiên vị (vô tình viết câu trả lời "
        "\"hợp\" với luật). Số liệu chỉ có giá trị khi 2 người chấm độc lập điền `rater1`/`rater2`.",
        "- Bộ đánh giá dùng câu trả lời dạng văn bản. Luồng xác thực trực tiếp còn bao gồm phiên nhiều câu, "
        "chép lời giọng nói và xử lý các câu bỏ trống.",
        "",
        "## 5. Cách chạy lại",
        "",
        "```bash",
        "# Python 3.11 + dependency của ai-service (pip install -r ai-service/requirements.txt)",
        "python scripts/eval/interview/run_eval.py                 # rule-based; ghi docs/eval-interview.md",
        "DEEPSEEK_API_KEY=sk-... python scripts/eval/interview/run_eval.py   # thêm DeepSeek",
        "```",
        "",
        "Kết quả từng câu: `scripts/eval/interview/results_<engine>.csv`.",
        "",
    ]
    return "\n".join(out)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default=str(HERE / "answers.csv"))
    ap.add_argument("--report", default=str(REPO / "docs" / "eval-interview.md"))
    ap.add_argument("--no-report", action="store_true")
    args = ap.parse_args()

    rows = read_csv(pathlib.Path(args.data))
    counts = Counter(r["band"] for r in rows)
    print(f"{len(rows)} câu trả lời; theo dải: {dict(counts)}")
    engines = ["RULE_BASED"] + (["DEEPSEEK"] if os.getenv("DEEPSEEK_API_KEY") else [])
    results = []
    for engine in engines:
        res = evaluate(rows, engine)
        results.append(res)
        write_csv(HERE / f"results_{engine.lower()}.csv", res["details"])
        print(f"{engine}: trong ±1 = {res['within']}/{res['n']} ({pct(res['share'])}), MAE {res['mae']:.2f}/5, "
              f"lệch TB {res['bias']:+.2f}, fallback {res['fallbacks']}")
        for band in BANDS:
            items = res["by_band"].get(band, [])
            if items:
                print(f"  dải {band}: {sum(d['within_1'] for d in items)}/{len(items)} trong ±1")
    if "DEEPSEEK" not in engines:
        print("DEEPSEEK: không chạy (chưa đặt DEEPSEEK_API_KEY)")
    if results[0]["sources"].get("DRAFT"):
        print("PROVISIONAL: nhãn đang dùng draft_label (rater1/rater2 trống)")
    if not args.no_report:
        pathlib.Path(args.report).write_text(report(rows, results, "DEEPSEEK" in engines), encoding="utf-8")
        print(f"Đã ghi báo cáo: {args.report}")


if __name__ == "__main__":
    main()
