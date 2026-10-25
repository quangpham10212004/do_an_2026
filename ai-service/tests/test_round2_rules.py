"""Vòng 2 — luật lịch (round2_rules) và phiếu chấm thống nhất (round2_rubric): hàm thuần, không CSDL."""
from datetime import datetime, timedelta, timezone

import pytest

from app.verification import round2_rubric as rb
from app.verification import round2_rules as r

NOW = datetime(2026, 11, 10, 3, 0, tzinfo=timezone.utc)
H = timedelta(hours=1)


# ---------- khung giờ ----------

def test_slots_must_exist_be_unique_and_in_the_future():
    soon, later = NOW + timedelta(minutes=30), NOW + timedelta(days=2)
    assert r.validate_slots([], NOW, H, 3) == "SLOTS_REQUIRED"
    assert r.validate_slots([later, later + H, later + 2 * H, later + 3 * H], NOW, H, 3) == "TOO_MANY_SLOTS"
    assert r.validate_slots([later, later], NOW, H, 3) == "DUPLICATE_SLOTS"
    assert r.validate_slots([later, soon], NOW, H, 3) == "SLOT_TOO_SOON"
    assert r.validate_slots([later, later + H, later + 2 * H], NOW, H, 3) is None


def test_choice_deadline_is_three_days_after_the_proposal():
    assert r.choice_deadline(NOW, 3) == NOW + timedelta(days=3)


# ---------- đổi giờ (D9) ----------

def test_reschedule_needs_24_hours_notice():
    notice = timedelta(hours=24)
    assert r.reschedule_error(NOW, NOW + timedelta(hours=25), 0, 2, notice) is None
    assert r.reschedule_error(NOW, NOW + timedelta(hours=24), 0, 2, notice) is None
    assert r.reschedule_error(NOW, NOW + timedelta(hours=23, minutes=59), 0, 2, notice) == "RESCHEDULE_TOO_LATE"


def test_reschedule_is_limited_to_two_per_application():
    notice = timedelta(hours=24)
    assert r.reschedule_error(NOW, NOW + timedelta(days=3), 1, 2, notice) is None
    assert r.reschedule_error(NOW, NOW + timedelta(days=3), 2, 2, notice) == "RESCHEDULE_LIMIT"
    assert r.reschedule_error(NOW, NOW + timedelta(hours=1), 2, 2, notice) == "RESCHEDULE_LIMIT"  # hết lượt được báo trước


# ---------- phòng và vắng mặt ----------

def test_room_opens_before_the_start_and_has_no_scheduled_end():
    window = r.room_window(NOW, timedelta(minutes=10), 4)
    assert window == (NOW - timedelta(minutes=10), NOW + timedelta(hours=4))
    assert not r.room_open(NOW - timedelta(minutes=11), window)
    assert r.room_open(NOW - timedelta(minutes=10), window) and r.room_open(NOW + timedelta(hours=3, minutes=59), window)
    assert not r.room_open(NOW + timedelta(hours=4, minutes=1), window)


def test_absence_follows_the_join_log_after_the_grace_period():
    grace = timedelta(minutes=10)
    assert r.absence_error(NOW + timedelta(minutes=5), NOW, None, grace) == "GRACE_NOT_ELAPSED"
    assert r.absence_error(NOW + timedelta(minutes=10), NOW, None, grace) is None
    assert r.absence_error(NOW + timedelta(minutes=30), NOW, NOW + timedelta(minutes=2), grace) == "MENTOR_ALREADY_JOINED"


def test_two_no_shows_close_the_application():
    assert not r.no_show_closes(1, 2) and r.no_show_closes(2, 2)


# ---------- phiếu chấm ----------

GOOD = {"technical": 8, "depth": 7, "communication": 7, "mentoring": 7, "authenticity": 8}


def test_weights_sum_to_one_and_match_the_spec():
    assert rb.WEIGHTS == {"technical": 0.30, "depth": 0.25, "communication": 0.10, "mentoring": 0.20, "authenticity": 0.15}
    assert round(sum(rb.WEIGHTS.values()), 6) == 1


def test_total_is_the_weighted_sum_times_ten():
    assert rb.total_score({k: 10 for k in rb.CRITERIA}) == 100
    assert rb.total_score({k: 0 for k in rb.CRITERIA}) == 0
    assert rb.total_score(GOOD) == 74.5  # (2.4 + 1.75 + 0.7 + 1.4 + 1.2) × 10


def test_all_five_scores_in_range_are_required():
    assert rb.scores_error(None) == "SCORES_REQUIRED"
    assert rb.scores_error({k: 5 for k in rb.CRITERIA if k != "authenticity"}) == "SCORES_REQUIRED"
    assert rb.scores_error({**GOOD, "extra": 3}) == "SCORES_REQUIRED"
    assert rb.scores_error({**GOOD, "depth": 11}) == "SCORE_OUT_OF_RANGE"
    assert rb.scores_error({**GOOD, "depth": -1}) == "SCORE_OUT_OF_RANGE"
    assert rb.scores_error(GOOD) is None


@pytest.mark.parametrize("scores, expected", [
    ({k: 9 for k in rb.CRITERIA}, "APPROVE"),
    (GOOD, "APPROVE"),
    ({k: 6 for k in rb.CRITERIA}, "NEEDS_REVIEW"),
    ({k: 4 for k in rb.CRITERIA}, "REJECT"),
    # điểm tổng cao nhưng sai kiến thức nền / nghi gian lận => tối đa NEEDS_REVIEW
    ({**{k: 10 for k in rb.CRITERIA}, "technical": 2}, "NEEDS_REVIEW"),
    ({**{k: 10 for k in rb.CRITERIA}, "authenticity": 1}, "NEEDS_REVIEW"),
    # điều kiện chặn không cứu REJECT lên cao hơn
    ({**{k: 3 for k in rb.CRITERIA}, "technical": 1}, "REJECT"),
])
def test_recommendation_uses_round1_thresholds_and_blocking_conditions(scores, expected):
    assert rb.recommend(scores) == expected


def test_blocked_only_for_technical_and_authenticity():
    assert rb.blocked({**GOOD, "technical": 2}) and rb.blocked({**GOOD, "authenticity": 0})
    assert not rb.blocked({**GOOD, "depth": 0, "communication": 0, "mentoring": 0})
    assert not rb.blocked({**GOOD, "technical": 2.5})


def test_extreme_scores_need_a_written_reason():
    scores = {**GOOD, "technical": 2, "depth": 9, "communication": 5}
    assert rb.evidence_missing(scores, None) == ["technical", "depth"]
    assert rb.evidence_missing(scores, {"technical": "Không trả lời được câu cơ bản", "depth": "ngắn"}) == ["depth"]
    assert rb.evidence_missing(scores, {"technical": "Không trả lời được câu cơ bản", "depth": "Dự án thực tế có số liệu"}) == []
    assert rb.evidence_missing(GOOD, None) == []


def test_comparison_with_ai_marks_gaps_of_four_or_more():
    rows = rb.comparison({"technical": 4.0, "depth": 7.0, "communication": 6.0, "mentoring": 2.0}, GOOD)
    by = {x["criterion"]: x for x in rows}
    assert set(by) == set(rb.SHARED_WITH_AI)  # authenticity chỉ người mới chấm
    assert by["technical"]["delta"] == 4.0 and by["technical"]["large"]
    assert by["depth"]["delta"] == 0 and not by["depth"]["large"]
    assert by["mentoring"]["delta"] == 5.0 and by["mentoring"]["large"]
    assert not by["communication"]["large"]
    assert rb.comparison(None, GOOD) == []
