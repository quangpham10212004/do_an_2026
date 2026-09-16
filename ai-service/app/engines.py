"""
Chọn engine AI cho từng yêu cầu.

- Client gửi kèm `engine` đã dùng ở các lượt trước (lưu trong DB của mentoring-service) để một buổi phỏng
  vấn / hội thoại dùng nhất quán một engine.
- Không gửi (lượt đầu) → DEEPSEEK nếu có DEEPSEEK_API_KEY, ngược lại RULE_BASED.
- Yêu cầu DEEPSEEK nhưng server không có key → RULE_BASED.
"""
from app.llm.deepseek import get_client

DEEPSEEK = "DEEPSEEK"
RULE_BASED = "RULE_BASED"


def select(preferred: str | None) -> str:
    if preferred == RULE_BASED:
        return RULE_BASED
    return DEEPSEEK if get_client().enabled else RULE_BASED
