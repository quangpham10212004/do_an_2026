package com.mmp.mentoring.service;

import com.mmp.mentoring.entity.MentoringRequest;

import java.util.Optional;
import java.util.Set;

/** US-14 (PRD-REQ-1/2) — quy tắc form yêu cầu mentoring dạng hàm thuần. */
public final class RequestRules {

    public static final int GOAL_MIN = 50;
    public static final int GOAL_MAX = 1000;
    public static final int MESSAGE_MAX = 1000;
    public static final int REJECT_NOTE_MAX = 500;
    public static final Set<Integer> DURATION_MONTHS = Set.of(1, 3, 6);

    private RequestRules() {
    }

    /** Mã lỗi 400 của form (goal đã trim), hoặc empty nếu hợp lệ. */
    public static Optional<String> validateForm(String goal, Integer expectedDurationMonths) {
        if (goal == null || goal.length() < GOAL_MIN || goal.length() > GOAL_MAX) return Optional.of("INVALID_GOAL");
        if (expectedDurationMonths == null || !DURATION_MONTHS.contains(expectedDurationMonths)) {
            return Optional.of("INVALID_EXPECTED_DURATION");
        }
        return Optional.empty();
    }

    /** Mentee đã có {@code pendingCount} yêu cầu PENDING — gửi thêm có vượt giới hạn không. */
    public static boolean tooManyPending(long pendingCount, int maxPending) {
        return pendingCount >= maxPending;
    }

    public static String rejectReasonLabel(MentoringRequest.RejectReason reason) {
        return switch (reason) {
            case FULL -> "Mentor đã nhận đủ mentee";
            case NOT_MY_EXPERTISE -> "Không đúng chuyên môn của mentor";
            case SCHEDULE -> "Lịch không phù hợp";
            case OTHER -> "Lý do khác";
        };
    }
}
