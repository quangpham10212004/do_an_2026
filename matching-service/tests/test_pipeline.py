# Ràng buộc hệ thống (notVerified, unavailable, noSchedule, fullCapacity, domainMismatch) và bộ lọc người
# dùng được áp ở tầng ứng dụng sau khi ANN lấy dư K ứng viên — vòng lặp mở rộng K được test ở đây bằng
# DB giả, còn SQL thật được test trên Postgres ở test_matching_db.py.
import pytest

from app.services import matching_pipeline
from app.services.match_filters import MatchFilters
from app.services.matching_pipeline import (
    NEUTRAL_RATING,
    explain,
    re_rank,
    split_by_system_constraints,
)


def mentor(**overrides) -> dict:
    base = {
        "mentor_id": "m",
        "display_name": "Mentor",
        "domain": "backend",
        "skills": ["Java", "Spring Boot"],
        "capacity": 3,
        "active_mentee_count": 0,
        "is_accepting": True,
        "has_schedule": True,
        "verification_status": "APPROVED",
        "rating": 4.5,
        "rating_count": 10,
        "years_experience": 5,
        "distance": 0.3,
    }
    base.update(overrides)
    return base


def test_re_rank_orders_by_final_score():
    candidates = [
        mentor(mentor_id="far", distance=0.5, rating=3.0, years_experience=2),
        mentor(mentor_id="near", distance=0.1, rating=5.0, years_experience=8),
    ]
    ranked = re_rank(candidates)
    assert ranked[0]["mentor_id"] == "near"
    assert ranked[0]["final_score"] > ranked[1]["final_score"]


def test_re_rank_formula():
    [c] = re_rank([mentor(distance=0.2, rating=4.0, rating_count=3, years_experience=20)])
    # 0.7*0.8 + 0.2*(4/5) + 0.1*1.0 = 0.56 + 0.16 + 0.1
    assert c["similarity_score"] == 0.8
    assert abs(c["final_score"] - 0.82) < 1e-6


def test_re_rank_uses_neutral_rating_for_unrated_mentor():
    [c] = re_rank([mentor(distance=0.0, rating=0.0, rating_count=0, years_experience=0)])
    assert abs(c["final_score"] - (0.7 + 0.2 * NEUTRAL_RATING / 5)) < 1e-6


def test_similarity_is_clamped_to_unit_interval():
    [c] = re_rank([mentor(distance=1.4)])
    assert c["similarity_score"] == 0.0


def test_similarity_can_beat_rating():
    """Tương đồng nội dung là tín hiệu chính: mentor rất phù hợp nhưng rating thấp
    vẫn đứng trên mentor không liên quan nhưng rating cao."""
    ranked = re_rank([
        mentor(mentor_id="relevant", distance=0.15, rating=3.0, years_experience=3),
        mentor(mentor_id="famous", distance=0.7, rating=5.0, years_experience=15),
    ])
    assert ranked[0]["mentor_id"] == "relevant"


def test_explain_lists_matched_skills_goal_hits_and_domain():
    [c] = re_rank([mentor(skills=["Java", "Spring Boot", "System Design", "Kafka"], distance=0.3,
                          rating=4.8, rating_count=12, years_experience=8)])
    mentee = {"domain": "backend", "skills": ["java"], "goal": "Chuẩn bị phỏng vấn, muốn học system design"}
    reasons, matched = explain(c, mentee)
    assert matched == ["Java", "System Design"]
    assert "Trùng kỹ năng: Java" in reasons
    assert "Có chuyên môn phù hợp mục tiêu của bạn: System Design" in reasons
    assert "Cùng lĩnh vực backend" in reasons
    assert any(r.startswith("Hồ sơ rất tương đồng") for r in reasons)
    assert any(r.startswith("Được đánh giá cao") for r in reasons)
    assert "8 năm kinh nghiệm" in reasons


