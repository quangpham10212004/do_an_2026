package com.mmp.mentoring.service;

import com.mmp.mentoring.client.PaymentClient;
import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.MentoringDtos.*;
import com.mmp.mentoring.entity.Dispute;
import com.mmp.mentoring.entity.LateCancellation;
import com.mmp.mentoring.entity.MentorStrike;
import com.mmp.mentoring.entity.MentoringRequest;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.entity.RescheduleProposal;
import com.mmp.mentoring.entity.Review;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.DisputeRepository;
import com.mmp.mentoring.repository.LateCancellationRepository;
import com.mmp.mentoring.repository.MentoringRequestRepository;
import com.mmp.mentoring.repository.RescheduleProposalRepository;
import com.mmp.mentoring.repository.ReviewRepository;
import com.mmp.mentoring.repository.SessionRepository;
import com.mmp.mentoring.security.AuthUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/** Đặt lịch, xác nhận, huỷ, hoàn thành phiên mentoring và đánh giá (FR-5.4 → FR-5.7, FR-6.2). */
@Service
public class SessionService {

    private static final Logger log = LoggerFactory.getLogger(SessionService.class);
    private static final DateTimeFormatter DISPLAY = DateTimeFormatter.ofPattern("HH:mm dd/MM/yyyy");
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private final SessionRepository sessionRepo;
    private final MentoringRequestRepository requestRepo;
    private final ReviewRepository reviewRepo;
    private final LateCancellationRepository lateCancelRepo;
    private final CancellationPolicy policy;
    private final PaymentOutboxService outbox;
    private final StrikeService strikes;
    private final RescheduleProposalRepository proposalRepo;
    private final DisputeRepository disputeRepo;
    private final ProfileClient profileClient;
    private final PaymentClient paymentClient;
    private final NotificationService notifications;
    private final TransactionTemplate tx;
    private final ZoneId zone;
    private final Duration minLeadTime;
    private final Duration maxAdvance;
    private final Duration attendanceWindow;

    public SessionService(SessionRepository sessionRepo, MentoringRequestRepository requestRepo, ReviewRepository reviewRepo,
                          LateCancellationRepository lateCancelRepo, CancellationPolicy policy, PaymentOutboxService outbox,
                          StrikeService strikes, RescheduleProposalRepository proposalRepo, DisputeRepository disputeRepo,
                          ProfileClient profileClient, PaymentClient paymentClient, NotificationService notifications,
                          TransactionTemplate tx,
                          @Value("${app.timezone}") String timezone,
                          @Value("${app.booking.min-lead-time}") Duration minLeadTime,
                          @Value("${app.booking.max-advance}") Duration maxAdvance,
                          @Value("${app.attendance.window:PT48H}") Duration attendanceWindow) {
        this.sessionRepo = sessionRepo;
        this.requestRepo = requestRepo;
        this.reviewRepo = reviewRepo;
        this.lateCancelRepo = lateCancelRepo;
        this.policy = policy;
        this.outbox = outbox;
        this.strikes = strikes;
        this.proposalRepo = proposalRepo;
        this.disputeRepo = disputeRepo;
        this.profileClient = profileClient;
        this.paymentClient = paymentClient;
        this.notifications = notifications;
        this.tx = tx;
        this.zone = ZoneId.of(timezone);
        this.minLeadTime = minLeadTime;
        this.maxAdvance = maxAdvance;
        this.attendanceWindow = attendanceWindow;
    }

