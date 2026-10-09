"""
US-29 — đánh giá offline CV parsing (PRD 6.2 Evaluation).

Dữ liệu: 20 CV PDF có lớp văn bản ở scripts/eval/cv/pdf/ (sinh bởi make_cvs.py, nhiều bố cục, tiếng Việt + Anh) và
nhãn chuẩn ở scripts/eval/cv/gold.csv. Nhãn chuẩn của mỗi CV:
  - kỹ năng : có cả rater1_skills và rater2_skills => các kỹ năng CẢ HAI người cùng ghi (đa số của 2 người);
              chỉ một người => của người đó; chưa ai chấm => draft_skills (báo cáo ghi PROVISIONAL)
  - số năm  : trung bình rater1_years / rater2_years (làm tròn) hoặc của người duy nhất, ngược lại draft_years

Engine: RULE_BASED luôn chạy (trích văn bản bằng extractor production + rule_based.parse); DEEPSEEK chỉ khi có
DEEPSEEK_API_KEY (deepseek_parser.parse; CV nào phải fallback được đếm riêng, không tính vào chỉ số DeepSeek).

Chỉ số: precision / recall / F1 kỹ năng (micro trên toàn bộ cặp CV–kỹ năng; mục tiêu F1 ≥ 0.8 với DeepSeek, ≥ 0.6
rule-based), số năm kinh nghiệm khớp ±1 (CV không có kinh nghiệm: nhãn 0, parser trả null được coi là 0).

    python scripts/eval/cv/run_eval.py          # ghi docs/eval-cv.md
"""
import argparse
import os
import pathlib
import re
import sys
from collections import Counter
from datetime import date

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from common_eval import PROVISIONAL_NOTICE, REPO, num, read_csv, use_ai_service, write_csv  # noqa: E402

use_ai_service()
from app.cv import rule_based  # noqa: E402
from app.cv.extractor import extract_text  # noqa: E402
from app.cv.skills import SKILL_VARIANTS  # noqa: E402

HERE = pathlib.Path(__file__).resolve().parent
TARGETS = {"RULE_BASED": 0.6, "DEEPSEEK": 0.8}
DICTIONARY = {n for n, _ in SKILL_VARIANTS}


def key(skill: str) -> str:
    """So khớp không phân biệt hoa thường / dấu chấm / khoảng trắng / gạch ("Node.js" = "nodejs")."""
    return re.sub(r"[\s.\-_]", "", skill.strip().lower())


def split_skills(value: str | None) -> list[str] | None:
    value = (value or "").strip()
    return [s.strip() for s in value.split(";") if s.strip()] if value else None


def gold_of(row: dict) -> tuple[list[str], int, str]:
    r1, r2 = split_skills(row.get("rater1_skills")), split_skills(row.get("rater2_skills"))
    y1, y2 = num(row.get("rater1_years")), num(row.get("rater2_years"))
    if r1 is not None and r2 is not None:
        k2 = {key(s) for s in r2}
        skills, source = [s for s in r1 if key(s) in k2], "RATERS"
    elif r1 is not None or r2 is not None:
        skills, source = (r1 if r1 is not None else r2), "ONE_RATER"
    else:
        skills, source = split_skills(row["draft_skills"]) or [], "DRAFT"
    ys = [y for y in (y1, y2) if y is not None]
    years = int(sum(ys) / len(ys) + 0.5) if ys else int(float(row["draft_years"]))
    return skills, years, source


def parse_with(engine: str, text: str):
    if engine == "RULE_BASED":
        return rule_based.parse(text), False
    from app.cv import deepseek_parser
    from app.llm.deepseek import get_client
    return deepseek_parser.parse(get_client(), text)