def test_explain_goal_match_requires_whole_word():
    [c] = re_rank([mentor(skills=["Go"])])
    reasons, matched = explain(c, {"domain": "backend", "skills": [], "goal": "Tôi muốn học Google Cloud"})
    assert matched == []


# --- Over-fetch + lọc ở ứng dụng ---------------------------------------------------------------------

def test_split_by_system_constraints_counts_each_reason():
    rows = [{"reason": None}, {"reason": "notVerified"}, {"reason": "notVerified"}, {"reason": "fullCapacity"}]
    passed, excluded = split_by_system_constraints(rows)
    assert passed == [{"reason": None}]
    assert excluded == {"notVerified": 2, "fullCapacity": 1}


class FakeIndex:
    """`total` mentor xếp theo độ gần; mentor có số thứ tự < `blocked` bị bộ lọc loại (toàn mentor gần nhất)."""

    def __init__(self, total: int, blocked: int):
        self.total, self.blocked, self.ks = total, blocked, []

    async def nearest(self, mentee_id, k):
        self.ks.append(k)
        return [{"mentor_id": f"m{i}", "distance": i / 1000} for i in range(min(k, self.total))]

    async def facts(self, mentor_ids, mentee_domain, filters):
        return [
            {**mentor(mentor_id=m, rating_count=0, years_experience=0), "reason": None,
             "rate_ok": int(m[1:]) >= self.blocked, "free_ok": True, "language_ok": True, "session_ok": True,
             "rating_ok": True, "days_ok": True, "time_ok": True, "days_time_ok": True}
            for m in mentor_ids
        ]


@pytest.fixture
def fake_index(monkeypatch):
    def install(total, blocked):
        index = FakeIndex(total, blocked)
        monkeypatch.setattr(matching_pipeline, "nearest_mentors", index.nearest)
        monkeypatch.setattr(matching_pipeline, "mentor_facts", index.facts)
        return index
    return install


MENTEE = {"user_id": "u", "domain": "backend", "skills": [], "goal": ""}


@pytest.mark.anyio
async def test_run_doubles_k_until_enough_eligible_mentors(fake_index):
    """60 mentor gần nhất đều bị bộ lọc giá loại: K=50 lọc xong còn 0 => phải mở rộng lên K=100."""
    index = fake_index(total=90, blocked=60)
    result = await matching_pipeline._run(MENTEE, MatchFilters(max_rate=150000), 10, [])
    assert index.ks == [50, 100]
    assert len(result["mentors"]) == 10
    assert all(int(m["mentor_id"][1:]) >= 60 for m in result["mentors"])
    assert result["excluded_by"] == {"maxRate": 60}
    assert result["stats"]["k"] == 100 and result["stats"]["considered"] == 90


@pytest.mark.anyio
async def test_run_does_not_widen_when_first_fetch_is_enough(fake_index):
    index = fake_index(total=500, blocked=0)
    result = await matching_pipeline._run(MENTEE, MatchFilters(max_rate=150000), 10, [])
    assert index.ks == [50]
    assert len(result["mentors"]) == 10


@pytest.mark.anyio
async def test_run_stops_once_the_index_is_exhausted(fake_index):
    """Chỉ 30 mentor trong chỉ mục và 25 bị loại: dừng sau lần ANN trả ít hơn K, trả 5 chứ không lặp vô hạn."""
    index = fake_index(total=30, blocked=25)
    result = await matching_pipeline._run(MENTEE, MatchFilters(max_rate=150000), 10, [])
    assert index.ks == [50]
    assert len(result["mentors"]) == 5


@pytest.mark.anyio
async def test_run_never_returns_excluded_mentor_ids(fake_index):
    fake_index(total=20, blocked=0)
    result = await matching_pipeline._run(MENTEE, MatchFilters(), 10, ["m0", "m1"])
    assert {"m0", "m1"}.isdisjoint(m["mentor_id"] for m in result["mentors"])
    assert len(result["mentors"]) == 10