    /**
     * Đặt lịch phiên mentoring (FR-5.4, PRD-SES-1). Điều kiện:
     * 1. Mentee đã được mentor chấp nhận (có yêu cầu ACCEPTED).
     * 2. Trạng thái mentor cho phép (ON_LEAVE/SUSPENDED chặn; PAUSED vẫn cho mentee đã được nhận).
     * 3. Đặt trước ít nhất max(min-lead-time, minNoticeHours của mentor) và trong max-advance.
     * 4. Nằm trọn trong lịch rảnh hằng tuần và không rơi vào ngày nghỉ / giờ bận đột xuất.
     * 5. Không trùng phiên đang giữ chỗ của mentor (tính cả buffer giữa 2 phiên) hoặc của mentee.
     * Kiểm tra (5) + tạo phiên chạy trong 1 transaction có advisory lock theo mentor
     * nên hai yêu cầu đồng thời không thể cùng giữ một khung giờ.
     */
    public SessionView book(AuthUser mentee, BookSessionInput in) {
        mentee.requireVerifiedEmail(); // US-39
        if (!mentee.isAdmin() && !mentee.userId().equals(in.menteeId())) {
            throw ApiException.forbidden("Bạn chỉ có thể đặt lịch cho chính mình");
        }
        int duration = Optional.ofNullable(in.durationMinutes()).orElse(60);
        if (!BookingRules.isAllowedDuration(duration)) {
            throw ApiException.badRequest("INVALID_DURATION", "Thời lượng phải là 30, 45, 60, 90 hoặc 120 phút");
        }
        String agenda = MentoringRequestService.trimToNull(in.agenda());
        if (agenda == null || agenda.length() < BookingRules.AGENDA_MIN || agenda.length() > BookingRules.AGENDA_MAX) {
            throw ApiException.badRequest("INVALID_AGENDA", "Agenda phải dài từ " + BookingRules.AGENDA_MIN + " đến "
                    + BookingRules.AGENDA_MAX + " ký tự");
        }
        String preReadLink = MentoringRequestService.trimToNull(in.preReadLink());
        if (preReadLink != null && !BookingRules.isHttpUrl(preReadLink)) {
            throw ApiException.badRequest("INVALID_PRE_READ_LINK", "Link tài liệu đọc trước phải là URL http(s) hợp lệ");
        }
        OffsetDateTime start = in.scheduledAt();
        OffsetDateTime now = OffsetDateTime.now();
        if (start.isBefore(now.plus(minLeadTime))) {
            throw ApiException.badRequest("TOO_SOON", "Cần đặt lịch trước giờ bắt đầu ít nhất " + minLeadTime.toHours() + " giờ");
        }
        if (start.isAfter(now.plus(maxAdvance))) {
            throw ApiException.badRequest("TOO_FAR", "Chỉ được đặt lịch trong vòng " + maxAdvance.toDays() + " ngày tới");
        }
        MentoringRequest request = requestRepo.findFirstByMenteeIdAndMentorIdAndStatus(
                        in.menteeId(), in.mentorId(), MentoringRequest.Status.ACCEPTED)
                .orElseThrow(() -> ApiException.badRequest("NOT_ACCEPTED", "Bạn cần được mentor chấp nhận trước khi đặt lịch"));
        ProfileClient.MentorInfo mentor = profileClient.findMentor(in.mentorId())
                .orElseThrow(() -> ApiException.notFound("MENTOR_NOT_FOUND", "Không tìm thấy mentor"));
        checkSlot(mentor, start, duration, now);
        if (BookingRules.price(mentor.hourlyRate(), duration).signum() == 0) {
            // US-01 — 3 lần huỷ muộn phiên miễn phí trong 30 ngày → chặn đặt phiên miễn phí 14 ngày
            List<OffsetDateTime> late = lateCancelRepo.findByMenteeIdAndCreatedAtAfter(in.menteeId(), now.minus(policy.lookback()))
                    .stream().map(LateCancellation::getCreatedAt).toList();
            policy.freeBookingBlockedUntil(late, now).ifPresent(until -> {
                throw ApiException.conflict("FREE_BOOKING_BLOCKED", "Bạn đã huỷ muộn phiên miễn phí nhiều lần nên tạm thời không đặt được phiên miễn phí tới "
                        + until.atZoneSameInstant(zone).format(DISPLAY));
            });
        }
        int buffer = mentor.effectiveBufferMinutes();

        MentoringSession saved = tx.execute(s -> {
            sessionRepo.lockMentorSchedule(in.mentorId());
            requireFree(in.mentorId(), in.menteeId(), start, duration, buffer, null);
            MentoringSession session = new MentoringSession();
            session.setRequestId(request.getId());
            session.setMenteeId(in.menteeId());
            session.setMentorId(in.mentorId());
            session.setScheduledAt(start);
            session.setDurationMinutes(duration);
            session.setTopic(MentoringRequestService.trimToNull(in.topic()));
            session.setSessionType(in.sessionType());
            session.setAgenda(agenda);
            session.setPreReadLink(preReadLink);
            session.setMeetingLink(MeetingLinks.sanitize(mentor.meetingLink()));
            session.setPrice(BookingRules.price(mentor.hourlyRate(), duration));
            // Phiên miễn phí được xác nhận ngay; phiên có phí chờ thanh toán (FR-6.2)
            session.setStatus(session.getPrice().signum() == 0 ? MentoringSession.Status.CONFIRMED : MentoringSession.Status.PENDING);
            requestRepo.clearInactivityWarning(request.getId()); // US-31 — đặt phiên mới = còn hoạt động
            return sessionRepo.save(session);
        });

        String when = saved.getScheduledAt().atZoneSameInstant(zone).format(DISPLAY);
        if (saved.getStatus() == MentoringSession.Status.CONFIRMED) {
            notifyBoth(saved, "SESSION_CONFIRMED", "Phiên mentoring đã được xác nhận", "Phiên lúc " + when + " đã được xác nhận.");
        } else {
            notifications.notifyUser(saved.getMentorId(), "SESSION_BOOKED", "Có lịch mentoring mới",
                    "Mentee đã đặt phiên lúc " + when + ", đang chờ thanh toán.", "/mentoring/sessions");
        }
        return toView(saved);
    }

