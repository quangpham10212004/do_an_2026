package com.mmp.mentoring.service;

import com.mmp.mentoring.entity.MentorStrike;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.entity.MentoringSession.Attendance;
import com.mmp.mentoring.entity.MentoringSession.Status;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.DisputeRepository;
import com.mmp.mentoring.repository.SessionRepository;
import com.mmp.mentoring.security.AuthUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Optional;
import java.util.UUID;

/**
 * US-12 (PRD-SES-7/8) — xác nhận tham dự sau phiên, thay cho tự hoàn thành sau 2 giờ. Quy tắc kết luận ở
 * {@link AttendanceRules}. Tác động tới tiền đi qua outbox (ghi cùng transaction với trạng thái phiên): NO_SHOW_MENTOR /
 * CANCELLED_ON_CALL → hoàn 100%, DISPUTED → tạm giữ giao dịch; strike (US-02), thông báo và {@link DisputeHook} chạy sau
 * khi commit.
 */
@Service
public class AttendanceService {

    private static final Logger log = LoggerFactory.getLogger(AttendanceService.class);
    private static final DateTimeFormatter DISPLAY = DateTimeFormatter.ofPattern("HH:mm dd/MM/yyyy");
    private static final String LINK = "/mentoring/sessions";

    private final SessionRepository sessionRepo;
    private final PaymentOutboxService outbox;
    private final StrikeService strikes;
    private final NotificationService notifications;
    private final DisputeHook disputeHook;
    private final DisputeRepository disputeRepo;
    private final TransactionTemplate tx;
    private final Duration window;
    private final ZoneId zone;

    public AttendanceService(SessionRepository sessionRepo, PaymentOutboxService outbox, StrikeService strikes,
                             NotificationService notifications, DisputeHook disputeHook, DisputeRepository disputeRepo,
                             TransactionTemplate tx,
                             @Value("${app.attendance.window:PT48H}") Duration window,
                             @Value("${app.timezone}") String timezone) {
        this.sessionRepo = sessionRepo;
        this.outbox = outbox;
        this.strikes = strikes;
        this.notifications = notifications;
        this.disputeHook = disputeHook;
        this.disputeRepo = disputeRepo;
        this.tx = tx;
        this.window = window;
        this.zone = ZoneId.of(timezone);
    }

    public Duration window() {
        return window;
    }

    private record Step(MentoringSession session, Optional<AttendanceRules.Resolution> resolution) {
    }

    /** POST /sessions/{id}/attendance — mentee hoặc mentor của phiên trả lời (1 lần / bên) trong 48 giờ sau giờ kết thúc. */
    public MentoringSession answer(AuthUser user, UUID sessionId, Attendance answer) {
        return answer(user, sessionId, answer, false);
    }

    /** POST /sessions/{id}/complete (giữ từ Sprint 1) = mentor trả lời HELD; admin được trả lời thay mentor. */
    public MentoringSession completeByMentor(AuthUser user, UUID sessionId) {
        return answer(user, sessionId, Attendance.HELD, true);
    }