def evaluate(rows: list[dict], engine: str) -> dict:
    details, tp_all, fp_all, fn_all = [], 0, 0, 0
    fn_counter, fp_counter = Counter(), Counter()
    for row in rows:
        gold_skills, gold_years, source = gold_of(row)
        text = extract_text((HERE / row["file"]).read_bytes())
        parsed, fallback = parse_with(engine, text)
        pred = {key(s): s for s in parsed.skills}
        gold = {key(s): s for s in gold_skills}
        tp = [gold[k] for k in gold if k in pred]
        fn = [gold[k] for k in gold if k not in pred]
        fp = [pred[k] for k in pred if k not in gold]
        years = parsed.years_experience if parsed.years_experience is not None else 0
        d = {"cv_id": row["cv_id"], "lang": row["lang"], "layout": row["layout"], "label_source": source,
             "gold": len(gold), "pred": len(pred), "tp": len(tp),
             "precision": round(len(tp) / len(pred), 3) if pred else 0.0,
             "recall": round(len(tp) / len(gold), 3) if gold else 0.0,
             "missed": ";".join(fn), "extra": ";".join(fp),
             "gold_years": gold_years, "pred_years": parsed.years_experience,
             "years_within_1": abs(years - gold_years) <= 1, "fallback": fallback}
        details.append(d)
        if engine == "DEEPSEEK" and fallback:
            continue
        tp_all, fp_all, fn_all = tp_all + len(tp), fp_all + len(fp), fn_all + len(fn)
        fn_counter.update(fn)
        fp_counter.update(fp)
    counted = [d for d in details if not (engine == "DEEPSEEK" and d["fallback"])]
    p = tp_all / (tp_all + fp_all) if tp_all + fp_all else 0.0
    r = tp_all / (tp_all + fn_all) if tp_all + fn_all else 0.0
    f1 = 2 * p * r / (p + r) if p + r else 0.0
    return {"engine": engine, "details": details, "n": len(counted), "fallbacks": len(details) - len(counted),
            "tp": tp_all, "fp": fp_all, "fn": fn_all, "precision": p, "recall": r, "f1": f1,
            "years_ok": sum(d["years_within_1"] for d in counted), "fn_counter": fn_counter, "fp_counter": fp_counter,
            "sources": Counter(d["label_source"] for d in details)}


def group_f1(details: list[dict], field: str) -> list[str]:
    lines = [f"| {field} | CV | P | R | Năm ±1 |", "|---|---|---|---|---|"]
    for value in sorted({d[field] for d in details}):
        items = [d for d in details if d[field] == value]
        tp, pred, gold = sum(d["tp"] for d in items), sum(d["pred"] for d in items), sum(d["gold"] for d in items)
        lines.append(f"| {value} | {len(items)} | {tp / pred if pred else 0:.2f} | {tp / gold if gold else 0:.2f} | "
                     f"{sum(d['years_within_1'] for d in items)}/{len(items)} |")
    return lines