    /**
     * Kiểm tra phần không cần khoá của một khung giờ: trạng thái mentor, thời gian báo trước của mentor,
     * lịch rảnh hằng tuần và ngoại lệ (ngày nghỉ / giờ bận). Dùng cho đặt lịch và dời lịch (US-06).
     */
    void checkSlot(ProfileClient.MentorInfo mentor, OffsetDateTime start, int duration, OffsetDateTime now) {
        LocalDate localDate = start.atZoneSameInstant(zone).toLocalDate();
        BookingRules.statusBlock(mentor.effectiveStatus(), mentor.onLeaveUntil(), localDate).ifPresent(code -> {
            throw ApiException.conflict(code, "MENTOR_SUSPENDED".equals(code)
                    ? "Mentor đang bị tạm khoá, không thể đặt lịch"
                    : "Mentor đang nghỉ" + (mentor.onLeaveUntil() == null ? "" : " đến hết " + mentor.onLeaveUntil().format(DATE))
                    + ", vui lòng chọn ngày khác");
        });
        Duration lead = BookingRules.effectiveLeadTime(minLeadTime, mentor.effectiveMinNoticeHours());
        if (start.isBefore(now.plus(lead))) {
            throw ApiException.badRequest("TOO_SOON", "Mentor cần được đặt lịch trước ít nhất " + lead.toHours() + " giờ");
        }
        if (!BookingRules.fitsAvailability(start, duration, mentor.availabilityOrEmpty(), zone)) {
            throw ApiException.conflict("MENTOR_NOT_AVAILABLE", "Mentor không rảnh vào thời điểm này, vui lòng chọn khung giờ trong lịch rảnh của mentor");
        }
        if (BookingRules.hitsException(start, duration, mentor.exceptionsOrEmpty(), zone)) {
            throw ApiException.conflict("MENTOR_NOT_AVAILABLE", "Mentor đã báo nghỉ/bận vào thời điểm này, vui lòng chọn khung giờ khác");
        }
    }

    /**
     * Kiểm tra trùng lịch (phải gọi trong transaction đã giữ advisory lock của mentor): khoảng bận của mentor
     * tính cả buffer, khoảng bận của mentee không buffer. {@code excludeSessionId} = phiên đang dời lịch.
     */
    void requireFree(UUID mentorId, UUID menteeId, OffsetDateTime start, int duration, int buffer, UUID excludeSessionId) {
        OffsetDateTime windowStart = start.minusMinutes(BookingRules.MAX_STORED_DURATION_MINUTES + buffer);
        OffsetDateTime windowEnd = start.plusMinutes(duration + buffer);
        BookingRules.findConflict(start, duration, busyBlocks(mentorId, windowStart, windowEnd), excludeSessionId, buffer)
                .ifPresent(c -> {
                    throw ApiException.conflict("MENTOR_NOT_AVAILABLE", "Mentor đã có lịch vào khung giờ này (tính cả "
                            + buffer + " phút nghỉ giữa 2 phiên)");
                });
        BookingRules.findConflict(start, duration, busyBlocks(menteeId, windowStart, windowEnd), excludeSessionId, 0)
                .ifPresent(c -> {
                    throw ApiException.conflict("MENTEE_SCHEDULE_CONFLICT", "Bạn đã có phiên khác trùng khung giờ này");
                });
    }

