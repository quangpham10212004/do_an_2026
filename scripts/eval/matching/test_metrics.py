"""US-26 — unit test cho hàm chỉ số (ví dụ tính tay) và ràng buộc bộ dữ liệu.

    python3 -m pytest scripts/eval/matching/test_metrics.py
"""
import math
import pathlib
import sys

import pytest

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import dataset  # noqa: E402
import metrics  # noqa: E402


def test_precision_at_5_hand_computed():
    # nhãn theo thứ hạng: 2, 0, 1.5, 1, 2 → liên quan (≥1.5) ở hạng 1, 3, 5 → 3/5
    assert metrics.precision_at_k([2, 0, 1.5, 1, 2, 2], 5) == pytest.approx(0.6)
    # danh sách ngắn hơn k vẫn chia cho k
    assert metrics.precision_at_k([2, 2], 5) == pytest.approx(0.4)
    assert metrics.precision_at_k([], 5) == 0
    with pytest.raises(ValueError):
        metrics.precision_at_k([2], 0)


def test_dcg_hand_computed():
    # DCG = (2^2-1)/log2(2) + (2^0-1)/log2(3) + (2^1-1)/log2(4) = 3 + 0 + 0.5 = 3.5
    assert metrics.dcg_at_k([2, 0, 1], 10) == pytest.approx(3.5)
    # cắt ở k=1
    assert metrics.dcg_at_k([2, 0, 1], 1) == pytest.approx(3.0)


def test_ndcg_hand_computed():
    # thứ tự [0, 2, 1]: DCG = 0 + 3/log2(3) + 1/2 = 1.892789 + 0.5 = 2.392789
    # lý tưởng [2, 1, 0]: IDCG = 3 + 1/log2(3) = 3.630930 → NDCG = 0.659000
    dcg = 3 / math.log2(3) + 0.5
    idcg = 3 + 1 / math.log2(3)
    assert metrics.ndcg_at_k([0, 2, 1], [2, 1, 0], 10) == pytest.approx(dcg / idcg)
    assert metrics.ndcg_at_k([0, 2, 1], [2, 1, 0], 10) == pytest.approx(0.6590, abs=1e-4)
    assert metrics.ndcg_at_k([2, 1, 0], [0, 1, 2], 10) == pytest.approx(1.0)
    assert metrics.ndcg_at_k([0, 0], [0, 0], 10) == 0.0  # không có mục liên quan


def test_ndcg_ideal_uses_all_judged_labels():
    # mục nhãn 2 nằm ngoài top-1: NDCG@1 của [1] với pool [1, 2] = 1 / 3
    assert metrics.ndcg_at_k([1], [1, 2], 1) == pytest.approx(1 / 3)


def test_resolve_label_prefers_two_raters_then_one_then_draft():
    assert metrics.resolve_label("2", "1", "0") == (1.5, "raters")
    assert metrics.resolve_label("", " 1 ", "2") == (1.0, "one_rater")
    assert metrics.resolve_label(None, None, "2") == (2.0, "draft")
    assert metrics.resolve_label("", "", "") == (0.0, "draft")


def test_weighted_score_matches_production_formula():
    f = {"similarity": "0.8", "rating": "4.5", "rating_count": "10", "years_experience": "20", "availability_overlap": "0.5"}
    # 0.7*0.8 + 0.2*0.9 + 0.1*1.0 = 0.84 (availability trọng số 0)
    assert metrics.weighted_score(f, metrics.CURRENT_WEIGHTS) == pytest.approx(0.84)
    # chưa có đánh giá → rating trung tính 3.5: 0.7*0.8 + 0.2*0.7 + 0.1*1 = 0.80
    assert metrics.weighted_score({**f, "rating_count": "0"}, metrics.CURRENT_WEIGHTS) == pytest.approx(0.80)
    # trọng số mới: 0.6*0.8 + 0.15*0.9 + 0.1*1 + 0.15*0.5 = 0.79
    assert metrics.weighted_score(f, metrics.NEW_WEIGHTS) == pytest.approx(0.79)


def test_rank_by_orders_by_score_with_deterministic_ties():
    base = {"rating": "4", "rating_count": "1", "years_experience": "5", "availability_overlap": "1"}
    feats = [{**base, "mentor": "b", "similarity": "0.5"}, {**base, "mentor": "a", "similarity": "0.5"},
             {**base, "mentor": "c", "similarity": "0.9"}]
    assert metrics.rank_by(feats, metrics.CURRENT_WEIGHTS) == ["c", "a", "b"]


def test_dataset_constraints():
    dataset.check_dataset()
    mentees = dataset.mentee_dicts()
    assert sum(1 for e in mentees if e["goal_language"] == "vi") >= 10
    assert sum(1 for e in mentees if e["goal_language"] == "en") >= 10


def test_availability_overlap():
    mentor = {"slots": [(1, "19:00", "21:00"), (3, "07:00", "09:00")]}
    assert dataset.availability_overlap(mentor, {"preferred_days": [1, 3], "preferred_time_of_day": "EVENING"}) == 0.5
    assert dataset.availability_overlap(mentor, {"preferred_days": [1, 3], "preferred_time_of_day": None}) == 1.0
    assert dataset.availability_overlap(mentor, {"preferred_days": [], "preferred_time_of_day": None}) == 1.0
    assert dataset.availability_overlap(mentor, {"preferred_days": [2], "preferred_time_of_day": "EVENING"}) == 0.0
