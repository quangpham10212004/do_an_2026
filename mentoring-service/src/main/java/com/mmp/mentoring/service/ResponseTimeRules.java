package com.mmp.mentoring.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * US-35 (PRD-MATCH-3) — thời gian phản hồi yêu cầu của mentor (hàm thuần để unit test).
 * Mẫu = tối đa {@link #SAMPLE} yêu cầu gần nhất đã rời PENDING trong {@link #WINDOW}: chấp nhận / từ chối tính
 * {@code respondedAt − createdAt}; hết hạn (không phản hồi) tính là {@link #NO_REPLY_HOURS}. Yêu cầu mentee tự huỷ
 * không tính. Kết quả = trung vị (giờ, 2 chữ số thập phân); null khi chưa có mẫu.
 */
public final class ResponseTimeRules {

    private ResponseTimeRules() {
    }

    public static final int SAMPLE = 20;
    public static final Duration WINDOW = Duration.ofDays(180);
    /** Hết hạn = không phản hồi: giá trị lớn để trung vị rơi vào nhóm "> 72 giờ" (responsiveness 0). */
    public static final double NO_REPLY_HOURS = 9999;

    public record Outcome(OffsetDateTime createdAt, OffsetDateTime respondedAt, boolean expired) {
    }

    public static double hours(Outcome o) {
        if (o.expired() || o.respondedAt() == null) return NO_REPLY_HOURS;
        return Math.max(0, Duration.between(o.createdAt(), o.respondedAt()).toSeconds() / 3600.0);
    }

    public static BigDecimal median(List<Outcome> outcomes) {
        if (outcomes == null || outcomes.isEmpty()) return null;
        List<Double> hs = new ArrayList<>(outcomes.stream().map(ResponseTimeRules::hours).toList());
        Collections.sort(hs);
        int n = hs.size();
        double m = n % 2 == 1 ? hs.get(n / 2) : (hs.get(n / 2 - 1) + hs.get(n / 2)) / 2;
        return BigDecimal.valueOf(Math.min(m, NO_REPLY_HOURS)).setScale(2, RoundingMode.HALF_UP);
    }
}