    /**
     * Khoảng bận của 1 người trong cửa sổ thời gian: phiên đang giữ chỗ + khung giờ của đề xuất dời lịch còn
     * PENDING (US-06, khoảng bận mang sessionId của phiên được dời, thời lượng = thời lượng phiên).
     */
    List<BookingRules.Block> busyBlocks(UUID userId, OffsetDateTime from, OffsetDateTime to) {
        List<BookingRules.Block> blocks = new ArrayList<>(BookingRules.blocksOf(sessionRepo.findActiveAround(userId, from, to)));
        List<RescheduleProposal> open = proposalRepo.findPendingAround(userId, from, to);
        if (!open.isEmpty()) {
            Map<UUID, MentoringSession> byId = sessionRepo.findAllById(open.stream().map(RescheduleProposal::getSessionId).toList())
                    .stream().collect(Collectors.toMap(MentoringSession::getId, x -> x));
            for (RescheduleProposal p : open) {
                MentoringSession owner = byId.get(p.getSessionId());
                if (owner != null) blocks.add(new BookingRules.Block(owner.getId(), p.getNewStart(), owner.getDurationMinutes()));
            }
        }
        return blocks;
    }

    // ---- dùng chung với RescheduleService ----

    MentoringSession load(UUID id) {
        return find(id);
    }

    SessionView view(MentoringSession s) {
        return toView(s);
    }

    void lockMentor(UUID mentorId) {
        sessionRepo.lockMentorSchedule(mentorId);
    }

    void checkWindow(OffsetDateTime start, OffsetDateTime now) {
        if (start.isAfter(now.plus(maxAdvance))) {
            throw ApiException.badRequest("TOO_FAR", "Chỉ được đặt lịch trong vòng " + maxAdvance.toDays() + " ngày tới");
        }
    }

    /**
     * FR-5.4 — các khung giờ còn đặt được với mentor trong {@code days} ngày tới, đã trừ phiên đang giữ chỗ
     * của mentor (tính buffer) và của người gọi, ngày nghỉ/giờ bận của mentor, trạng thái mentor và thời gian
     * báo trước. Chỉ trả thời điểm, không lộ phiên của người khác.
     */
    public AvailableSlotsView availableSlots(AuthUser caller, UUID mentorId, int durationMinutes, int days) {
        return availableSlots(caller, mentorId, durationMinutes, days, null);
    }

    /**
     * {@code excludeSessionId} (US-06): khi dời lịch, bỏ qua khoảng bận của chính phiên đó — chỉ áp dụng nếu người
     * gọi tham gia phiên.
     */
    public AvailableSlotsView availableSlots(AuthUser caller, UUID mentorId, int durationMinutes, int days, UUID excludeSessionId) {
        if (!BookingRules.isAllowedDuration(durationMinutes)) {
            throw ApiException.badRequest("INVALID_DURATION", "Thời lượng phải là 30, 45, 60, 90 hoặc 120 phút");
        }
        if (days < 1 || days > 28) {
            throw ApiException.badRequest("INVALID_RANGE", "Chỉ xem được lịch trong 1–28 ngày tới");
        }
        ProfileClient.MentorInfo mentor = profileClient.findMentor(mentorId)
                .orElseThrow(() -> ApiException.notFound("MENTOR_NOT_FOUND", "Không tìm thấy mentor"));
        OffsetDateTime now = OffsetDateTime.now();
        OffsetDateTime earliest = now.plus(BookingRules.effectiveLeadTime(minLeadTime, mentor.effectiveMinNoticeHours()));
        OffsetDateTime latest = Stream.of(now.plusDays(days), now.plus(maxAdvance)).min(Comparator.naturalOrder()).orElseThrow();
        int buffer = mentor.effectiveBufferMinutes();
        OffsetDateTime windowStart = earliest.minusMinutes(BookingRules.MAX_STORED_DURATION_MINUTES + buffer);
        OffsetDateTime windowEnd = latest.plusMinutes(durationMinutes + buffer);
        List<BookingRules.Block> mentorBusy = busyBlocks(mentorId, windowStart, windowEnd);
        List<BookingRules.Block> callerBusy = caller.userId() == null || caller.userId().equals(mentorId) ? List.of()
                : busyBlocks(caller.userId(), windowStart, windowEnd);
        BookingRules.MentorCalendar calendar = new BookingRules.MentorCalendar(mentor.availabilityOrEmpty(),
                mentor.exceptionsOrEmpty(), buffer, mentor.effectiveStatus(), mentor.onLeaveUntil());
        UUID exclude = excludeSessionId == null ? null : sessionRepo.findById(excludeSessionId)
                .filter(s -> s.getMentorId().equals(mentorId) && caller.userId() != null
                        && (caller.userId().equals(s.getMentorId()) || caller.userId().equals(s.getMenteeId())))
                .map(MentoringSession::getId).orElse(null);
        List<SlotView> slots = BookingRules.availableStarts(earliest, latest, durationMinutes, 30, calendar, mentorBusy, callerBusy, exclude, zone)
                .stream()
                .map(start -> new SlotView(start, start.plusMinutes(durationMinutes)))
                .toList();
        return new AvailableSlotsView(zone.getId(), durationMinutes, BookingRules.price(mentor.hourlyRate(), durationMinutes), slots);
    }

