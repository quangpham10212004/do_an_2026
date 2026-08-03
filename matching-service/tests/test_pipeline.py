from app.services.matching_pipeline import re_rank, hard_filter


def test_hard_filter_removes_unavailable():
    candidates = [
        {"capacity": 0, "is_available": True, "domain": "backend"},
        {"capacity": 3, "is_available": True, "domain": "backend"},
        {"capacity": 3, "is_available": False, "domain": "backend"},
        {"capacity": 3, "is_available": True, "domain": "frontend"},
    ]
    result = hard_filter(candidates, mentee_domain="backend")
    assert len(result) == 1
    assert result[0]["capacity"] == 3
    assert result[0]["domain"] == "backend"


def test_re_rank_orders_by_final_score():
    candidates = [
        {"distance": 0.5, "rating": 3.0, "years_experience": 2},
        {"distance": 0.1, "rating": 5.0, "years_experience": 8},
    ]
    ranked = re_rank(candidates)
    assert ranked[0]["distance"] == 0.1
    assert ranked[0]["final_score"] > ranked[1]["final_score"]
