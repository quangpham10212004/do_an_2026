"""
FR-10.x — rubric chấm buổi luyện phỏng vấn của mentee. MỘT nơi tính điểm cho cả hai engine (DeepSeek / rule-based).

| Tiêu chí                              | Trọng số | 0–2                    | 3–6                         | 7–10                                        |
|---------------------------------------|----------|------------------------|-----------------------------|---------------------------------------------|
| technical (kiến thức kỹ thuật)        | 35%      | Sai hoặc lạc đề        | Đúng nhưng chung chung      | Đúng, đủ ý, dùng thuật ngữ chính xác        |
| problem_solving (giải quyết & chiều sâu) | 25%   | Không có lập luận      | Có hướng giải nhưng thiếu lý do | Phân tích, so sánh phương án, nêu đánh đổi |
| communication (rõ ràng khi nói)       | 25%      | Khó theo dõi, quá ngắn | Dễ hiểu                     | Mạch lạc, đúng trọng tâm, ít từ đệm         |
| structure (STAR / cách tiếp cận)      | 15%      | Không có cấu trúc      | Có một phần                 | Đủ STAR (hành vi) / các bước rõ (kỹ thuật)  |

- Điểm câu = tổng có trọng số (0–10); điểm tổng = trung bình điểm câu × 10 (0–100). Không có khuyến nghị duyệt:
  kết quả chỉ để mentee luyện tập.
"""
from pydantic import Field

from app.interview.rubric import round1
from app.schemas import CamelModel

WEIGHTS: dict[str, float] = {"technical": 0.35, "problem_solving": 0.25, "communication": 0.25, "structure": 0.15}


class PracticeRubric(CamelModel):
    technical: float = Field(ge=0, le=10)
    problem_solving: float = Field(ge=0, le=10)
    communication: float = Field(ge=0, le=10)
    structure: float = Field(ge=0, le=10)


def turn_score(r: PracticeRubric) -> float:
    return round1(sum(WEIGHTS[k] * getattr(r, k) for k in WEIGHTS))


def overall_score(turn_scores: list[float]) -> float:
    if not turn_scores:
        return 0.0
    return round1(sum(turn_scores) / len(turn_scores) * 10)