    /** FR-6.2 — payment-service báo thanh toán thành công → xác nhận phiên. */
    public SessionInternalView markPaid(UUID sessionId, UUID transactionId) {
        MentoringSession session = tx.execute(s -> {
            MentoringSession ss = find(sessionId);
            if (ss.getStatus() == MentoringSession.Status.PENDING) {
                ss.setStatus(MentoringSession.Status.CONFIRMED);
            }
            return ss;
        });
        if (session.getStatus() == MentoringSession.Status.CANCELLED || session.getStatus() == MentoringSession.Status.EXPIRED) {
            // Phiên đã bị huỷ / hết hạn giữ chỗ (EXPIRED) trước khi tiền về → hoàn tiền ngay
            log.warn("Payment {} arrived for cancelled session {}, refunding", transactionId, sessionId);
            paymentClient.refund(sessionId, "SESSION_ALREADY_CANCELLED");
            notifications.notifyUser(session.getMenteeId(), "PAYMENT_REFUNDED", "Đã hoàn tiền",
                    "Phiên đã bị huỷ trước khi thanh toán hoàn tất nên khoản thanh toán đã được hoàn lại.", "/mentoring/sessions");
        } else if (session.getStatus() == MentoringSession.Status.CONFIRMED) {
            String when = session.getScheduledAt().atZoneSameInstant(zone).format(DISPLAY);
            notifyBoth(session, "SESSION_CONFIRMED", "Phiên mentoring đã được xác nhận",
                    "Thanh toán thành công. Phiên lúc " + when + " đã được xác nhận.");
        }
        return toInternal(session);
    }

    /** US-01 — người gọi xem trước số tiền được hoàn nếu huỷ phiên ngay bây giờ. */
    public CancelPreviewView cancelPreview(AuthUser user, UUID sessionId) {
        MentoringSession s = find(sessionId);
        requireParticipant(user, s);
        requireCancellable(s);
        CancellationPolicy.Decision d = decide(s, actorOf(user, s), OffsetDateTime.now());
        return new CancelPreviewView(d.actor().name(), d.refundPercent(), d.refundAmount(), d.policyText(), d.rewardPoints(),
                d.lateFreeCancel());
    }

    public SessionView cancel(AuthUser user, UUID sessionId, CancelSessionInput in) {
        MentoringSession before = find(sessionId);
        requireParticipant(user, before);
        return toView(cancelWithPolicy(before, actorOf(user, before), in == null ? null : in.reason()));
    }

