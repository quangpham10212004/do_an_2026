"""Quy tắc video vòng 1 — hàm thuần: khoảng trống camera, chép lời kép, Range."""
import pytest

from app.verification import video_rules as r
from app.verification.video_service import _parse_range


def chunk(start_s, dur_s=10):
    return {"startMs": start_s * 1000, "durMs": dur_s * 1000}


def test_no_chunks_means_the_camera_never_came_on():
    gaps = r.analyze_gaps([], 10)
    assert gaps.detected and gaps.total_seconds == 0
    assert r.duration_seconds([]) is None


def test_contiguous_chunks_have_no_gap():
    gaps = r.analyze_gaps([chunk(0), chunk(10), chunk(20)], 10)
    assert not gaps.detected and gaps.total_seconds == 0
    assert r.duration_seconds([chunk(0), chunk(10), chunk(20)]) == 30


def test_small_hiccup_under_the_threshold_is_ignored():
    gaps = r.analyze_gaps([chunk(0), chunk(15)], 10)  # trống 5 giây
    assert not gaps.detected and gaps.total_seconds == 0


def test_gap_over_the_threshold_is_flagged_and_summed():
    gaps = r.analyze_gaps([chunk(0), chunk(40), chunk(50), chunk(90)], 10)  # trống 30 giây rồi 30 giây
    assert gaps.detected and gaps.total_seconds == 60
    assert not r.invalidated(gaps, 60)
    assert r.invalidated(r.Gaps(True, 60.1), 60)


def test_chunks_are_ordered_by_start_time_and_overlaps_do_not_count():
    gaps = r.analyze_gaps([chunk(20), chunk(0), chunk(10), chunk(5, 30)], 10)
    assert not gaps.detected


def test_identical_transcripts_do_not_differ():
    assert r.transcript_diff("Tôi dùng Redis, cache-aside!", "toi dung redis cache aside") > 0  # dấu tiếng Việt khác nhau
    assert r.transcript_diff("Tôi dùng Redis, cache-aside!", "tôi dùng REDIS cache aside") == 0


def test_normalization_ignores_case_and_punctuation():
    assert r.normalize("Xin chào,  bạn!  OK?") == ["xin", "chào", "bạn", "ok"]


def test_empty_and_one_sided_transcripts():
    assert r.transcript_diff("", "") == 0
    assert r.transcript_diff("có chữ", "") == 1
    assert r.transcript_diff("", "có chữ") == 1


def test_diff_grows_with_the_number_of_changed_words():
    base = "tôi dùng redis theo chiến lược cache aside với ttl và invalidation khi ghi"
    slight = base.replace("redis", "memcached")
    heavy = "hoàn toàn khác nội dung câu trả lời gốc không liên quan gì tới cache"
    assert 0 < r.transcript_diff(base, slight) < r.transcript_diff(base, heavy) <= 1
    assert not r.transcript_mismatch(r.transcript_diff(base, slight), 0.30)
    assert r.transcript_mismatch(r.transcript_diff(base, heavy), 0.30)


@pytest.mark.parametrize("header, expected", [
    (None, None), ("bytes=0-99", (0, 99)), ("bytes=100-", (100, 999)), ("bytes=-200", (800, 999)),
    ("bytes=900-5000", (900, 999)), ("bytes=2000-3000", None), ("bytes=5-1", None), ("items=0-1", None),
    ("bytes=0-1,5-9", None), ("bytes=abc-1", None),
])
def test_parse_range(header, expected):
    assert _parse_range(header, 1000) == expected
