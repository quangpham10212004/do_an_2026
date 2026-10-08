package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.MentoringDtos.RescheduleInput;
import com.mmp.mentoring.dto.MentoringDtos.RescheduleResponseInput;
import com.mmp.mentoring.dto.MentoringDtos.SessionView;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.SessionRepository;
import com.mmp.mentoring.security.AuthUser;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

/**
 * Đổi lịch một phiên đã xác nhận mà vẫn giữ nguyên khoản đã thanh toán hoặc buổi trong gói
 * (không phải huỷ rồi đặt lại).
 *
 * <p>Quy tắc quyết định ở {@link ReschedulePolicy}: mentee đổi sớm thì áp dụng ngay; đổi muộn, đã hết lượt, hoặc
 * mentor đề xuất thì thành đề xuất chờ bên kia đồng ý. Khung giờ mới luôn qua cùng bộ kiểm tra như đặt lịch
 * ({@link BookingValidator}) và được kiểm tra lại khi bên kia đồng ý.</p>
 */
@Service
public class RescheduleService {

    private static final DateTimeFormatter DISPLAY = DateTimeFormatter.ofPattern("HH:mm dd/MM/yyyy");

    private final SessionRepository sessionRepo;
    private final ProfileClient profileClient;
    private final NotificationService notifications;
    private final BookingValidator validator;
    private final SessionViewMapper mapper;
    private final TransactionTemplate tx;
    private final Duration freeWindow;
    private final int maxPerSession;
    private final ZoneId zone;

    public RescheduleService(SessionRepository sessionRepo, ProfileClient profileClient, NotificationService notifications,
                             BookingValidator validator, SessionViewMapper mapper, TransactionTemplate tx,
                             @Value("${app.reschedule.free-window}") Duration freeWindow,
                             @Value("${app.reschedule.max-per-session}") int maxPerSession) {
        this.sessionRepo = sessionRepo;
        this.profileClient = profileClient;
        this.notifications = notifications;
        this.validator = validator;
        this.mapper = mapper;
        this.tx = tx;
        this.freeWindow = freeWindow;
        this.maxPerSession = maxPerSession;
        this.zone = validator.zone();
    }

    /** Dời phiên sang {@code in.scheduledAt}: áp dụng ngay hoặc gửi đề xuất tuỳ quy tắc. */
    public SessionView reschedule(AuthUser user, UUID sessionId, RescheduleInput in) {
        MentoringSession session = find(sessionId);
        ReschedulePolicy.Actor actor = actorOf(user, session);
        requireReschedulable(session);
        OffsetDateTime now = OffsetDateTime.now();
        OffsetDateTime newStart = in.scheduledAt();
        if (newStart.isEqual(session.getScheduledAt())) {
            throw ApiException.badRequest("SAME_TIME", "Thời điểm mới trùng với thời điểm hiện tại");
        }
        checkNewSlot(session, newStart, now);

        ReschedulePolicy.Outcome outcome = ReschedulePolicy.decide(actor, now, session.getScheduledAt(),
                session.getRescheduleCount(), freeWindow, maxPerSession);
        MentoringSession saved = tx.execute(s -> {
            sessionRepo.lockMentorSchedule(session.getMentorId());
            MentoringSession fresh = find(sessionId);
            requireReschedulable(fresh);
            // Kiểm tra xung đột ngay cả với đề xuất để không gửi đề xuất không thể thực hiện
            validator.checkNoConflict(fresh.getMentorId(), fresh.getMenteeId(), newStart, fresh.getDurationMinutes(), fresh.getId());
            if (outcome == ReschedulePolicy.Outcome.APPLY_NOW) {
                apply(fresh, newStart, actor);
            } else {
                fresh.setProposedAt(newStart);
                fresh.setProposedBy(user.userId());
            }
            return fresh;
        });

        UUID other = otherParty(saved, user);
        if (outcome == ReschedulePolicy.Outcome.APPLY_NOW) {
            String msg = "Phiên được dời sang " + format(saved.getScheduledAt()) + ".";
            if (actor == ReschedulePolicy.Actor.ADMIN) {
                // Admin xử lý sự cố: báo cho cả hai bên
                notifications.notifyUser(saved.getMenteeId(), "SESSION_RESCHEDULED", "Phiên mentoring đã được dời lịch", msg, "/mentoring/sessions");
                notifications.notifyUser(saved.getMentorId(), "SESSION_RESCHEDULED", "Phiên mentoring đã được dời lịch", msg, "/mentoring/sessions");
            } else {
                notifications.notifyUser(other, "SESSION_RESCHEDULED", "Phiên mentoring đã được dời lịch", msg, "/mentoring/sessions");
            }
        } else {
            notifications.notifyUser(other, "RESCHEDULE_PROPOSED", "Đề xuất đổi lịch",
                    "Có đề xuất dời phiên sang " + format(newStart) + ". Hãy đồng ý hoặc từ chối.", "/mentoring/sessions");
        }
        return mapper.toView(saved);
    }

