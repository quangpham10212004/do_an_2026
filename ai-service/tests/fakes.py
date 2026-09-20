"""Thay profile-service / mentoring-service bằng bản giả trong unit test."""
from uuid import UUID

import pytest

from app.clients import mentoring, profile

MENTOR = {
    "userId": None,
    "displayName": "Mentor Test",
    "domain": "backend",
    "skills": ["Java", "Spring Boot", "Redis"],
    "bio": "Backend engineer 8 nam kinh nghiem.",
    "yearsExperience": 8,
    "verificationStatus": "PENDING_INTERVIEW",
}

MENTEE = {
    "userId": None,
    "displayName": "Mentee Test",
    "domain": "backend",
    "currentLevel": "BEGINNER",
    "goal": "Hoc Java backend",
    "skills": ["Java"],
}


class FakeProfile:
    """Ghi lại mọi lời gọi sang profile-service để test khẳng định luồng đồng bộ."""

    def __init__(self) -> None:
        self.mentor: dict | None = dict(MENTOR)
        self.mentee: dict | None = dict(MENTEE)
        self.verifications: list[tuple[UUID, str]] = []
        self.enrichments: list[tuple[UUID, str, list[str], str]] = []
        self.enrichment_error: Exception | None = None

    async def find_mentor(self, mentor_id):
        return None if self.mentor is None else {**self.mentor, "userId": str(mentor_id)}

    async def find_mentee(self, mentee_id):
        return None if self.mentee is None else {**self.mentee, "userId": str(mentee_id)}

    async def display_name(self, user_id):
        return "Mentor Test"

    async def update_verification(self, mentor_id, status):
        self.verifications.append((mentor_id, status))

    async def apply_enrichment(self, mentee_id, goal, skills, cv_url):
        if self.enrichment_error is not None:
            error, self.enrichment_error = self.enrichment_error, None
            raise error
        self.enrichments.append((mentee_id, goal, skills, cv_url))


class FakeMentoring:
    def __init__(self) -> None:
        self.notifications: list[tuple[str, str]] = []

    async def notify_user(self, user_id, type_, title, message, link=None):
        self.notifications.append((str(user_id), type_))

    async def notify_role(self, role, type_, title, message, link=None):
        self.notifications.append((role, type_))


@pytest.fixture
def fake_profile(monkeypatch) -> FakeProfile:
    fake = FakeProfile()
    for name in ("find_mentor", "find_mentee", "display_name", "update_verification", "apply_enrichment"):
        monkeypatch.setattr(profile, name, getattr(fake, name))
    return fake


@pytest.fixture
def fake_mentoring(monkeypatch) -> FakeMentoring:
    fake = FakeMentoring()
    monkeypatch.setattr(mentoring, "notify_user", fake.notify_user)
    monkeypatch.setattr(mentoring, "notify_role", fake.notify_role)
    return fake
