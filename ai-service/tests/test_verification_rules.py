"""Luật đợt xác thực mentor (docs/design-mentor-verification.md §3–4) — hàm thuần, không CSDL."""
from datetime import datetime, timedelta, timezone

import pytest

from app.verification import rules

NOW = datetime(2026, 11, 10, 3, 0, tzinfo=timezone.utc)


def test_two_failed_attempts_exhaust_the_round():
    assert rules.attempts_left(0, 2) == 2 and not rules.exhausted(0, 2)
    assert rules.attempts_left(1, 2) == 1 and not rules.exhausted(1, 2)
    assert rules.attempts_left(2, 2) == 0 and rules.exhausted(2, 2)
    assert rules.attempts_left(5, 2) == 0


def test_retake_is_capped_per_application():
    assert rules.can_retake(0, 2) and rules.can_retake(1, 2)
    assert not rules.can_retake(2, 2)


def test_retry_after_is_closing_time_plus_days():
    assert rules.retry_after(NOW, 15) == NOW + timedelta(days=15)


@pytest.mark.parametrize("status, expected", [
    ("ROUND1", "PENDING_INTERVIEW"), ("ROUND1_REVIEW", "PENDING_REVIEW"), ("ROUND2_PENDING_SLOTS", "PENDING_REVIEW"),
    ("ROUND2_PENDING_CHOICE", "PENDING_REVIEW"), ("ROUND2_SCHEDULED", "PENDING_REVIEW"),
    ("APPROVED", "APPROVED"), ("REJECTED", "REJECTED"), ("CLOSED", "REJECTED"),
])
def test_application_status_maps_to_profile_verification_status(status, expected):
    assert rules.profile_status(status) == expected


def test_first_visit_can_start():
    s = rules.start_state(None, False, None, None, NOW)
    assert s.can_start and s.reason is None


def test_open_round1_can_start_and_resumes_in_progress_interview():
    assert rules.start_state("ROUND1", False, "ROUND1", None, NOW) == rules.StartState(True, None)
    assert rules.start_state("ROUND1", True, "ROUND1", None, NOW) == rules.StartState(True, "IN_PROGRESS")


@pytest.mark.parametrize("status", ["ROUND1_REVIEW", "ROUND2_PENDING_SLOTS", "ROUND2_PENDING_CHOICE", "ROUND2_SCHEDULED"])
def test_waiting_for_admin_blocks_a_new_start(status):
    assert rules.start_state(status, False, status, None, NOW) == rules.StartState(False, "PENDING_REVIEW")


def test_approved_application_blocks_a_new_start():
    assert rules.start_state(None, False, "APPROVED", None, NOW) == rules.StartState(False, "ALREADY_APPROVED")


@pytest.mark.parametrize("status", ["REJECTED", "CLOSED"])
def test_closed_application_waits_until_retry_after(status):
    until = NOW + timedelta(days=3)
    s = rules.start_state(None, False, status, until, NOW)
    assert not s.can_start and s.reason == "COOLDOWN" and s.cooldown_until == until
    assert rules.start_state(None, False, status, NOW - timedelta(seconds=1), NOW) == rules.StartState(True, None)


def test_round1_decisions_map_to_the_rubric_vocabulary():
    assert rules.ROUND1_CHOICE == {"PASS": "APPROVE", "REJECT": "REJECT", "RETAKE": "REQUEST_RETAKE"}
