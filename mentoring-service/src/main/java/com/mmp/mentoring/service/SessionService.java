package com.mmp.mentoring.service;

import com.mmp.mentoring.client.PaymentClient;
import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.MentoringDtos.*;
import com.mmp.mentoring.entity.MentoringRequest;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.entity.Review;
import com.mmp.mentoring.exception.ApiException;
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
    private static final int MAX_DURATION_MINUTES = 180;

    private final SessionRepository sessionRepo;
    private final MentoringRequestRepository requestRepo;
    private final ReviewRepository reviewRepo;
    private final ProfileClient profileClient;
    private final PaymentClient paymentClient;
    private final NotificationService notifications;
    private final TransactionTemplate tx;
    private final ZoneId zone;
    private final Duration minLeadTime;
    private final Duration maxAdvance;

    public SessionService(SessionRepository sessionRepo, MentoringRequestRepository requestRepo, ReviewRepository reviewRepo,
                          ProfileClient profileClient, PaymentClient paymentClient, NotificationService notifications,
                          TransactionTemplate tx,
                          @Value("${app.timezone}") String timezone,
                          @Value("${app.booking.min-lead-time}") Duration minLeadTime,
                          @Value("${app.booking.max-advance}") Duration maxAdvance) {
        this.sessionRepo = sessionRepo;
        this.requestRepo = requestRepo;
        this.reviewRepo = reviewRepo;
        this.profileClient = profileClient;
        this.paymentClient = paymentClient;
        this.notifications = notifications;
        this.tx = tx;
        this.zone = ZoneId.of(timezone);
        this.minLeadTime = minLeadTime;
        this.maxAdvance = maxAdvance;
    }

    /**
     * Đặt lịch phiên mentoring. Điều kiện:
     * 1. Mentee đã được mentor chấp nhận (có yêu cầu ACCEPTED).
     * 2. Thời điểm nằm trong khung đặt lịch cho phép và trong lịch rảnh hằng tuần của mentor.
     * 3. Không trùng phiên đang giữ chỗ của mentor hoặc của mentee.
     * Kiểm tra (3) + tạo phiên chạy trong 1 transaction có advisory lock theo mentor
     * nên hai yêu cầu đồng thời không thể cùng giữ một khung giờ.
     */
    public SessionView book(AuthUser mentee, BookSessionInput in) {
        if (!mentee.isAdmin() && !mentee.userId().equals(in.menteeId())) {
            throw ApiException.forbidden("Bạn chỉ có thể đặt lịch cho chính mình");
        }
        int duration = Optional.ofNullable(in.durationMinutes()).orElse(60);
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
        if (!BookingRules.fitsAvailability(start, duration, mentor.availability(), zone)) {
            throw ApiException.conflict("MENTOR_NOT_AVAILABLE", "Mentor không rảnh vào thời điểm này, vui lòng chọn khung giờ trong lịch rảnh của mentor");
        }

        MentoringSession saved = tx.execute(s -> {
            sessionRepo.lockMentorSchedule(in.mentorId());
            OffsetDateTime windowStart = start.minusMinutes(MAX_DURATION_MINUTES);
            OffsetDateTime windowEnd = start.plusMinutes(duration);
            BookingRules.findConflict(start, duration, sessionRepo.findActiveAround(in.mentorId(), windowStart, windowEnd), null)
                    .ifPresent(c -> {
                        throw ApiException.conflict("MENTOR_NOT_AVAILABLE", "Mentor đã có lịch vào khung giờ này");
                    });
            BookingRules.findConflict(start, duration, sessionRepo.findActiveAround(in.menteeId(), windowStart, windowEnd), null)
                    .ifPresent(c -> {
                        throw ApiException.conflict("MENTEE_SCHEDULE_CONFLICT", "Bạn đã có phiên khác trùng khung giờ này");
                    });
            MentoringSession session = new MentoringSession();
            session.setRequestId(request.getId());
            session.setMenteeId(in.menteeId());
            session.setMentorId(in.mentorId());
            session.setScheduledAt(start);
            session.setDurationMinutes(duration);
            session.setTopic(MentoringRequestService.trimToNull(in.topic()));
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
     * FR-5.4 — các khung giờ còn đặt được với mentor trong {@code days} ngày tới, đã trừ phiên đang giữ chỗ
     * của mentor và của người gọi. Chỉ trả thời điểm, không lộ phiên của người khác.
     */
    public AvailableSlotsView availableSlots(AuthUser caller, UUID mentorId, int durationMinutes, int days) {
        if (durationMinutes < 30 || durationMinutes > MAX_DURATION_MINUTES) {
            throw ApiException.badRequest("INVALID_DURATION", "Thời lượng phải từ 30 đến " + MAX_DURATION_MINUTES + " phút");
        }
        if (days < 1 || days > 28) {
            throw ApiException.badRequest("INVALID_RANGE", "Chỉ xem được lịch trong 1–28 ngày tới");
        }
        ProfileClient.MentorInfo mentor = profileClient.findMentor(mentorId)
                .orElseThrow(() -> ApiException.notFound("MENTOR_NOT_FOUND", "Không tìm thấy mentor"));
        OffsetDateTime now = OffsetDateTime.now();
        OffsetDateTime earliest = now.plus(minLeadTime);
        OffsetDateTime latest = Stream.of(now.plusDays(days), now.plus(maxAdvance)).min(Comparator.naturalOrder()).orElseThrow();
        OffsetDateTime windowStart = earliest.minusMinutes(MAX_DURATION_MINUTES);
        OffsetDateTime windowEnd = latest.plusMinutes(durationMinutes);
        List<MentoringSession> busy = new ArrayList<>(sessionRepo.findActiveAround(mentorId, windowStart, windowEnd));
        if (!caller.userId().equals(mentorId)) {
            busy.addAll(sessionRepo.findActiveAround(caller.userId(), windowStart, windowEnd));
        }
        List<SlotView> slots = BookingRules.availableStarts(earliest, latest, durationMinutes, 30, mentor.availability(), busy, zone)
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

    public SessionView cancel(AuthUser user, UUID sessionId, CancelSessionInput in) {
        MentoringSession before = find(sessionId);
        requireParticipant(user, before);
        if (before.getStatus() != MentoringSession.Status.PENDING && before.getStatus() != MentoringSession.Status.CONFIRMED) {
            throw ApiException.conflict("SESSION_NOT_CANCELLABLE", "Phiên không thể huỷ ở trạng thái hiện tại");
        }
        if (!before.getScheduledAt().isAfter(OffsetDateTime.now())) {
            throw ApiException.conflict("SESSION_ALREADY_STARTED", "Không thể huỷ phiên đã bắt đầu");
        }
        boolean refund = before.getStatus() == MentoringSession.Status.CONFIRMED && before.getPrice().signum() > 0;
        if (refund) {
            paymentClient.refund(sessionId, "SESSION_CANCELLED");
        }
        MentoringSession session = tx.execute(s -> {
            MentoringSession ss = find(sessionId);
            ss.setStatus(MentoringSession.Status.CANCELLED);
            return ss;
        });
        UUID other = user.userId() != null && user.userId().equals(session.getMentorId()) ? session.getMenteeId() : session.getMentorId();
        String when = session.getScheduledAt().atZoneSameInstant(zone).format(DISPLAY);
        notifications.notifyUser(other, "SESSION_CANCELLED", "Phiên mentoring bị huỷ",
                "Phiên lúc " + when + " đã bị huỷ." + (in != null && in.reason() != null ? " Lý do: " + in.reason() : "")
                        + (refund ? " Khoản thanh toán sẽ được hoàn lại." : ""), "/mentoring/sessions");
        return toView(session);
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
                    names.get(s.getMentorId()), s.getScheduledAt(), s.getDurationMinutes(), s.getPrice(), s.getTopic(),
                    s.getStatus().name(), r != null, r == null ? null : r.getRating(), s.getCreatedAt());
        }).toList();
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
