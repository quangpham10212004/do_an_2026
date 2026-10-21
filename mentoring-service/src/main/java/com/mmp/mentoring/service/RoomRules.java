package com.mmp.mentoring.service;

import com.mmp.mentoring.entity.MentoringSession.Status;
import com.mmp.mentoring.service.AttendanceRules.Resolution;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Optional;

/**
 * Bản chốt v2.0 §6 — quy tắc phòng học trực tuyến dạng hàm thuần.
 * <ul>
 *   <li>Phòng mở {@code opens-before} (10 phút) trước giờ bắt đầu, đóng {@code closes-after} (30 phút) sau giờ kết thúc.</li>
 *   <li>Thời gian chờ bên vắng mặt: 10 phút (buổi trải nghiệm 5 phút) kể từ giờ bắt đầu.</li>
 *   <li>Nhật ký vào phòng là căn cứ duy nhất xác định vắng mặt: chỉ một bên vào → bên kia vắng; không ai vào → cả hai vắng
 *       (hoàn 100%, không lỗi vi phạm); cả hai vào → không có vắng mặt (tự hoàn thành sau 24 giờ nếu không khiếu nại).</li>
 * </ul>
 */
public final class RoomRules {

    private RoomRules() {
    }

    public static boolean open(OffsetDateTime start, OffsetDateTime end, OffsetDateTime now, Duration opensBefore, Duration closesAfter) {
        return !now.isBefore(start.minus(opensBefore)) && !now.isAfter(end.plus(closesAfter));
    }

    public static Duration grace(boolean trial, Duration regular, Duration trialGrace) {
        return trial ? trialGrace : regular;
    }

    /** Đã qua thời gian chờ để được báo bên kia vắng mặt. */
    public static boolean graceElapsed(OffsetDateTime start, OffsetDateTime now, Duration grace) {
        return !now.isBefore(start.plus(grace));
    }

    /**
     * Kết luận từ nhật ký vào phòng sau khi buổi kết thúc; empty = cả hai đã vào (không có vắng mặt) hoặc không đủ căn cứ.
     *
     * @param requireJoinLog true (mặc định): không ai vào phòng → cả hai vắng (CANCELLED + hoàn 100%, không strike)
     */
    public static Optional<Resolution> byJoinLog(boolean menteeJoined, boolean mentorJoined, boolean requireJoinLog) {
        if (menteeJoined && mentorJoined) return Optional.empty();
        if (mentorJoined) return Optional.of(new Resolution(Status.NO_SHOW_MENTEE, "JOIN_LOG_MENTEE_ABSENT"));
        if (menteeJoined) return Optional.of(new Resolution(Status.NO_SHOW_MENTOR, "JOIN_LOG_MENTOR_ABSENT"));
        return requireJoinLog ? Optional.of(new Resolution(Status.CANCELLED, "BOTH_ABSENT")) : Optional.empty();
    }

    /** Một bên báo bên kia vắng mặt chỉ hợp lệ khi: mình đã vào phòng, bên kia chưa vào, và đã hết thời gian chờ. */
    public static Optional<String> absenceReportError(boolean reporterJoined, boolean otherJoined, boolean graceElapsed) {
        if (!graceElapsed) return Optional.of("GRACE_NOT_ELAPSED");
        if (!reporterJoined) return Optional.of("YOU_NOT_JOINED");
        if (otherJoined) return Optional.of("OTHER_SIDE_JOINED");
        return Optional.empty();
    }
}