    /**
     * US-01 — huỷ phiên theo chính sách. Thứ tự: (1) gọi payment-service hoàn tiền (ngoài transaction; lỗi → 502,
     * phiên không bị huỷ); (2) transaction: chuyển CANCELLED, lưu người huỷ / lý do / % hoàn, ghi huỷ muộn phiên
     * miễn phí, xếp hàng điểm thưởng xin lỗi vào outbox; (3) strike cho mentor (US-02) và thông báo.
     */
    MentoringSession cancelWithPolicy(MentoringSession before, CancellationPolicy.Actor actor, String rawReason) {
        requireCancellable(before);
        String reason = MentoringRequestService.trimToNull(rawReason);
        CancellationPolicy.Decision d = decide(before, actor, OffsetDateTime.now());
        boolean reportFinalState = paidLateCancel(before, d);
        if (d.refundPercent() > 0 && d.refundAmount().signum() > 0) {
            paymentClient.refund(before.getId(), "SESSION_CANCELLED_BY_" + actor.name(), d.refundPercent());
        }
        MentoringSession session = tx.execute(s -> {
            MentoringSession ss = find(before.getId());
            requireCancellable(ss);
            ss.setStatus(MentoringSession.Status.CANCELLED);
            ss.setCancelledBy(actor.name());
            ss.setCancelReason(reason);
            ss.setRefundPercent(d.refundPercent());
            ss.setCancelledAt(OffsetDateTime.now());
            proposalRepo.findFirstBySessionIdAndStatus(ss.getId(), RescheduleProposal.Status.PENDING)
                    .ifPresent(p -> p.close(RescheduleProposal.Status.EXPIRED));
            if (d.lateFreeCancel()) {
                lateCancelRepo.save(new LateCancellation(ss.getMenteeId(), ss.getId()));
            }
            if (d.rewardPoints() > 0) {
                outbox.enqueueReward(ss.getMenteeId(), d.rewardPoints(), PaymentOutboxService.MENTOR_CANCEL_APOLOGY, ss.getId());
            }
            if (reportFinalState) {
                // US-25 — mentee huỷ muộn (hoàn 0%): mentor được trả → giải phóng thu nhập 48 giờ sau giờ kết thúc dự kiến
                outbox.enqueueFinalState(ss.getId(), MentoringSession.Status.CANCELLED.name(), ss.endsAt(), false);
            }
            return ss;
        });
        if (reportFinalState) outbox.flushSession(session.getId());
        afterCancel(session, d);
        String when = session.getScheduledAt().atZoneSameInstant(zone).format(DISPLAY);
        String suffix = (reason != null ? " Lý do: " + reason + "." : "")
                + (d.refundAmount().signum() > 0 ? " Khoản hoàn " + money(d.refundAmount()) + " (" + d.refundPercent() + "%) đang được xử lý." : "")
                + (d.rewardPoints() > 0 ? " Bạn được cộng " + d.rewardPoints() + " điểm thưởng xin lỗi." : "");
        switch (actor) {
            case MENTEE -> notifications.notifyUser(session.getMentorId(), "SESSION_CANCELLED", "Phiên mentoring bị huỷ",
                    "Mentee đã huỷ phiên lúc " + when + "." + (reason != null ? " Lý do: " + reason + "." : ""), "/mentoring/sessions");
            case MENTOR -> notifications.notifyUser(session.getMenteeId(), "SESSION_CANCELLED", "Phiên mentoring bị huỷ",
                    "Mentor đã huỷ phiên lúc " + when + "." + suffix, "/mentoring/sessions");
            case SYSTEM -> {
                notifications.notifyUser(session.getMenteeId(), "SESSION_CANCELLED", "Phiên mentoring bị huỷ",
                        "Hệ thống đã huỷ phiên lúc " + when + "." + suffix, "/mentoring/sessions");
                notifications.notifyUser(session.getMentorId(), "SESSION_CANCELLED", "Phiên mentoring bị huỷ",
                        "Hệ thống đã huỷ phiên lúc " + when + ".", "/mentoring/sessions");
            }
        }
        return session;
    }

    /** Phiên đã thanh toán bị huỷ mà mentee không được hoàn đủ (mentee huỷ < 72 giờ). */
    private static boolean paidLateCancel(MentoringSession before, CancellationPolicy.Decision d) {
        return before.getStatus() == MentoringSession.Status.CONFIRMED && before.getPrice().signum() > 0 && d.refundPercent() < 100;
    }

    /** US-02 — mentor huỷ phiên bị ghi 1 strike (3 strike / 30 ngày → PAUSED). */
    void afterCancel(MentoringSession session, CancellationPolicy.Decision d) {
        if (d.strike()) {
            strikes.record(session.getMentorId(), session.getId(), MentorStrike.Reason.MENTOR_CANCEL);
        }
    }

    private CancellationPolicy.Decision decide(MentoringSession s, CancellationPolicy.Actor actor, OffsetDateTime now) {
        boolean paid = s.getStatus() == MentoringSession.Status.CONFIRMED && s.getPrice().signum() > 0;
        return policy.evaluate(actor, s.getPrice(), paid, s.getScheduledAt(), now);
    }

    private static void requireCancellable(MentoringSession s) {
        if (!BookingRules.HOLDING_STATUSES.contains(s.getStatus())) {
            throw ApiException.conflict("SESSION_NOT_CANCELLABLE", "Phiên không thể huỷ ở trạng thái hiện tại");
        }
        if (!s.getScheduledAt().isAfter(OffsetDateTime.now())) {
            throw ApiException.conflict("SESSION_ALREADY_STARTED", "Không thể huỷ phiên đã bắt đầu");
        }
    }

