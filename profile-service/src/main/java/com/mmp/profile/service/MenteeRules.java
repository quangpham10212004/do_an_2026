package com.mmp.profile.service;

import com.mmp.profile.entity.MenteeProfile.TimeOfDay;
import com.mmp.profile.exception.ApiException;

import java.math.BigDecimal;
import java.util.List;
import java.util.Locale;
import java.util.TreeSet;
import java.util.LinkedHashSet;

/**
 * US-16 (PRD-PROF-2) — quy tắc thuần cho sở thích tìm mentor của mentee, không I/O để unit test độc lập.
 * matching-service dùng các giá trị này làm bộ lọc mặc định (US-17), nên chuẩn hoá ở đây phải khớp
 * với cách matching-service đọc: ngày ISO 1–7 tăng dần không trùng, ngôn ngữ chữ thường.
 */
public final class MenteeRules {

    private MenteeRules() {
    }

    public static final String ERROR_CODE = "INVALID_PREFERENCES";
    /** Trần ngân sách = trần giá mentor được khai báo (MentorProfileInput.hourlyRate). */
    public static final BigDecimal MAX_BUDGET = new BigDecimal("100000000");

    /** Ngày ISO-8601 (1 = Thứ Hai ... 7 = Chủ Nhật), bỏ trùng và sắp tăng dần; null/rỗng = mọi ngày. */
    public static Integer[] normalizeDays(List<Integer> days) {
        TreeSet<Integer> out = new TreeSet<>();
        if (days != null) {
            for (Integer d : days) {
                if (d == null || d < 1 || d > 7) {
                    throw ApiException.badRequest(ERROR_CODE, "Ngày trong tuần phải từ 1 (Thứ Hai) đến 7 (Chủ Nhật)");
                }
                out.add(d);
            }
        }
        return out.toArray(Integer[]::new);
    }

    /** MORNING | AFTERNOON | EVENING (không phân biệt hoa thường); null/rỗng = giờ nào cũng được. */
    public static TimeOfDay parseTimeOfDay(String value) {
        String v = MentorRules.trimToNull(value);
        if (v == null) return null;
        try {
            return TimeOfDay.valueOf(v.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest(ERROR_CODE, "Buổi học chỉ nhận MORNING, AFTERNOON hoặc EVENING");
        }
    }

    /** Ngân sách VND / giờ: null = không giới hạn; 0 = chỉ mentor miễn phí; tối đa 100.000.000. */
    public static BigDecimal normalizeBudget(BigDecimal budget) {
        if (budget == null) return null;
        if (budget.signum() < 0 || budget.compareTo(MAX_BUDGET) > 0) {
            throw ApiException.badRequest(ERROR_CODE, "Ngân sách phải từ 0 đến 100.000.000đ / giờ");
        }
        return budget.setScale(2, java.math.RoundingMode.HALF_UP);
    }

    /** Ngôn ngữ vi/en, chữ thường, bỏ trùng; khác MentorRules.normalizeCodes ở chỗ cho phép rỗng (= mọi ngôn ngữ). */
    public static String[] normalizeLanguages(List<String> languages) {
        LinkedHashSet<String> out = new LinkedHashSet<>();
        if (languages != null) {
            for (String l : languages) {
                if (l == null || l.isBlank()) continue;
                String code = l.trim().toLowerCase(Locale.ROOT);
                if (!MentorRules.LANGUAGES.contains(code)) {
                    throw ApiException.badRequest(ERROR_CODE, "Ngôn ngữ không hợp lệ: " + l.trim());
                }
                out.add(code);
            }
        }
        return out.toArray(String[]::new);
    }
}
