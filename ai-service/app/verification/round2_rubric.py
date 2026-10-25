"""
Phiếu chấm thống nhất của vòng 2 (docs/design-mentor-verification.md §6.3, D11) — MỘT nơi duy nhất tính điểm.

| Tiêu chí                       | Trọng số |
|--------------------------------|----------|
| technical (kỹ thuật)           | 30%      |
| depth (kinh nghiệm thực tế)    | 25%      |
| communication (giao tiếp)      | 10%      |
| mentoring (hướng dẫn)          | 20%      |
| authenticity (xác thực, cam kết)| 15%     |

Cùng thang 0–10 và cùng ngưỡng khuyến nghị với vòng 1 (rubric.py) để so sánh được. Trọng số và ngưỡng là HẰNG SỐ trong mã.
"""
from app.interview import rubric

WEIGHTS: dict[str, float] = {"technical": 0.30, "depth": 0.25, "communication": 0.10, "mentoring": 0.20, "authenticity": 0.15}
CRITERIA = tuple(WEIGHTS)
# Bốn tiêu chí AI cũng chấm ở vòng 1 → so sánh điểm admin với điểm AI
SHARED_WITH_AI = ("technical", "depth", "communication", "mentoring")
# Điều kiện chặn: một trong các tiêu chí này ≤ ngưỡng thì khuyến nghị tối đa là NEEDS_REVIEW
BLOCKING = ("technical", "authenticity")
BLOCK_AT_OR_BELOW = 2.0
# Bằng chứng: tiêu chí chấm ≤ 2 hoặc ≥ 9 phải kèm lý do
EVIDENCE_AT_OR_BELOW = 2.0
EVIDENCE_AT_OR_ABOVE = 9.0
MIN_NOTE = 10
# Chênh từ mức này trở lên giữa điểm admin và điểm AI ở một tiêu chí → đánh dấu "lệch lớn" (chỉ thông tin)
LARGE_GAP = 4.0


def scores_error(scores: dict[str, float] | None) -> str | None:
    """APPROVE / REJECT bắt buộc đủ 5 điểm, mỗi điểm 0–10."""
    if not scores or set(scores) != set(CRITERIA):
        return "SCORES_REQUIRED"
    if any(not isinstance(v, (int, float)) or v < 0 or v > 10 for v in scores.values()):
        return "SCORE_OUT_OF_RANGE"
    return None


def total_score(scores: dict[str, float]) -> float:
    """Điểm tổng 0–100 = Σ trọng số × điểm tiêu chí × 10."""
    return rubric.round1(sum(WEIGHTS[k] * scores[k] for k in CRITERIA) * 10)


def blocked(scores: dict[str, float]) -> bool:
    return any(scores[k] <= BLOCK_AT_OR_BELOW for k in BLOCKING)


def recommend(scores: dict[str, float]) -> str:
    """Khuyến nghị theo cùng ngưỡng vòng 1; điều kiện chặn hạ APPROVE xuống NEEDS_REVIEW (REJECT giữ nguyên)."""
    base = rubric.recommend(total_score(scores), False)
    return "NEEDS_REVIEW" if base == "APPROVE" and blocked(scores) else base


def evidence_missing(scores: dict[str, float], notes: dict[str, str] | None) -> list[str]:
    """Các tiêu chí chấm quá thấp / quá cao mà chưa có lý do đủ MIN_NOTE ký tự."""
    notes = notes or {}
    return [k for k in CRITERIA
            if (scores[k] <= EVIDENCE_AT_OR_BELOW or scores[k] >= EVIDENCE_AT_OR_ABOVE) and len((notes.get(k) or "").strip()) < MIN_NOTE]


def comparison(ai: dict[str, float] | None, admin: dict[str, float]) -> list[dict]:
    """Điểm AI (trung bình các lượt vòng 1) cạnh điểm admin cho 4 tiêu chí chung; delta ≥ LARGE_GAP là lệch lớn."""
    if not ai:
        return []
    rows = []
    for k in SHARED_WITH_AI:
        if k in ai and k in admin:
            delta = round(abs(ai[k] - admin[k]), 1)
            rows.append({"criterion": k, "ai": rubric.round1(ai[k]), "admin": admin[k], "delta": delta, "large": delta >= LARGE_GAP})
    return rows