    /** Mentor của phiên → MENTOR, mentee → MENTEE, admin/nội bộ → SYSTEM. */
    static CancellationPolicy.Actor actorOf(AuthUser user, MentoringSession s) {
        if (user.userId() != null && user.userId().equals(s.getMentorId())) return CancellationPolicy.Actor.MENTOR;
        if (user.userId() != null && user.userId().equals(s.getMenteeId())) return CancellationPolicy.Actor.MENTEE;
        return CancellationPolicy.Actor.SYSTEM;
    }

    private static String money(java.math.BigDecimal amount) {
        return String.format("%,d", amount.longValue()).replace(',', '.') + "đ";
    }

    /** US-04 — mentor (hoặc admin) đặt link phòng họp riêng cho phiên chưa kết thúc. */
    public SessionView updateMeetingLink(AuthUser user, UUID sessionId, MeetingLinkInput in) {
        String link = in.meetingLink().trim();
        if (!MeetingLinks.isAllowed(link)) {
            throw ApiException.badRequest("INVALID_MEETING_LINK",
                    "Link phòng họp phải là https trên meet.google.com, zoom.us hoặc teams.microsoft.com");
        }
        MentoringSession session = tx.execute(s -> {
            MentoringSession ss = find(sessionId);
            if (!user.isAdmin() && !ss.getMentorId().equals(user.userId())) {
                throw ApiException.forbidden("Chỉ mentor của phiên mới được đổi link phòng họp");
            }
            if (!BookingRules.HOLDING_STATUSES.contains(ss.getStatus()) || !ss.endsAt().isAfter(OffsetDateTime.now())) {
                throw ApiException.conflict("SESSION_NOT_EDITABLE", "Chỉ đổi được link của phiên sắp diễn ra");
            }
            ss.setMeetingLink(link);
            return ss;
        });
        if (session.getStatus() == MentoringSession.Status.CONFIRMED) {
            notifications.notifyUser(session.getMenteeId(), "MEETING_LINK_UPDATED", "Link phòng họp đã thay đổi",
                    "Mentor đã cập nhật link phòng họp cho phiên lúc "
                            + session.getScheduledAt().atZoneSameInstant(zone).format(DISPLAY) + ".", "/mentoring/sessions");
        }
        return toView(session);
    }

    /** FR-5.7 — lịch sử phiên của người dùng. */
    public List<SessionView> mine(AuthUser user, String status) {
        List<MentoringSession> list = switch (user.role()) {
            case "MENTOR" -> sessionRepo.findByMentorIdOrderByScheduledAtDesc(user.userId());
            case "MENTEE" -> sessionRepo.findByMenteeIdOrderByScheduledAtDesc(user.userId());
            default -> sessionRepo.findAll();
        };
        if (status != null && !status.isBlank()) {
            MentoringSession.Status st = MentoringSession.Status.valueOf(status.toUpperCase());
            list = list.stream().filter(s -> s.getStatus() == st).toList();
        }
        return toViews(list);
    }

    public SessionView get(AuthUser user, UUID sessionId) {
        MentoringSession s = find(sessionId);
        requireParticipant(user, s);
        return toView(s);
    }

    public SessionInternalView getInternal(UUID sessionId) {
        return toInternal(find(sessionId));
    }

    private void notifyBoth(MentoringSession s, String type, String title, String message) {
        notifications.notifyUser(s.getMenteeId(), type, title, message, "/mentoring/sessions");
        notifications.notifyUser(s.getMentorId(), type, title, message, "/mentoring/sessions");
    }

    private static void requireParticipant(AuthUser user, MentoringSession s) {
        if (!user.isAdmin() && !user.isInternal() && !s.getMenteeId().equals(user.userId()) && !s.getMentorId().equals(user.userId())) {
            throw ApiException.forbidden("Bạn không tham gia phiên này");
        }
    }

    private MentoringSession find(UUID id) {
        return sessionRepo.findById(id).orElseThrow(() -> ApiException.notFound("SESSION_NOT_FOUND", "Không tìm thấy phiên mentoring"));
    }

    private SessionView toView(MentoringSession s) {
        return toViews(List.of(s)).get(0);
    }