    private MentoringSession answer(AuthUser user, UUID sessionId, Attendance answer, boolean adminAsMentor) {
        OffsetDateTime now = OffsetDateTime.now();
        Step step = tx.execute(s -> {
            MentoringSession ss = sessionRepo.findForUpdate(sessionId)
                    .orElseThrow(() -> ApiException.notFound("SESSION_NOT_FOUND", "Không tìm thấy phiên mentoring"));
            AttendanceRules.Side side = sideOf(user, ss, adminAsMentor);
            if (!AttendanceRules.allowed(side, answer)) {
                throw ApiException.badRequest("INVALID_ATTENDANCE_ANSWER", side == AttendanceRules.Side.MENTEE
                        ? "Mentee chỉ chọn được: phiên đã diễn ra, mentor vắng mặt hoặc huỷ trong buổi gọi"
                        : "Mentor chỉ chọn được: phiên đã diễn ra, mentee vắng mặt hoặc huỷ trong buổi gọi");
            }
            if (ss.getStatus() == Status.CONFIRMED && !now.isBefore(ss.endsAt())) {
                ss.setStatus(Status.AWAITING_ATTENDANCE); // job chưa kịp chạy
            }
            if (ss.getStatus() != Status.AWAITING_ATTENDANCE) {
                throw ss.getStatus() == Status.CONFIRMED || ss.getStatus() == Status.PENDING
                        ? ApiException.conflict("ATTENDANCE_NOT_OPEN", "Chỉ xác nhận tham dự được sau giờ kết thúc phiên")
                        : ApiException.conflict("ATTENDANCE_CLOSED", "Phiên đã được kết luận, không thể xác nhận tham dự");
            }
            if (!AttendanceRules.windowOpen(ss.endsAt(), window, now)) {
                throw ApiException.conflict("ATTENDANCE_WINDOW_CLOSED", "Đã quá " + window.toHours()
                        + " giờ sau giờ kết thúc, không thể xác nhận tham dự");
            }
            Attendance existing = side == AttendanceRules.Side.MENTEE ? ss.getMenteeAttendance() : ss.getMentorAttendance();
            if (existing != null) {
                throw ApiException.conflict("ATTENDANCE_ALREADY_ANSWERED", "Bạn đã xác nhận tham dự cho phiên này");
            }
            if (side == AttendanceRules.Side.MENTEE) ss.answerAsMentee(answer, now);
            else ss.answerAsMentor(answer, now);
            Optional<AttendanceRules.Resolution> r = AttendanceRules.resolve(ss.getMenteeAttendance(), ss.getMentorAttendance(), false);
            r.ifPresent(res -> apply(ss, res, now));
            return new Step(ss, r);
        });
        step.resolution().ifPresentOrElse(r -> afterResolution(step.session(), r),
                () -> notifyOtherSide(step.session(), user));
        return step.session();
    }

    private static AttendanceRules.Side sideOf(AuthUser user, MentoringSession s, boolean adminAsMentor) {
        if (user.userId() != null && user.userId().equals(s.getMenteeId())) return AttendanceRules.Side.MENTEE;
        if (user.userId() != null && user.userId().equals(s.getMentorId())) return AttendanceRules.Side.MENTOR;
        if (adminAsMentor && user.isAdmin()) return AttendanceRules.Side.MENTOR;
        throw ApiException.forbidden(adminAsMentor ? "Chỉ mentor của phiên mới được đánh dấu hoàn thành"
                : "Chỉ mentee hoặc mentor của phiên mới được xác nhận tham dự");
    }

    /** Job — tới giờ kết thúc: CONFIRMED → AWAITING_ATTENDANCE và nhắc hai bên xác nhận. */
    public int markEnded(OffsetDateTime now) {
        int n = 0;
        for (String id : sessionRepo.findIdsEndedBefore(Status.CONFIRMED.name(), now)) {
            MentoringSession moved = tx.execute(s -> sessionRepo.findForUpdate(UUID.fromString(id))
                    .filter(ss -> ss.getStatus() == Status.CONFIRMED && !now.isBefore(ss.endsAt()))
                    .map(ss -> {
                        ss.setStatus(Status.AWAITING_ATTENDANCE);
                        return ss;
                    }).orElse(null));
            if (moved == null) continue;
            n++;
            String msg = "Phiên lúc " + when(moved) + " đã kết thúc. Hãy xác nhận phiên có diễn ra không trong vòng "
                    + window.toHours() + " giờ.";
            notifications.notifyUser(moved.getMenteeId(), "ATTENDANCE_REQUIRED", "Xác nhận tham dự phiên mentoring", msg, LINK);
            notifications.notifyUser(moved.getMentorId(), "ATTENDANCE_REQUIRED", "Xác nhận tham dự phiên mentoring", msg, LINK);
        }
        return n;
    }

