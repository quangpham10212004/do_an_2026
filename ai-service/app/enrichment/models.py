from typing import Literal

from app.cv.models import ParsedCv
from app.schemas import CamelModel

Slot = Literal["TARGET_ROLE", "FOCUS_AREAS", "PROJECT_EXPERIENCE", "CURRENT_GAPS", "TIMELINE", "MENTORING_PREFERENCE", "FREE_FORM"]

# "Ô thông tin" chatbot cần làm rõ — những thông tin CV thường KHÔNG có (FR-8.3).
SLOT_LABELS: dict[str, str] = {
    "TARGET_ROLE": "Mục tiêu nghề nghiệp",
    "FOCUS_AREAS": "Mảng muốn tập trung",
    "PROJECT_EXPERIENCE": "Kinh nghiệm thực hành",
    "CURRENT_GAPS": "Khó khăn hiện tại",
    "TIMELINE": "Thời gian mong muốn",
    "MENTORING_PREFERENCE": "Mong muốn về mentoring",
    "FREE_FORM": "Khác",
}


class MenteeContext(CamelModel):
    domain: str
    current_level: str | None = None
    current_goal: str | None = None
    cv: ParsedCv
    max_turns: int = 4


class Exchange(CamelModel):
    turn_no: int
    slot: Slot
    question: str
    answer: str | None = None


class NextQuestion(CamelModel):
    slot: Slot
    question: str