    private List<SessionView> toViews(List<MentoringSession> sessions) {
        Map<UUID, ProfileClient.ProfileSummary> people = profileClient.summaries(
                sessions.stream().flatMap(s -> Stream.of(s.getMenteeId(), s.getMentorId())).toList());
        Map<UUID, String> names = new java.util.HashMap<>();
        people.forEach((id, p) -> names.put(id, p.displayName() == null ? "Người dùng" : p.displayName()));
        Map<UUID, Review> reviews = sessions.isEmpty() ? Map.of()
                : reviewRepo.findBySessionIdIn(sessions.stream().map(MentoringSession::getId).toList()).stream()
                .collect(Collectors.toMap(Review::getSessionId, r -> r));
        Map<UUID, RescheduleProposal> pending = sessions.isEmpty() ? Map.of()
                : proposalRepo.findBySessionIdInAndStatus(sessions.stream().map(MentoringSession::getId).toList(),
                        RescheduleProposal.Status.PENDING).stream()
                .collect(Collectors.toMap(RescheduleProposal::getSessionId, p -> p, (a, b) -> a));
        // US-32 — tranh chấp gần nhất của mỗi phiên
        Map<UUID, Dispute> disputes = sessions.isEmpty() ? Map.of()
                : disputeRepo.findBySessionIdInOrderByCreatedAtDesc(sessions.stream().map(MentoringSession::getId).toList()).stream()
                .collect(Collectors.toMap(Dispute::getSessionId, d -> d, (a, b) -> a));
        return sessions.stream().map(s -> {
            Review r = reviews.get(s.getId());
            Dispute dp = disputes.get(s.getId());
            return new SessionView(s.getId(), s.getRequestId(), s.getMenteeId(), names.get(s.getMenteeId()), s.getMentorId(),
                    names.get(s.getMentorId()), s.getScheduledAt(), s.endsAt(), s.getDurationMinutes(), s.getPrice(), s.getTopic(),
                    s.getSessionType() == null ? null : s.getSessionType().name(), s.getAgenda(), s.getPreReadLink(),
                    MeetingLinks.visibleFor(s.getStatus()) ? s.getMeetingLink() : null, s.getStatus().name(),
                    s.getCancelledBy(), s.getCancelReason(), s.getRefundPercent(),
                    s.getRescheduleCount(), pending.containsKey(s.getId()) ? RescheduleService.toView(pending.get(s.getId())) : null,
                    s.getMenteeAttendance() == null ? null : s.getMenteeAttendance().name(),
                    s.getMentorAttendance() == null ? null : s.getMentorAttendance().name(),
                    AttendanceRules.deadline(s, attendanceWindow), s.getAttendanceResolution(),
                    r != null, r == null ? null : r.getRating(), s.getCreatedAt(),
                    dp == null ? null : new DisputeBrief(dp.getId(), dp.getStatus().name(),
                            dp.getOutcome() == null ? null : dp.getOutcome().name(), dp.getRefundPercent()),
                    timezoneOf(people.get(s.getMentorId())), timezoneOf(people.get(s.getMenteeId())));
        }).toList();
    }

    private static String timezoneOf(ProfileClient.ProfileSummary p) {
        return p == null || p.timezone() == null ? ProfileClient.DEFAULT_TIMEZONE : p.timezone();
    }

    /** Số liệu phiên mentoring cho bảng điều khiển quản trị. */
    public AdminStats adminStats() {
        return new AdminStats(
                sessionRepo.countByStatus(MentoringSession.Status.PENDING),
                sessionRepo.countByStatus(MentoringSession.Status.CONFIRMED),
                sessionRepo.countByStatus(MentoringSession.Status.COMPLETED),
                sessionRepo.countByStatus(MentoringSession.Status.CANCELLED),
                sessionRepo.countByStatus(MentoringSession.Status.AWAITING_ATTENDANCE),
                sessionRepo.countByStatus(MentoringSession.Status.EXPIRED),
                sessionRepo.countByStatus(MentoringSession.Status.NO_SHOW_MENTEE),
                sessionRepo.countByStatus(MentoringSession.Status.NO_SHOW_MENTOR),
                sessionRepo.countByStatus(MentoringSession.Status.DISPUTED));
    }

    private static SessionInternalView toInternal(MentoringSession s) {
        return new SessionInternalView(s.getId(), s.getMenteeId(), s.getMentorId(), s.getScheduledAt(), s.getDurationMinutes(),
                s.getPrice(), s.getStatus().name());
    }

}
