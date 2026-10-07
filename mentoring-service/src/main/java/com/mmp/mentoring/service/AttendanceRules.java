package com.mmp.mentoring.service;

import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.entity.MentoringSession.Attendance;
import com.mmp.mentoring.entity.MentoringSession.Status;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Optional;

/**
 * US-12 (PRD-SES-7/8) — quy tắc xác nhận tham dự dạng hàm thuần (thời điểm truyền vào để test tất định).
 *
 * <p>Cửa sổ trả lời: [giờ kết thúc, giờ kết thúc + 48 giờ) ({@code app.attendance.window}). Mentee trả lời HELD |
 * MENTOR_NO_SHOW | CANCELLED_ON_CALL; mentor trả lời HELD | MENTEE_NO_SHOW | CANCELLED_ON_CALL (không tự báo mình vắng
 * — vắng thì im lặng cũng cho cùng kết quả). Mỗi bên trả lời 1 lần.
 *
 * <p>Kết luận:
 * <ul>
 *   <li>Hai bên trả lời giống nhau → kết quả của câu đó (HELD → COMPLETED; CANCELLED_ON_CALL → CANCELLED).</li>
 *   <li>Hai bên trả lời khác nhau → DISPUTED ngay (giao dịch ON_HOLD, chờ US-32).</li>
 *   <li>Một bên trả lời, bên kia im lặng hết 48 giờ → câu trả lời đó: HELD → COMPLETED; mentor báo mentee vắng →
 *       NO_SHOW_MENTEE (không hoàn, mentor được trả); mentee báo mentor vắng → NO_SHOW_MENTOR (hoàn 100% + strike);
 *       CANCELLED_ON_CALL → CANCELLED.</li>
 *   <li>Không ai trả lời trong 48 giờ → COMPLETED.</li>
 * </ul>
 * CANCELLED_ON_CALL (quyết định cần PM xác nhận): không biết bên nào khởi xướng nên coi như huỷ không lỗi — hoàn 100%
 * cho mentee, KHÔNG strike mentor, không điểm xin lỗi.
 */
public final class AttendanceRules {

    public enum Side { MENTEE, MENTOR }

    /** Kết luận: trạng thái phiên mới + mã cách kết luận (lưu ở sessions.attendance_resolution). */
    public record Resolution(Status outcome, String code) {
    }

    private AttendanceRules() {
    }

    public static OffsetDateTime deadline(MentoringSession s, Duration window) {
        return s.endsAt().plus(window);
    }

    /** Đang trong cửa sổ trả lời [end, end + window). */
    public static boolean windowOpen(OffsetDateTime end, Duration window, OffsetDateTime now) {
        return !now.isBefore(end) && now.isBefore(end.plus(window));
    }

    public static boolean allowed(Side side, Attendance answer) {
        return switch (answer) {
            case HELD, CANCELLED_ON_CALL -> true;
            case MENTOR_NO_SHOW -> side == Side.MENTEE;
            case MENTEE_NO_SHOW -> side == Side.MENTOR;
        };
    }

    /**
     * @param windowClosed đã hết 48 giờ sau giờ kết thúc (bên chưa trả lời bị coi là im lặng)
     * @return kết luận, hoặc empty nếu còn chờ bên kia
     */
    public static Optional<Resolution> resolve(Attendance mentee, Attendance mentor, boolean windowClosed) {
        if (mentee != null && mentor != null) {
            if (mentee != mentor) return Optional.of(new Resolution(Status.DISPUTED, "CONFLICT"));
            return Optional.of(mentee == Attendance.HELD
                    ? new Resolution(Status.COMPLETED, "BOTH_HELD")
                    : new Resolution(Status.CANCELLED, "CANCELLED_ON_CALL"));
        }
        if (!windowClosed) return Optional.empty();
        Attendance only = mentee != null ? mentee : mentor;
        if (only == null) return Optional.of(new Resolution(Status.COMPLETED, "NO_ANSWER"));
        return Optional.of(switch (only) {
            case HELD -> new Resolution(Status.COMPLETED, "HELD_ONE_SIDE");
            case MENTEE_NO_SHOW -> new Resolution(Status.NO_SHOW_MENTEE, "MENTEE_NO_SHOW_REPORTED");
            case MENTOR_NO_SHOW -> new Resolution(Status.NO_SHOW_MENTOR, "MENTOR_NO_SHOW_REPORTED");
            case CANCELLED_ON_CALL -> new Resolution(Status.CANCELLED, "CANCELLED_ON_CALL");
        });
    }

    /** % hoàn cho mentee theo kết luận (áp dụng khi phiên có phí đã thanh toán). */
    public static int refundPercent(Status outcome) {
        return switch (outcome) {
            case NO_SHOW_MENTOR, CANCELLED -> 100;
            default -> 0;
        };
    }
}
