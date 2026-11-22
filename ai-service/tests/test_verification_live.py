from uuid import uuid4

from app.verification import live


def answer(level: float, *, flags=None, transcript="có nội dung", topic="API"):
    return dict(topic=topic, transcript=transcript, flags=flags or [], score=level,
                rubric=dict(technical=level, depth=level, communication=level, mentoring=level))


def test_plan_has_one_question_per_topic_with_unique_ids():
    plan = live.plan("backend", ["redis"], uuid4)
    assert len(plan) == live.TOPIC_COUNT
    assert len({item["id"] for item in plan}) == len(plan)
    assert all(item["question"] and item["topic"] for item in plan)
    assert [item["topic"] for item in plan] == live.topic_names("backend", ["redis"])


def test_strong_answers_pass_automatically():
    grading = live.grade([answer(8.0) for _ in range(5)], 5)
    assert grading["outcome"] == "PASSED"
    assert grading["total"] == 4.0
    assert grading["recommendation"] == "APPROVE"
    assert grading["improvements"] == []
    assert {c["key"] for c in grading["criteria"]} == {"knowledge", "depth", "communication", "mentoring"}


def test_weak_answers_fail_with_improvements():
    grading = live.grade([answer(3.0) for _ in range(5)], 5)
    assert grading["outcome"] == "FAILED"
    assert grading["total"] < live.REJECT_SCORE
    assert 1 <= len(grading["improvements"]) <= 3


def test_borderline_goes_to_admin():
    grading = live.grade([answer(6.6) for _ in range(5)], 5)
    assert grading["outcome"] == "UNCLEAR"
    assert grading["recommendation"] == "REVIEW"
    assert grading["confidence"] == "LOW"


def test_flag_forces_review_even_with_high_score():
    answers = [answer(9.0) for _ in range(4)] + [answer(9.0, flags=["PROMPT_INJECTION"])]
    grading = live.grade(answers, 5)
    assert grading["outcome"] == "UNCLEAR"
    assert "PROMPT_INJECTION" in grading["flags"]


def test_unanswered_topics_count_as_zero():
    grading = live.grade([answer(10.0), answer(10.0)], 5)
    assert grading["total"] == 2.0
    assert grading["outcome"] == "FAILED"


def test_pass_score_matches_rubric_approve_threshold():
    assert live.PASS_SCORE == 3.5
    assert live.REJECT_SCORE == 2.5


def test_interview_view_hides_nothing_secret_and_reports_last_question():
    plan = live.plan("frontend", [], uuid4)
    details = dict(domain="frontend", plan=plan, index=len(plan) - 1, remaining=1234.4, turns=[])
    from datetime import UTC, datetime
    row = dict(id=uuid4(), track_id=uuid4(), status="IN_PROGRESS", started_at=datetime.now(UTC),
               resume_deadline=datetime.now(UTC))
    view = live.interview_view(row, details)
    assert view["question"]["isLast"] is True
    assert set(view["question"]) == {"id", "topic", "text", "isLast", "suggestedSeconds"}
    assert view["remainingSeconds"] == 1234
    details["index"] = len(plan)
    assert live.interview_view(row, details)["question"] is None
