package com.mmp.mentoring.service;

import com.mmp.mentoring.exception.ApiException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * US-41 (PRD-REV-1..5) — quy tắc thuần của đánh giá (không I/O để unit test).
 *
 * - Cửa sổ: 14 ngày sau khi phiên COMPLETED (resolved_at; thiếu thì giờ kết thúc). Sửa được trong 48 giờ sau khi đăng.
 * - Có cấu trúc: tổng 1–5 + kiến thức / truyền đạt / chuẩn bị 1–5; nhận xét ≥ 20 ký tự khi tổng ≤ 2; thẻ trong danh sách.
 * - Điểm công khai: chỉ khi ≥ 3 đánh giá ("Mentor mới" trước đó); điểm hiển thị = trung bình Bayes với prior 3 đánh giá
 *   ở mức trung bình nền tảng.
 */
public final class ReviewRules {

    private ReviewRules() {
    }

    public static final Duration WINDOW = Duration.ofDays(14);
    public static final Duration EDIT_WINDOW = Duration.ofHours(48);
    public static final int LOW_RATING_COMMENT_MIN = 20;
    public static final int REPLY_MAX = 500;
    public static final int MIN_PUBLIC_REVIEWS = 3;
    public static final int PRIOR_WEIGHT = 3;
    public static final double DEFAULT_PLATFORM_MEAN = 4.0;
    public static final int MAX_TAGS = 5;
    /** Thẻ chọn sẵn (PRD-REV-2) — mã ổn định, nhãn tiếng Việt ở frontend. */
    public static final List<String> TAGS = List.of("PRACTICAL_EXAMPLES", "GOOD_LISTENER", "WELL_PREPARED", "CLEAR_EXPLANATION",
            "ACTIONABLE_ADVICE", "RAN_OVER_TIME", "STARTED_LATE", "TOO_THEORETICAL");

    /** Mốc tính cửa sổ 14 ngày: lúc phiên được kết luận COMPLETED, thiếu thì giờ kết thúc phiên. */
    public static OffsetDateTime windowEnd(OffsetDateTime completedAt, OffsetDateTime endsAt) {
        return (completedAt != null ? completedAt : endsAt).plus(WINDOW);
    }

    public static void requireInWindow(OffsetDateTime completedAt, OffsetDateTime endsAt, OffsetDateTime now) {
        if (now.isAfter(windowEnd(completedAt, endsAt))) {
            throw ApiException.conflict("REVIEW_WINDOW_CLOSED", "Chỉ đánh giá được trong 14 ngày sau khi phiên hoàn thành");
        }
    }

    public static void requireEditable(OffsetDateTime createdAt, OffsetDateTime now) {
        if (now.isAfter(createdAt.plus(EDIT_WINDOW))) {
            throw ApiException.conflict("REVIEW_EDIT_WINDOW_CLOSED", "Chỉ sửa được đánh giá trong 48 giờ sau khi đăng");
        }
    }

    public static void validateScore(Integer value, String field) {
        if (value == null || value < 1 || value > 5) {
            throw ApiException.badRequest("INVALID_REVIEW", field + " phải từ 1 đến 5");
        }
    }

    /** Trả nhận xét đã trim (null nếu rỗng); tổng ≤ 2 bắt buộc nhận xét ≥ 20 ký tự. */
    public static String validateComment(int rating, String comment) {
        String c = comment == null || comment.isBlank() ? null : comment.strip();
        if (rating <= 2 && (c == null || c.length() < LOW_RATING_COMMENT_MIN)) {
            throw ApiException.badRequest("COMMENT_REQUIRED",
                    "Đánh giá từ 2 sao trở xuống cần nhận xét ít nhất " + LOW_RATING_COMMENT_MIN + " ký tự");
        }
        return c;
    }

    public static String[] normalizeTags(List<String> tags) {
        if (tags == null) return new String[0];
        Set<String> out = new LinkedHashSet<>();
        for (String t : tags) {
            String code = t == null ? "" : t.strip().toUpperCase();
            if (!TAGS.contains(code)) {
                throw ApiException.badRequest("INVALID_REVIEW_TAG", "Thẻ không hợp lệ: " + t);
            }
            out.add(code);
        }
        if (out.size() > MAX_TAGS) {
            throw ApiException.badRequest("INVALID_REVIEW_TAG", "Tối đa " + MAX_TAGS + " thẻ");
        }
        return out.toArray(String[]::new);
    }

    public static String validateReply(String text) {
        String t = text == null ? "" : text.strip();
        if (t.isEmpty() || t.length() > REPLY_MAX) {
            throw ApiException.badRequest("INVALID_REPLY", "Phản hồi từ 1 đến " + REPLY_MAX + " ký tự");
        }
        return t;
    }

    /** Trung bình Bayes (PRD-REV-5): (prior·mean + tổng) / (prior + n), làm tròn 2 chữ số. */
    public static double bayesian(long sum, long count, Double platformMean) {
        double mean = platformMean == null ? DEFAULT_PLATFORM_MEAN : platformMean;
        return BigDecimal.valueOf((PRIOR_WEIGHT * mean + sum) / (PRIOR_WEIGHT + count))
                .setScale(2, RoundingMode.HALF_UP).doubleValue();
    }

    public static boolean isPublic(long count) {
        return count >= MIN_PUBLIC_REVIEWS;
    }

    /**
     * Huy hiệu "đáng tin cậy" của mentee (PRD-REV-4) từ nhận xét riêng của các mentor: cần ≥ 3 nhận xét; RELIABLE khi
     * trung bình chuẩn bị và tham gia đều ≥ 4; null khi chưa đủ dữ liệu hoặc chưa đạt.
     */
    public static String reliabilityBadge(long count, double avgPreparation, double avgEngagement) {
        if (count < MIN_PUBLIC_REVIEWS) return null;
        return avgPreparation >= 4.0 && avgEngagement >= 4.0 ? "RELIABLE" : null;
    }
}
