from app.interview import rule_based
from app.interview.models import InterviewContext, TurnRecord
from app.interview.question_bank import topics_for

BACKEND = InterviewContext(domain="backend", skills=["Java", "Redis"], years_experience=6, bio="bio", max_turns=5)

STRONG_ANSWER = """
Tôi dùng Redis theo chiến lược cache-aside: đọc cache trước, miss thì đọc DB rồi ghi lại với TTL.
Invalidation thực hiện khi ghi dữ liệu bằng cách xoá key. Trong dự án thương mại điện tử trước đây,
latency trang sản phẩm giảm từ 300ms xuống 40ms. Để tránh stampede tôi dùng lock ngắn và jitter cho TTL,
đánh đổi là dữ liệu có thể cũ vài giây nhưng chấp nhận được với nghiệp vụ này.
"""


def turn(no, topic, strategy, answer, score=None):
    return TurnRecord(turn_no=no, topic=topic, strategy=strategy, question="q", answer=answer, score=score)


def test_first_question_prefers_topic_matching_mentor_skills():
    q = rule_based.first_question(BACKEND)
    assert q.strategy == "OPENING"
    assert q.topic == "Caching & hiệu năng"
    assert "Java" in q.question


def test_strong_answer_scores_high_and_deepens_same_topic():
    ev = rule_based.evaluate(BACKEND, [], turn(1, "Caching & hiệu năng", "OPENING", STRONG_ANSWER), False)
    assert ev.score >= 8
    assert ev.next.strategy == "DEEPEN"
    assert ev.next.topic == "Caching & hiệu năng"


def test_weak_answer_scores_low_and_pivots():
    ev = rule_based.evaluate(BACKEND, [], turn(1, "Caching & hiệu năng", "OPENING", "Không rõ lắm."), False)
    assert ev.score < 3
    assert "chưa đề cập" in ev.feedback
    assert ev.next.strategy == "PIVOT"
    assert ev.next.topic != "Caching & hiệu năng"


def test_topic_is_deepened_at_most_once():
    history = [turn(1, "Caching & hiệu năng", "OPENING", STRONG_ANSWER, 9)]
    ev = rule_based.evaluate(BACKEND, history, turn(2, "Caching & hiệu năng", "DEEPEN", STRONG_ANSWER), False)
    assert ev.next.strategy == "PIVOT"
    assert ev.next.topic != "Caching & hiệu năng"


def test_last_turn_has_no_next_question():
    assert rule_based.evaluate(BACKEND, [], turn(5, "Caching & hiệu năng", "PIVOT", STRONG_ANSWER), True).next is None


def test_full_interview_with_weak_answers_visits_five_topics():
    turns = []
    plan = rule_based.first_question(BACKEND)
    for i in range(1, 6):
        current = turn(i, plan.topic, plan.strategy, "Không biết")
        ev = rule_based.evaluate(BACKEND, turns, current, i == 5)
        turns.append(turn(i, plan.topic, plan.strategy, "Không biết", ev.score))
        if i < 5:
            plan = ev.next
    assert len({t.topic for t in turns}) == 5


def test_summary_recommendation_thresholds():
    good = [turn(1, "A", "OPENING", "a", 8), turn(2, "B", "PIVOT", "a", 7.5)]
    approve = rule_based.summarize(BACKEND, good)
    assert approve.overall_score == 77.5
    assert approve.recommendation == "APPROVE"
    assert len(approve.strengths) == 2

    reject = rule_based.summarize(BACKEND, [turn(1, "A", "OPENING", "a", 2)])
    assert reject.recommendation == "REJECT"
    assert reject.weaknesses == ["A (2.0/10)"]

    assert rule_based.summarize(BACKEND, [turn(1, "A", "OPENING", "a", 5.5)]).recommendation == "NEEDS_REVIEW"


def test_unknown_domain_falls_back_to_general_questions():
    q = rule_based.first_question(InterviewContext(domain="blockchain", skills=[], max_turns=5))
    assert q.topic in {"Kinh nghiệm dự án", "Giải quyết vấn đề", "Năng lực mentoring", "Clean code & review"}


def test_domain_aliases_are_resolved():
    assert topics_for("Frontend Web", [])[0].name == "React & quản lý state"
    assert topics_for("AI/ML", [])[0].name == "Quy trình huấn luyện mô hình"


def test_score_rounding_is_half_up():
    s = rule_based.score("cache " * 20, ["cache"])  # coverage 1.25 + depth 1 + evidence 0 = 2.25 → 2.3
    assert s.total == 2.3