def report(rows: list[dict], results: list[dict], deepseek_ran: bool) -> str:
    rb = results[0]
    sources = rb["sources"]
    out = ["# Đánh giá CV parsing (US-29, PRD 6.2 Evaluation)", ""]
    if sources.get("DRAFT") or sources.get("ONE_RATER"):
        out += [PROVISIONAL_NOTICE, ""]
    langs = Counter(r["lang"] for r in rows)
    layouts = Counter(r["layout"] for r in rows)
    out += [
        f"_Sinh tự động bởi `scripts/eval/cv/run_eval.py` ngày {date.today().isoformat()} — chạy lại script thay vì sửa tay số liệu._",
        "",
        "## 1. Bộ dữ liệu",
        "",
        f"- **{len(rows)} CV PDF có lớp văn bản** ở `scripts/eval/cv/pdf/`, sinh từ `cv_data.py` bằng `make_cvs.py` "
        "(cùng kiểu với `scripts/make_sample_cv.py`, nhưng dùng font Unicode để CV tiếng Việt có dấu).",
        "- Ngôn ngữ: " + ", ".join(f"{k} = {v}" for k, v in sorted(langs.items())) + "; bố cục: "
        + ", ".join(f"{k} = {v}" for k, v in sorted(layouts.items()))
        + ". `two-column` vẽ hai cột xen kẽ từng dòng (như CV xuất từ Word/Canva) nên văn bản trích ra bị trộn cột; "
        "`compact` không có mục Kỹ năng riêng; `table` liệt kê kỹ năng dạng bảng; `timeline` để mốc thời gian trên dòng riêng.",
        "- Nhãn: `scripts/eval/cv/gold.csv` — mỗi CV một dòng: `rater1_skills`/`rater1_years`, `rater2_skills`/`rater2_years` "
        "(để trống, chờ 2 thành viên), `draft_skills`/`draft_years` (nhãn nháp). Kỹ năng ghi tên chuẩn, ngăn cách bằng `;`.",
        "- Nguồn nhãn lần chạy này: " + ", ".join(f"{k} = {v}" for k, v in sorted(sources.items())) + ".",
        "- Mốc tham chiếu cho \"nay/present\": 11/2026; sai số ±1 năm đủ để chạy lại trong năm 2027.",
        "",
        "## 2. Phương pháp",
        "",
        "- Văn bản trích bằng `app/cv/extractor.py` (pypdf) như khi người dùng upload, rồi parse bằng engine.",
        "- Kỹ năng so khớp không phân biệt hoa thường / dấu chấm / khoảng trắng. Precision, recall, F1 tính **micro** trên "
        "toàn bộ cặp (CV, kỹ năng). Mục tiêu: F1 ≥ 0.8 (DeepSeek), ≥ 0.6 (rule-based).",
        "- Số năm kinh nghiệm: đúng khi |dự đoán − nhãn| ≤ 1; parser trả null được coi là 0 năm.",
        "",
        "## 3. Kết quả",
        "",
        "| Engine | CV | Precision | Recall | F1 | Mục tiêu F1 | Năm KN ±1 | Fallback |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for res in results:
        target = TARGETS[res["engine"]]
        out.append(f"| {res['engine']} | {res['n']} | {res['precision']:.3f} | {res['recall']:.3f} | **{res['f1']:.3f}** | "
                   f"≥ {target} — {'đạt' if res['f1'] >= target else 'CHƯA đạt'} | {res['years_ok']}/{res['n']} | {res['fallbacks']} |")
    if not deepseek_ran:
        out.append("| DEEPSEEK | — | — | — | **chưa chạy** (không có `DEEPSEEK_API_KEY`) | ≥ 0.8 | — | — |")
    for i, res in enumerate(results, 1):
        out += ["", f"### 3.{i} {res['engine']} — theo bố cục", ""] + group_f1(res["details"], "layout")
        out += ["", f"### 3.{i}b {res['engine']} — theo ngôn ngữ", ""] + group_f1(res["details"], "lang")
        out += ["", f"### 3.{i}c {res['engine']} — từng CV", "",
                "| CV | Bố cục | Gold | Dự đoán | Đúng | Bỏ sót | Thừa | Năm (nhãn / dự đoán) |", "|---|---|---|---|---|---|---|---|"]
        for d in res["details"]:
            out.append(f"| {d['cv_id']} ({d['lang']}) | {d['layout']} | {d['gold']} | {d['pred']} | {d['tp']} | {d['missed'] or '—'} | "
                       f"{d['extra'] or '—'} | {d['gold_years']} / {d['pred_years'] if d['pred_years'] is not None else 'null'}"
                       f"{'' if d['years_within_1'] else ' ✗'} |")
    fn, fp = rb["fn_counter"], rb["fp_counter"]
    not_in_dict = sorted({s for s in fn if s not in DICTIONARY})
    in_dict_missed = sorted({s for s in fn if s in DICTIONARY})
    year_errors = [d for d in rb["details"] if not d["years_within_1"]]
    out += [
        "",
        "## 4. Nguyên nhân lỗi chính (rule-based)",
        "",
        f"- **Bỏ sót do từ điển** (`app/cv/skills.py` không có mục này): {', '.join(not_in_dict) or 'không có'} "
        f"— {sum(fn[s] for s in not_in_dict)}/{rb['fn']} lượt bỏ sót.",
        f"- **Bỏ sót dù có trong từ điển** (biến thể viết không khớp mẫu): {', '.join(in_dict_missed) or 'không có'}.",
        f"- **Nhận thừa**: {', '.join(f'{k} ×{v}' for k, v in fp.most_common()) or 'không có'} — chủ yếu là kỹ năng "
        "được suy ra từ từ khoá chung (ví dụ cùng tên với kỹ năng khác) hoặc nhãn nháp không ghi.",
        "- **Số năm kinh nghiệm sai**: " + (", ".join(f"{d['cv_id']} (nhãn {d['gold_years']}, dự đoán "
                                                    f"{d['pred_years'] if d['pred_years'] is not None else 'null'})"
                                                    for d in year_errors) or "không có") + ".",
        "- Rule-based không kiểm chứng ngữ cảnh: kỹ năng nhắc tới trong học vấn hay mô tả dự án đều được tính là kỹ năng.",
        "",
        "**Sửa parser trong US-29** (có unit test ở `ai-service/tests/test_cv.py`): lần chạy đầu tiên số năm kinh nghiệm "
        "chỉ đúng ±1 ở 15/20 CV (F1 kỹ năng không đổi 0.962). Nguyên nhân: (1) CV hai cột bị trộn dòng làm tiêu đề "
        "\"Kinh nghiệm\" không còn đứng riêng một dòng ⇒ không nhận ra mục, trả null; (2) dòng học vấn lọt vào mục kinh "
        "nghiệm và bị cộng; (3) khoảng chỉ có năm \"2023 - 2026\" bị tính từ tháng 1 tới tháng 12 (= 4 năm). Đã sửa: "
        "không nhận ra mục kinh nghiệm thì xét mọi dòng, bỏ qua dòng học vấn (đại học, university...), khoảng chỉ có năm "
        "tính bằng hiệu số năm ⇒ 20/20.",
        "",
        "**Lưu ý độ tin cậy**: CV trong bộ này do nhóm viết và phần lớn liệt kê kỹ năng bằng tên chuẩn, nên F1 rule-based "
        "nhiều khả năng **lạc quan** so với CV thật (viết tắt lạ, lỗi chính tả, kỹ năng nằm trong hình ảnh). Nên bổ sung CV "
        "thật đã ẩn danh khi có.",
        "",
        "## 5. Cách chạy lại",
        "",
        "```bash",
        "python scripts/eval/cv/run_eval.py                              # rule-based; ghi docs/eval-cv.md",
        "DEEPSEEK_API_KEY=sk-... python scripts/eval/cv/run_eval.py      # thêm DeepSeek",
        "python scripts/eval/cv/make_cvs.py                              # chỉ khi sửa cv_data.py (cần fpdf2)",
        "```",
        "",
        "Kết quả từng CV: `scripts/eval/cv/results_<engine>.csv`.",
        "",
    ]
    return "\n".join(out)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--gold", default=str(HERE / "gold.csv"))
    ap.add_argument("--report", default=str(REPO / "docs" / "eval-cv.md"))
    ap.add_argument("--no-report", action="store_true")
    args = ap.parse_args()
    rows = read_csv(pathlib.Path(args.gold))
    engines = ["RULE_BASED"] + (["DEEPSEEK"] if os.getenv("DEEPSEEK_API_KEY") else [])
    results = []
    for engine in engines:
        res = evaluate(rows, engine)
        results.append(res)
        write_csv(HERE / f"results_{engine.lower()}.csv", res["details"])
        print(f"{engine}: P={res['precision']:.3f} R={res['recall']:.3f} F1={res['f1']:.3f} "
              f"(mục tiêu {TARGETS[engine]}), năm ±1 = {res['years_ok']}/{res['n']}, fallback {res['fallbacks']}")
    if "DEEPSEEK" not in engines:
        print("DEEPSEEK: không chạy (chưa đặt DEEPSEEK_API_KEY)")
    if results[0]["sources"].get("DRAFT"):
        print("PROVISIONAL: nhãn đang dùng draft_* (rater1/rater2 trống)")
    if not args.no_report:
        pathlib.Path(args.report).write_text(report(rows, results, "DEEPSEEK" in engines), encoding="utf-8")
        print(f"Đã ghi báo cáo: {args.report}")


if __name__ == "__main__":
    main()
