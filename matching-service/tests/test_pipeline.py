# Ràng buộc hệ thống (notVerified, unavailable, noSchedule, fullCapacity, domainMismatch) giờ được áp
# bằng SQL trên profile_db TRƯỚC khi xếp hạng (US-17) — test trên Postgres thật ở test_matching_db.py.
from app.services.matching_pipeline import (
    NEUTRAL_RATING,
    explain,
    re_rank,
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
