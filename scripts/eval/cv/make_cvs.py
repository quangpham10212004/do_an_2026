"""
US-29 — sinh 20 CV PDF có lớp văn bản (scripts/eval/cv/pdf/CVxx.pdf) từ cv_data.py.

Giống scripts/make_sample_cv.py nhưng CV tiếng Việt cần font Unicode có dấu, nên dùng fpdf2 + một font TTF
(mặc định DejaVu Sans — giấy phép tự do; font được nhúng dạng subset). Chỉ cần chạy lại khi sửa cv_data.py; các PDF
đã sinh được commit sẵn nên script đánh giá (run_eval.py) không cần fpdf2.

    pip install fpdf2
    python scripts/eval/cv/make_cvs.py --font /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf

Không cài được trên máy? Chạy trong container:
    docker run --rm -v "$PWD":/repo -w /repo python:3.11-slim sh -c \
      "apt-get update -qq && apt-get install -y -qq fonts-dejavu-core && pip install -q fpdf2 && \
       python scripts/eval/cv/make_cvs.py"
"""
import argparse
from datetime import datetime, timezone
import pathlib
import sys

from fpdf import FPDF

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from cv_data import CVS  # noqa: E402

HERE = pathlib.Path(__file__).resolve().parent
FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/Library/Fonts/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
]
LINE = 6


def _pdf(font: str) -> FPDF:
    pdf = FPDF(format="A4")
    pdf.set_creator("MentorHub eval")
    pdf.set_producer("fpdf2")
    pdf.set_creation_date(datetime(2026, 11, 9, tzinfo=timezone.utc))  # PDF tất định giữa các lần sinh
    pdf.add_font("CV", fname=font)
    pdf.add_page()
    pdf.set_font("CV", size=10)
    return pdf


def _single(pdf: FPDF, lines: list[str]) -> None:
    y = 20
    for line in lines:
        if line:
            pdf.set_font("CV", size=13 if y == 20 else 10)
            pdf.text(18, y, line)
        y += LINE
        if y > 280:
            pdf.add_page()
            y = 20


def _two_column(pdf: FPDF, left: list[str], right: list[str]) -> None:
    """Vẽ xen kẽ trái/phải theo từng dòng (như CV xuất từ Word/Canva) — trích văn bản sẽ trộn hai cột."""
    y = 20
    for i in range(max(len(left), len(right))):
        if i < len(left) and left[i]:
            pdf.text(15, y, left[i])
        if i < len(right) and right[i]:
            pdf.text(75, y, right[i])
        y += LINE


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--font", default=next((f for f in FONT_CANDIDATES if pathlib.Path(f).exists()), None))
    ap.add_argument("--out", default=str(HERE / "pdf"))
    args = ap.parse_args()
    if not args.font:
        raise SystemExit("Không tìm thấy font Unicode — truyền --font <file.ttf>")
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for cv in CVS:
        pdf = _pdf(args.font)
        if cv["layout"] == "two-column":
            _two_column(pdf, cv["left"], cv["right"])
        else:
            _single(pdf, cv["lines"])
        pdf.output(str(out / f"{cv['id']}.pdf"))
    print(f"Đã sinh {len(CVS)} CV vào {out}")


if __name__ == "__main__":
    main()
