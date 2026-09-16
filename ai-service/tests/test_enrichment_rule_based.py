from app.cv.models import ParsedCv, Project
from app.enrichment import rule_based
from app.enrichment.models import Exchange, MenteeContext

CV_WITH_PROJECTS = ParsedCv(current_role="Backend Developer", skills=["Java", "Spring Boot"], years_experience=2,
                            projects=[Project(name="Hệ thống đặt vé", technologies=["Java"])], summary="s")
CV_WITHOUT_PROJECTS = ParsedCv(skills=["Python"], summary="s")


def ctx(cv):
    return MenteeContext(domain="backend", current_level="BEGINNER", current_goal="Học backend", cv=cv, max_turns=4)


def ex(no, slot, answer):
    return Exchange(turn_no=no, slot=slot, question="q", answer=answer)


def test_first_question_references_cv():
    q = rule_based.next_question(ctx(CV_WITH_PROJECTS), [])
    assert q.slot == "TARGET_ROLE"
    assert "Java, Spring Boot" in q.question and "khoảng 2 năm" in q.question


def test_asks_about_projects_only_when_cv_has_none():
    history = [ex(1, "TARGET_ROLE", "Backend developer"), ex(2, "FOCUS_AREAS", "System design")]
    assert rule_based.next_question(ctx(CV_WITHOUT_PROJECTS), history).slot == "PROJECT_EXPERIENCE"
    q = rule_based.next_question(ctx(CV_WITH_PROJECTS), history)
    assert q.slot == "CURRENT_GAPS" and "Hệ thống đặt vé" in q.question


def test_skips_timeline_when_already_mentioned():
    history = [ex(1, "TARGET_ROLE", "Đi làm backend trong 6 tháng tới"), ex(2, "FOCUS_AREAS", "Spring Security"),
               ex(3, "CURRENT_GAPS", "Chưa hiểu transaction")]
    assert rule_based.next_question(ctx(CV_WITH_PROJECTS), history).slot == "MENTORING_PREFERENCE"


def test_timeline_detection_without_diacritics():
    assert "TIMELINE" in rule_based.covered_slots([ex(1, "TARGET_ROLE", "Lam backend trong 6 thang toi")])
    assert rule_based.strip_accents("Đặt mục tiêu trong 3 tháng") == "Dat muc tieu trong 3 thang"


def test_never_asks_the_same_slot_twice():
    history = []
    for i in range(1, 7):
        q = rule_based.next_question(ctx(CV_WITH_PROJECTS), history)
        assert q.slot == "FREE_FORM" or all(e.slot != q.slot for e in history)
        history.append(ex(i, q.slot, f"trả lời {i}"))


def test_summary_combines_answers_and_cv_background():
    history = [ex(1, "TARGET_ROLE", "Trở thành backend developer."), ex(2, "FOCUS_AREAS", "System design và microservices"),
               ex(3, "CURRENT_GAPS", "Chưa tự tin khi thiết kế database"), ex(4, "TIMELINE", "6 tháng")]
    goal = rule_based.summarize_goal(ctx(CV_WITH_PROJECTS), history)
    assert "Mục tiêu: Trở thành backend developer" in goal
    assert "Muốn tập trung vào: System design và microservices" in goal
    assert "Thời gian mong muốn: 6 tháng" in goal
    assert "Nền tảng hiện có (từ CV): Java, Spring Boot; khoảng 2 năm kinh nghiệm; đã làm dự án Hệ thống đặt vé" in goal
