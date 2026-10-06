package com.mmp.mentoring.service;

import com.mmp.mentoring.client.PaymentClient;
import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.MentoringDtos.*;
import com.mmp.mentoring.entity.LateCancellation;
import com.mmp.mentoring.entity.MentorStrike;
import com.mmp.mentoring.entity.MentoringRequest;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.entity.Review;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.LateCancellationRepository;
import com.mmp.mentoring.repository.MentoringRequestRepository;
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
    private final ProfileClient profileClient;
    private final PaymentClient paymentClient;
    private final NotificationService notifications;
    private final TransactionTemplate tx;
    private final ZoneId zone;
    private final Duration minLeadTime;
    private final Duration maxAdvance;

    public SessionService(SessionRepository sessionRepo, MentoringRequestRepository requestRepo, ReviewRepository reviewRepo,
                          LateCancellationRepository lateCancelRepo, CancellationPolicy policy, PaymentOutboxService outbox,
                          StrikeService strikes,
                          ProfileClient profileClient, PaymentClient paymentClient, NotificationService notifications,
                          TransactionTemplate tx,
                          @Value("${app.timezone}") String timezone,
                          @Value("${app.booking.min-lead-time}") Duration minLeadTime,
                          @Value("${app.booking.max-advance}") Duration maxAdvance) {
        this.sessionRepo = sessionRepo;
        this.requestRepo = requestRepo;
        this.reviewRepo = reviewRepo;
        this.lateCancelRepo = lateCancelRepo;
        this.policy = policy;
        this.outbox = outbox;
        this.strikes = strikes;
        this.profileClient = profileClient;
        this.paymentClient = paymentClient;
        this.notifications = notifications;
        this.tx = tx;
        this.zone = ZoneId.of(timezone);
        this.minLeadTime = minLeadTime;
        this.maxAdvance = maxAdvance;
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

    /** Khoảng bận của 1 người trong cửa sổ thời gian: phiên đang giữ chỗ. */
    List<BookingRules.Block> busyBlocks(UUID userId, OffsetDateTime from, OffsetDateTime to) {
        return new ArrayList<>(BookingRules.blocksOf(sessionRepo.findActiveAround(userId, from, to)));
    }

    /**
     * FR-5.4 — các khung giờ còn đặt được với mentor trong {@code days} ngày tới, đã trừ phiên đang giữ chỗ
     * của mentor (tính buffer) và của người gọi, ngày nghỉ/giờ bận của mentor, trạng thái mentor và thời gian
     * báo trước. Chỉ trả thời điểm, không lộ phiên của người khác.
     */
    public AvailableSlotsView availableSlots(AuthUser caller, UUID mentorId, int durationMinutes, int days) {
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
        List<SlotView> slots = BookingRules.availableStarts(earliest, latest, durationMinutes, 30, calendar, mentorBusy, callerBusy, null, zone)
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
        if (session.getStatus() == MentoringSession.Status.CANCELLED) {
            // Phiên đã bị huỷ (ví dụ quá hạn giữ chỗ) trước khi tiền về → hoàn tiền ngay
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
            if (d.lateFreeCancel()) {
                lateCancelRepo.save(new LateCancellation(ss.getMenteeId(), ss.getId()));
            }
            if (d.rewardPoints() > 0) {
                outbox.enqueueReward(ss.getMenteeId(), d.rewardPoints(), PaymentOutboxService.MENTOR_CANCEL_APOLOGY, ss.getId());
            }
            return ss;
        });
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

    /**
     * Mentor đánh dấu phiên đã diễn ra. (Job SessionScheduler cũng tự hoàn thành
     * các phiên đã kết thúc quá 2 giờ.)
     */
    public SessionView complete(AuthUser user, UUID sessionId) {
        MentoringSession session = tx.execute(s -> {
            MentoringSession ss = find(sessionId);
            if (!user.isAdmin() && !ss.getMentorId().equals(user.userId())) {
                throw ApiException.forbidden("Chỉ mentor của phiên mới được đánh dấu hoàn thành");
            }
            if (ss.getStatus() != MentoringSession.Status.CONFIRMED) {
                throw ApiException.conflict("SESSION_NOT_CONFIRMED", "Chỉ phiên đã xác nhận mới có thể hoàn thành");
            }
            ss.setStatus(MentoringSession.Status.COMPLETED);
            return ss;
        });
        notifications.notifyUser(session.getMenteeId(), "SESSION_COMPLETED", "Phiên mentoring đã hoàn thành",
                "Hãy dành 1 phút đánh giá mentor để giúp cộng đồng nhé!", "/mentoring/sessions");
        return toView(session);
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

    /** FR-5.6 — mentee đánh giá mentor sau phiên; điểm trung bình được đồng bộ sang profile-service. */
    public ReviewView review(AuthUser mentee, UUID sessionId, ReviewInput in) {
        Review saved = tx.execute(s -> {
            MentoringSession session = find(sessionId);
            if (!session.getMenteeId().equals(mentee.userId())) {
                throw ApiException.forbidden("Chỉ mentee của phiên mới được đánh giá");
            }
            if (session.getStatus() != MentoringSession.Status.COMPLETED) {
                throw ApiException.conflict("SESSION_NOT_COMPLETED", "Chỉ đánh giá được sau khi phiên kết thúc");
            }
            if (reviewRepo.existsBySessionId(sessionId)) {
                throw ApiException.conflict("ALREADY_REVIEWED", "Bạn đã đánh giá phiên này");
            }
            return reviewRepo.save(new Review(sessionId, session.getMenteeId(), session.getMentorId(), in.rating(),
                    MentoringRequestService.trimToNull(in.comment())));
        });
        double avg = Math.round(reviewRepo.averageRating(saved.getMentorId()) * 100) / 100.0;
        profileClient.updateRating(saved.getMentorId(), avg, reviewRepo.countByMentorId(saved.getMentorId()));
        notifications.notifyUser(saved.getMentorId(), "REVIEW_RECEIVED", "Bạn nhận được đánh giá mới",
                "Mentee đã đánh giá " + saved.getRating() + "/5 sao.", "/mentoring/sessions");
        return toReviewView(saved, profileClient.displayNames(List.of(saved.getMenteeId())));
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

    public List<ReviewView> mentorReviews(UUID mentorId) {
        List<Review> reviews = reviewRepo.findByMentorIdOrderByCreatedAtDesc(mentorId);
        Map<UUID, String> names = profileClient.displayNames(reviews.stream().map(Review::getMenteeId).toList());
        return reviews.stream().map(r -> toReviewView(r, names)).toList();
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
        Map<UUID, String> names = profileClient.displayNames(
                sessions.stream().flatMap(s -> Stream.of(s.getMenteeId(), s.getMentorId())).toList());
        Map<UUID, Review> reviews = sessions.isEmpty() ? Map.of()
                : reviewRepo.findBySessionIdIn(sessions.stream().map(MentoringSession::getId).toList()).stream()
                .collect(Collectors.toMap(Review::getSessionId, r -> r));
        return sessions.stream().map(s -> {
            Review r = reviews.get(s.getId());
            return new SessionView(s.getId(), s.getRequestId(), s.getMenteeId(), names.get(s.getMenteeId()), s.getMentorId(),
                    names.get(s.getMentorId()), s.getScheduledAt(), s.endsAt(), s.getDurationMinutes(), s.getPrice(), s.getTopic(),
                    s.getSessionType() == null ? null : s.getSessionType().name(), s.getAgenda(), s.getPreReadLink(),
                    MeetingLinks.visibleFor(s.getStatus()) ? s.getMeetingLink() : null, s.getStatus().name(),
                    s.getCancelledBy(), s.getCancelReason(), s.getRefundPercent(), r != null, r == null ? null : r.getRating(), s.getCreatedAt());
        }).toList();
    }

    /** Số liệu phiên mentoring cho bảng điều khiển quản trị. */
    public AdminStats adminStats() {
        return new AdminStats(
                sessionRepo.countByStatus(MentoringSession.Status.PENDING),
                sessionRepo.countByStatus(MentoringSession.Status.CONFIRMED),
                sessionRepo.countByStatus(MentoringSession.Status.COMPLETED),
                sessionRepo.countByStatus(MentoringSession.Status.CANCELLED));
    }

    private static SessionInternalView toInternal(MentoringSession s) {
        return new SessionInternalView(s.getId(), s.getMenteeId(), s.getMentorId(), s.getScheduledAt(), s.getDurationMinutes(),
                s.getPrice(), s.getStatus().name());
    }

    private static ReviewView toReviewView(Review r, Map<UUID, String> names) {
        return new ReviewView(r.getId(), r.getSessionId(), r.getMenteeId(), names.get(r.getMenteeId()), r.getMentorId(),
                r.getRating(), r.getComment(), r.getCreatedAt());
    }
}
