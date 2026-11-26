"""Tiện ích dùng chung cho các script đánh giá offline (US-24, US-29)."""
import csv
import pathlib
import sys

REPO = pathlib.Path(__file__).resolve().parents[2]
AI_SERVICE = REPO / "ai-service"


def use_ai_service() -> None:
    """Cho phép import package `app` của ai-service (chạy engine thật, không qua HTTP)."""
    if str(AI_SERVICE) not in sys.path:
        sys.path.insert(0, str(AI_SERVICE))


def read_csv(path: pathlib.Path) -> list[dict]:
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def write_csv(path: pathlib.Path, rows: list[dict]) -> None:
    if not rows:
        return
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)


def num(value: str | None) -> float | None:
    value = (value or "").strip()
    return float(value) if value else None


PROVISIONAL_NOTICE = (
    "> **PROVISIONAL — số liệu tạm thời.** Một số mẫu còn thiếu nhãn từ hai người chấm độc lập. "
    "Số lượng theo từng nguồn nhãn được ghi trong báo cáo."
)
