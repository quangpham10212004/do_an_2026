"""
Quy tắc kiểm tra video vòng 1 (docs/design-mentor-verification.md §5.3–5.4). Hàm thuần, không I/O, để unit test.

- Cờ camera suy ra từ khoảng trống GIỮA CÁC ĐOẠN tải lên (không phân tích hình ảnh, D5).
- Hai bản chép lời (trình duyệt gửi / server chép lại từ âm thanh) so theo từ sau khi chuẩn hoá; lệch nhiều thì gắn cờ.
"""
import re
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher

FLAG_CAMERA_OFF = "CAMERA_OFF"
FLAG_TRANSCRIPT_MISMATCH = "TRANSCRIPT_MISMATCH"
VIDEO_FLAGS = (FLAG_CAMERA_OFF, FLAG_TRANSCRIPT_MISMATCH)

_NON_WORD = re.compile(r"[^\w\s]", re.UNICODE)


@dataclass(frozen=True)
class Gaps:
    detected: bool
    total_seconds: float  # chỉ cộng các khoảng trống vượt ngưỡng


def analyze_gaps(chunks: list[dict], max_gap_seconds: float) -> Gaps:
    """
    chunks: [{startMs, durMs}] của luồng video. Không có đoạn nào => camera chưa bao giờ bật (đã phát hiện, tổng 0).
    Khoảng trống = startMs của đoạn sau - điểm kết thúc xa nhất của các đoạn trước.
    """
    if not chunks:
        return Gaps(True, 0.0)
    ordered = sorted(chunks, key=lambda c: c["startMs"])
    cursor = ordered[0]["startMs"] + ordered[0]["durMs"]
    detected = False
    total_ms = 0.0
    for c in ordered[1:]:
        gap = c["startMs"] - cursor
        if gap > max_gap_seconds * 1000:
            detected = True
            total_ms += gap
        cursor = max(cursor, c["startMs"] + c["durMs"])
    return Gaps(detected, round(total_ms / 1000, 1))


def invalidated(gaps: Gaps, reconnect_seconds: float) -> bool:
    """Tổng thời gian mất camera vượt mức cho phép kết nối lại => lần làm bị vô hiệu."""
    return gaps.total_seconds > reconnect_seconds


def duration_seconds(chunks: list[dict]) -> float | None:
    if not chunks:
        return None
    return round(max(c["startMs"] + c["durMs"] for c in chunks) / 1000, 1)


def normalize(text: str) -> list[str]:
    """Chữ thường, bỏ dấu câu, chuẩn hoá Unicode (NFC), tách theo từ."""
    cleaned = _NON_WORD.sub(" ", unicodedata.normalize("NFC", text or "").lower())
    return cleaned.split()


def transcript_diff(a: str, b: str) -> float:
    """Tỉ lệ khác biệt theo từ giữa hai bản (0 = giống hệt, 1 = khác hoàn toàn). Cả hai rỗng => 0, một bên rỗng => 1."""
    wa, wb = normalize(a), normalize(b)
    if not wa and not wb:
        return 0.0
    if not wa or not wb:
        return 1.0
    return round(1 - SequenceMatcher(None, wa, wb, autojunk=False).ratio(), 4)


def transcript_mismatch(diff: float, threshold: float) -> bool:
    return diff > threshold