    /**
     * Bên nhận đề xuất đồng ý hoặc từ chối. Người đề xuất gọi với {@code accept = false} để rút lại đề xuất.
     */
    public SessionView respond(AuthUser user, UUID sessionId, RescheduleResponseInput in) {
        MentoringSession session = find(sessionId);
        SessionService.requireParticipant(user, session);
        if (!session.hasPendingProposal()) {
            throw ApiException.conflict("NO_PROPOSAL", "Phiên này không có đề xuất đổi lịch nào đang chờ");
        }
        boolean isProposer = user.userId() != null && user.userId().equals(session.getProposedBy());
        OffsetDateTime proposed = session.getProposedAt();

        if (isProposer) {
            if (in.accept()) {
                throw ApiException.forbidden("Bạn là người đề xuất nên không thể tự đồng ý");
            }
            MentoringSession withdrawn = tx.execute(s -> {
                MentoringSession fresh = find(sessionId);
                fresh.clearProposal();
                return fresh;
            });
            notifications.notifyUser(otherParty(withdrawn, user), "RESCHEDULE_WITHDRAWN", "Đề xuất đổi lịch đã được rút lại",
                    "Người đề xuất đã rút lại đề xuất dời sang " + format(proposed) + ".", "/mentoring/sessions");
            return mapper.toView(withdrawn);
        }
        if (user.isAdmin() && user.userId() != null && !user.userId().equals(session.getMenteeId()) && !user.userId().equals(session.getMentorId())) {
            throw ApiException.forbidden("Chỉ bên còn lại của phiên mới trả lời đề xuất");
        }

        UUID proposerId = session.getProposedBy();
        if (!in.accept()) {
            MentoringSession rejected = tx.execute(s -> {
                MentoringSession fresh = find(sessionId);
                fresh.clearProposal();
                return fresh;
            });
            notifications.notifyUser(proposerId, "RESCHEDULE_REJECTED", "Đề xuất đổi lịch bị từ chối",
                    "Phiên vẫn giữ nguyên lúc " + format(rejected.getScheduledAt()) + ".", "/mentoring/sessions");
            return mapper.toView(rejected);
        }

        requireReschedulable(session);
        OffsetDateTime now = OffsetDateTime.now();
        checkNewSlot(session, proposed, now);
        ReschedulePolicy.Actor initiator = proposerId.equals(session.getMenteeId()) ? ReschedulePolicy.Actor.MENTEE : ReschedulePolicy.Actor.MENTOR;
        MentoringSession applied = tx.execute(s -> {
            sessionRepo.lockMentorSchedule(session.getMentorId());
            MentoringSession fresh = find(sessionId);
            requireReschedulable(fresh);
            if (!fresh.hasPendingProposal() || !proposed.isEqual(fresh.getProposedAt())) {
                throw ApiException.conflict("PROPOSAL_CHANGED", "Đề xuất đã thay đổi, vui lòng tải lại");
            }
            validator.checkNoConflict(fresh.getMentorId(), fresh.getMenteeId(), proposed, fresh.getDurationMinutes(), fresh.getId());
            apply(fresh, proposed, initiator);
            return fresh;
        });
        notifications.notifyUser(proposerId, "RESCHEDULE_ACCEPTED", "Đề xuất đổi lịch đã được đồng ý",
                "Phiên được dời sang " + format(applied.getScheduledAt()) + ".", "/mentoring/sessions");
        return mapper.toView(applied);
    }

    // ---------------- nội bộ ----------------

    /** Áp dụng thời điểm mới: dời lịch, nhắc lại từ đầu, xoá đề xuất, tính vào hạn mức nếu mentee khởi xướng. */
    private static void apply(MentoringSession s, OffsetDateTime newStart, ReschedulePolicy.Actor initiator) {
        s.setScheduledAt(newStart);
        s.setReminderSent(false);
        s.clearProposal();
        if (ReschedulePolicy.countsTowardQuota(initiator)) {
            s.setRescheduleCount(s.getRescheduleCount() + 1);
        }
    }

    private void checkNewSlot(MentoringSession session, OffsetDateTime newStart, OffsetDateTime now) {
        validator.checkWindow(newStart, now);
        ProfileClient.MentorInfo mentor = profileClient.findMentor(session.getMentorId())
                .orElseThrow(() -> ApiException.notFound("MENTOR_NOT_FOUND", "Không tìm thấy mentor"));
        validator.checkAvailability(mentor, newStart, session.getDurationMinutes());
    }

    private static void requireReschedulable(MentoringSession s) {
        if (s.getStatus() != MentoringSession.Status.CONFIRMED) {
            throw ApiException.conflict("SESSION_NOT_RESCHEDULABLE", "Chỉ đổi lịch được phiên đã xác nhận");
        }
        if (!s.getScheduledAt().isAfter(OffsetDateTime.now())) {
            throw ApiException.conflict("SESSION_ALREADY_STARTED", "Không thể đổi lịch phiên đã bắt đầu");
        }
    }

    private static ReschedulePolicy.Actor actorOf(AuthUser user, MentoringSession s) {
        if (user.isAdmin()) return ReschedulePolicy.Actor.ADMIN;
        if (s.getMenteeId().equals(user.userId())) return ReschedulePolicy.Actor.MENTEE;
        if (s.getMentorId().equals(user.userId())) return ReschedulePolicy.Actor.MENTOR;
        throw ApiException.forbidden("Bạn không tham gia phiên này");
    }

    private static UUID otherParty(MentoringSession s, AuthUser user) {
        return s.getMenteeId().equals(user.userId()) ? s.getMentorId() : s.getMenteeId();
    }

    private String format(OffsetDateTime t) {
        return t.atZoneSameInstant(zone).format(DISPLAY);
    }

    private MentoringSession find(UUID id) {
        return sessionRepo.findById(id).orElseThrow(() -> ApiException.notFound("SESSION_NOT_FOUND", "Không tìm thấy phiên mentoring"));
    }
}
