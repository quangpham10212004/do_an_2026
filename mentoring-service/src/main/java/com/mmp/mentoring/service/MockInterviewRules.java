package com.mmp.mentoring.service;

import com.mmp.mentoring.entity.MockIntake.InterviewType;
import com.mmp.mentoring.exception.ApiException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** US-58 — quy tắc phỏng vấn thử (PRD §6.5): trọng số theo dạng phỏng vấn, kiểm tra phiếu, mốc nhắc mentor. */
public final class MockInterviewRules {

    private MockInterviewRules() {
    }

    public static final int SCORE_MIN = 0;
    public static final int SCORE_MAX = 10;
    public static final int FIXES = 3;
    public static final int FIX_MIN = 5;
    public static final int FIX_MAX = 300;
    public static final int NOTE_MAX = 2000;
    public static final int ROLE_MIN = 2;
    public static final int TEXT_MAX = 120;
    /** Mentor sửa được phiếu trong 7 ngày sau giờ kết thúc phiên. */
    public static final Duration EDIT_WINDOW = Duration.ofDays(7);
    /** PRD-PREP-2 — nhắc mentor ở 12 giờ và 36 giờ; 48 giờ chưa có phiếu → "thiếu phiếu đánh giá". */
    public static final Duration REMIND_FIRST = Duration.ofHours(12);
    public static final Duration REMIND_SECOND = Duration.ofHours(36);
    public static final Duration MISSING_AFTER = Duration.ofHours(48);
    /** Chỉ chấm được phiên đã diễn ra. */
    private static final Set<String> SCORABLE = Set.of("AWAITING_ATTENDANCE", "COMPLETED", "DISPUTED");

    /** Trọng số (kỹ thuật, giải quyết vấn đề, chiều sâu, giao tiếp) — tổng 100. */
    public record Weights(int technical, int problemSolving, int depth, int communication) {
    }

    public static final Map<InterviewType, Weights> WEIGHTS = Map.of(
            InterviewType.BACKEND, new Weights(35, 25, 25, 15),
            InterviewType.FRONTEND, new Weights(35, 25, 25, 15),
            InterviewType.SYSTEM_DESIGN, new Weights(25, 40, 15, 20),
            InterviewType.BEHAVIORAL, new Weights(0, 20, 45, 35));

    /** Điểm tổng = trung bình có trọng số của 4 tiêu chí chung (live coding không tính vào tổng), làm tròn 2 chữ số. */
    public static BigDecimal overall(InterviewType type, int technical, int problemSolving, int depth, int communication) {
        Weights w = WEIGHTS.get(type);
        int sum = w.technical() * technical + w.problemSolving() * problemSolving + w.depth() * depth + w.communication() * communication;
        return BigDecimal.valueOf(sum).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
    }

    public static void requireScore(String field, Integer v) {
        if (v == null || v < SCORE_MIN || v > SCORE_MAX) {
            throw ApiException.badRequest("INVALID_SCORE", "Điểm " + field + " phải từ " + SCORE_MIN + " đến " + SCORE_MAX);
        }
    }

    /** Đúng 3 điểm cần sửa, mỗi điểm 5–300 ký tự (đã cắt khoảng trắng), không trùng nhau. */
    public static List<String> fixes(List<String> raw) {
        List<String> out = raw == null ? List.of() : raw.stream().map(s -> s == null ? "" : s.trim()).toList();
        if (out.size() != FIXES) {
            throw ApiException.badRequest("FIXES_REQUIRED", "Cần đúng " + FIXES + " điểm cần cải thiện");
        }
        for (String f : out) {
            if (f.length() < FIX_MIN || f.length() > FIX_MAX) {
                throw ApiException.badRequest("INVALID_FIX", "Mỗi điểm cần cải thiện dài " + FIX_MIN + "–" + FIX_MAX + " ký tự");
            }
        }
        if (out.stream().map(String::toLowerCase).distinct().count() != FIXES) {
            throw ApiException.badRequest("DUPLICATE_FIX", "Ba điểm cần cải thiện phải khác nhau");
        }
        return out;
    }

    public static boolean scorable(String status) {
        return SCORABLE.contains(status);
    }

    /** Phiếu chỉ điền được sau giờ kết thúc, với phiên đã diễn ra, và sửa được trong EDIT_WINDOW. */
    public static void requireScorable(String status, OffsetDateTime endsAt, OffsetDateTime now) {
        if (now.isBefore(endsAt)) {
            throw ApiException.conflict("SESSION_NOT_ENDED", "Chỉ điền phiếu đánh giá sau khi phiên kết thúc");
        }
        if (!scorable(status)) {
            throw ApiException.conflict("SESSION_NOT_SCORABLE", "Phiên không diễn ra nên không có phiếu đánh giá");
        }
        if (now.isAfter(endsAt.plus(EDIT_WINDOW))) {
            throw ApiException.conflict("SCORECARD_LOCKED", "Đã quá 7 ngày sau phiên, không thể sửa phiếu đánh giá");
        }
    }

    public enum Due { REMIND_12H, REMIND_36H, MISSING }

    /** Việc cần làm với một phiên phỏng vấn thử chưa có phiếu tại thời điểm now (null = chưa tới mốc nào). */
    public static Due due(OffsetDateTime endsAt, OffsetDateTime now, boolean sent12h, boolean sent36h) {
        if (!now.isBefore(endsAt.plus(MISSING_AFTER))) return Due.MISSING;
        if (!now.isBefore(endsAt.plus(REMIND_SECOND)) && !sent36h) return Due.REMIND_36H;
        if (!now.isBefore(endsAt.plus(REMIND_FIRST)) && !sent12h && now.isBefore(endsAt.plus(REMIND_SECOND))) return Due.REMIND_12H;
        return null;
    }
}
