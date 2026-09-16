"""
Chatbot enrichment dựa trên luật.

Thứ tự slot: TARGET_ROLE → FOCUS_AREAS → (PROJECT_EXPERIENCE nếu CV chưa có dự án, ngược lại CURRENT_GAPS)
→ TIMELINE → MENTORING_PREFERENCE. Bỏ qua slot đã "được trả lời gián tiếp" — ví dụ câu trả lời về mục tiêu
đã nêu mốc thời gian ("trong 6 tháng", kể cả gõ không dấu) thì không hỏi TIMELINE nữa.
Câu hỏi được cá nhân hoá bằng dữ liệu CV (kỹ năng, số năm kinh nghiệm, dự án).
"""
import re
import unicodedata

from app.cv.models import ParsedCv
from app.enrichment.models import Exchange, MenteeContext, NextQuestion

NAME = "RULE_BASED"

# So khớp trên văn bản đã bỏ dấu tiếng Việt để hiểu cả câu trả lời gõ không dấu ("6 thang").
TIME_MENTION = re.compile(
    r"(\d+\s*(thang|tuan|nam|months?|weeks?|years?))|(cuoi nam|dau nam|\bquy\b|truoc tet|deadline|ky thuc tap|hoc ky)",
    re.IGNORECASE)


def strip_accents(s: str) -> str:
    decomposed = unicodedata.normalize("NFD", s)
    return "".join(c for c in decomposed if not unicodedata.category(c).startswith("M")).replace("đ", "d").replace("Đ", "D")


def slot_order(cv: ParsedCv) -> list[str]:
    order = ["TARGET_ROLE", "FOCUS_AREAS",
             "PROJECT_EXPERIENCE" if not cv.projects else "CURRENT_GAPS",
             "TIMELINE",
             "CURRENT_GAPS" if not cv.projects else "MENTORING_PREFERENCE",
             "MENTORING_PREFERENCE"]
    return list(dict.fromkeys(order))


def covered_slots(history: list[Exchange]) -> set[str]:
    covered = {e.slot for e in history}
    if any(e.answer and TIME_MENTION.search(strip_accents(e.answer)) for e in history):
        covered.add("TIMELINE")
    return covered


def question_for(slot: str, ctx: MenteeContext) -> str:
    cv = ctx.cv
    skills = ", ".join(cv.skills[:4]) if cv.skills else None
    if slot == "TARGET_ROLE":
        if skills is None:
            intro = "Mình đã đọc CV của bạn. "
        else:
            years = f" (khoảng {cv.years_experience} năm)" if cv.years_experience else ""
            intro = f"Mình thấy CV của bạn có kinh nghiệm với {skills}{years}. "
        return intro + ("Trong thời gian tới, bạn muốn đạt được mục tiêu nghề nghiệp cụ thể nào "
                        "(ví dụ: vị trí mong muốn, chuẩn bị phỏng vấn, chuyển hướng công nghệ)?")
    if slot == "FOCUS_AREAS":
        return ("" if skills is None else f"Ngoài {skills} mà bạn đã có, ") + \
            "bạn muốn mentor giúp bạn tập trung đào sâu những kiến thức/kỹ năng nào nhất?"
    if slot == "PROJECT_EXPERIENCE":
        return ("CV của bạn chưa nêu dự án cụ thể. Bạn đã từng tự làm hoặc tham gia dự án nào (kể cả bài tập lớn) "
                "chưa? Bạn đảm nhận phần việc gì?")
    if slot == "CURRENT_GAPS":
        if not cv.projects:
            return "Khi tự học, bạn thường gặp khó khăn gì nhất?"
        return f'Khi làm dự án "{cv.projects[0].name}", phần nào khiến bạn thấy khó khăn hoặc chưa tự tin nhất?'
    if slot == "TIMELINE":
        return "Bạn mong muốn đạt được mục tiêu trên trong khoảng thời gian bao lâu?"
    if slot == "MENTORING_PREFERENCE":
        return ("Bạn mong muốn mentor hỗ trợ theo hình thức nào (review code, định hướng lộ trình, luyện phỏng vấn...) "
                "và tần suất bao nhiêu buổi mỗi tháng?")
    return "Bạn còn điều gì muốn mentor biết thêm không?"


def next_question(ctx: MenteeContext, history: list[Exchange]) -> NextQuestion:
    covered = covered_slots(history)
    for slot in slot_order(ctx.cv):
        if slot not in covered:
            return NextQuestion(slot=slot, question=question_for(slot, ctx))
    return NextQuestion(slot="FREE_FORM", question="Bạn còn điều gì muốn mentor biết thêm về bản thân hoặc mục tiêu học tập không?")


def _clean(s: str) -> str:
    return re.sub(r"[.。]+$", "", re.sub(r"\s+", " ", s.strip()))


def summarize_goal(ctx: MenteeContext, history: list[Exchange]) -> str:
    answers: dict[str, str] = {}
    for e in history:
        if e.answer and e.answer.strip():
            answers[e.slot] = answers[e.slot] + "; " + _clean(e.answer) if e.slot in answers else _clean(e.answer)
    labels = [("TARGET_ROLE", "Mục tiêu"), ("FOCUS_AREAS", "Muốn tập trung vào"), ("PROJECT_EXPERIENCE", "Kinh nghiệm thực hành"),
              ("CURRENT_GAPS", "Khó khăn hiện tại"), ("TIMELINE", "Thời gian mong muốn"),
              ("MENTORING_PREFERENCE", "Mong muốn về mentoring"), ("FREE_FORM", "Thông tin thêm")]
    parts = [f"{label}: {answers[slot]}" for slot, label in labels if slot in answers]

    cv = ctx.cv
    background = "Nền tảng hiện có (từ CV): " + (", ".join(cv.skills[:10]) if cv.skills else "chưa nêu kỹ năng cụ thể")
    if cv.years_experience:
        background += f"; khoảng {cv.years_experience} năm kinh nghiệm"
    if cv.projects:
        background += "; đã làm dự án " + ", ".join(p.name for p in cv.projects[:3])
    parts.append(background)
    result = ". ".join(parts) + "."
    return result[:2900] + "…" if len(result) > 2900 else result