    /** Job — hết 48 giờ sau giờ kết thúc: kết luận phiên AWAITING_ATTENDANCE (bên chưa trả lời coi là im lặng). */
    public int resolveExpired(OffsetDateTime now) {
        int n = 0;
        for (String id : sessionRepo.findIdsEndedBefore(Status.AWAITING_ATTENDANCE.name(), now.minus(window))) {
            Step step = tx.execute(s -> sessionRepo.findForUpdate(UUID.fromString(id))
                    .filter(ss -> ss.getStatus() == Status.AWAITING_ATTENDANCE && !AttendanceRules.windowOpen(ss.endsAt(), window, now))
                    .map(ss -> {
                        Optional<AttendanceRules.Resolution> r = AttendanceRules.resolve(ss.getMenteeAttendance(), ss.getMentorAttendance(), true);
                        r.ifPresent(res -> apply(ss, res, now));
                        return new Step(ss, r);
                    }).orElse(null));
            if (step == null || step.resolution().isEmpty()) continue;
            n++;
            afterResolution(step.session(), step.resolution().get());
        }
        return n;
    }

    /** Chạy cả 2 bước của job (SessionScheduler mỗi phút; endpoint dev cho e2e). */
    public void runJob() {
        OffsetDateTime now = OffsetDateTime.now();
        int ended = markEnded(now);
        int resolved = resolveExpired(now);
        if (ended + resolved > 0) log.info("Attendance job: {} ended → AWAITING_ATTENDANCE, {} resolved", ended, resolved);
    }

    /** Trong transaction: đổi trạng thái + xếp hàng tác động tới tiền (outbox). */
    void apply(MentoringSession s, AttendanceRules.Resolution r, OffsetDateTime now) {
        s.resolve(r.outcome(), r.code(), now);
        boolean paid = s.getPrice() != null && s.getPrice().signum() > 0;
        // US-32 — phiên đã có báo cáo sự cố (mở trong lúc chờ xác nhận tham dự): tiền do kết luận tranh chấp quyết định
        boolean disputed = paid && disputeRepo.existsBySessionId(s.getId());
        int refund = paid && !disputed ? AttendanceRules.refundPercent(r.outcome()) : 0;
        switch (r.outcome()) {
            case NO_SHOW_MENTOR -> s.setRefundPercent(refund);
            case NO_SHOW_MENTEE -> s.setRefundPercent(0);
            case CANCELLED -> {
                s.setCancelledBy("SYSTEM");
                s.setCancelReason("CANCELLED_ON_CALL");
                s.setCancelledAt(now);
                s.setRefundPercent(refund);
            }
            case DISPUTED -> {
                if (paid) outbox.enqueueHold(s.getId(), "SESSION_DISPUTED");
            }
            default -> { }
        }
        if (refund > 0) {
            outbox.enqueueRefund(s.getId(), refund, r.outcome() == Status.NO_SHOW_MENTOR ? "MENTOR_NO_SHOW" : "CANCELLED_ON_CALL");
        }
        // US-25 — trạng thái cuối mentor được trả → payment-service giải phóng thu nhập 48 giờ sau giờ kết thúc
        if (paid && (r.outcome() == Status.COMPLETED || r.outcome() == Status.NO_SHOW_MENTEE)) {
            outbox.enqueueFinalState(s.getId(), r.outcome().name(), s.endsAt(), false);
        }
        log.info("Session {} resolved {} ({}), refund {}%", s.getId(), r.outcome(), r.code(), refund);
    }

    /** Sau commit: gửi outbox ngay, strike, thông báo, hook tranh chấp. */
    void afterResolution(MentoringSession s, AttendanceRules.Resolution r) {
        if (s.getPrice() != null && s.getPrice().signum() > 0) outbox.flushSession(s.getId());
        String when = when(s);
        switch (r.outcome()) {
            case COMPLETED -> {
                notifications.notifyUser(s.getMenteeId(), "SESSION_COMPLETED", "Phiên mentoring đã hoàn thành",
                        "Phiên lúc " + when + " đã hoàn thành. Hãy dành 1 phút đánh giá mentor để giúp cộng đồng nhé!", LINK);
                notifications.notifyUser(s.getMentorId(), "SESSION_COMPLETED", "Phiên mentoring đã hoàn thành",
                        "Phiên lúc " + when + " đã được ghi nhận hoàn thành.", LINK);
            }
            case NO_SHOW_MENTEE -> {
                notifications.notifyUser(s.getMenteeId(), "SESSION_NO_SHOW", "Bạn được ghi nhận vắng mặt",
                        "Mentor báo bạn vắng mặt ở phiên lúc " + when + " và bạn không phản hồi trong " + window.toHours()
                                + " giờ. Phiên không được hoàn tiền.", LINK);
                notifications.notifyUser(s.getMentorId(), "SESSION_NO_SHOW", "Ghi nhận mentee vắng mặt",
                        "Phiên lúc " + when + " được ghi nhận mentee vắng mặt; bạn vẫn nhận thanh toán.", LINK);
            }
            case NO_SHOW_MENTOR -> {
                strikes.record(s.getMentorId(), s.getId(), MentorStrike.Reason.MENTOR_NO_SHOW);
                notifications.notifyUser(s.getMenteeId(), "SESSION_NO_SHOW", "Ghi nhận mentor vắng mặt",
                        "Phiên lúc " + when + " được ghi nhận mentor vắng mặt."
                                + (refunded(s) ? " Bạn được hoàn 100% học phí." : ""), LINK);
                notifications.notifyUser(s.getMentorId(), "SESSION_NO_SHOW", "Bạn được ghi nhận vắng mặt",
                        "Mentee báo bạn vắng mặt ở phiên lúc " + when + " và bạn không phản hồi trong " + window.toHours()
                                + " giờ. Mentee được hoàn tiền và bạn bị ghi 1 lần vi phạm.", LINK);
            }
            case DISPUTED -> {
                disputeHook.sessionDisputed(s);
                String msg = "Hai bên xác nhận khác nhau về phiên lúc " + when + ". Phiên chuyển sang tranh chấp, khoản thanh toán "
                        + "được tạm giữ cho tới khi quản trị viên xử lý.";
                notifications.notifyUser(s.getMenteeId(), "SESSION_DISPUTED", "Phiên mentoring đang tranh chấp", msg, LINK);
                notifications.notifyUser(s.getMentorId(), "SESSION_DISPUTED", "Phiên mentoring đang tranh chấp", msg, LINK);
            }
            case CANCELLED -> {
                String msg = "Phiên lúc " + when + " được ghi nhận huỷ trong buổi gọi."
                        + (refunded(s) ? " Mentee được hoàn 100% học phí." : "");
                notifications.notifyUser(s.getMenteeId(), "SESSION_CANCELLED", "Phiên mentoring bị huỷ", msg, LINK);
                notifications.notifyUser(s.getMentorId(), "SESSION_CANCELLED", "Phiên mentoring bị huỷ", msg, LINK);
            }
            default -> { }
        }
    }

    /** Báo bên còn lại rằng đối phương đã xác nhận, nhắc họ trả lời. */
    private void notifyOtherSide(MentoringSession s, AuthUser user) {
        boolean byMentee = s.getMenteeId().equals(user.userId());
        UUID other = byMentee ? s.getMentorId() : s.getMenteeId();
        notifications.notifyUser(other, "ATTENDANCE_REQUIRED", "Xác nhận tham dự phiên mentoring",
                (byMentee ? "Mentee" : "Mentor") + " đã xác nhận tham dự phiên lúc " + when(s) + ". Hãy xác nhận trước "
                        + AttendanceRules.deadline(s, window).atZoneSameInstant(zone).format(DISPLAY) + ".", LINK);
    }

    private static boolean refunded(MentoringSession s) {
        return s.getRefundPercent() != null && s.getRefundPercent() > 0;
    }

    private String when(MentoringSession s) {
        return s.getScheduledAt().atZoneSameInstant(zone).format(DISPLAY);
    }
}
