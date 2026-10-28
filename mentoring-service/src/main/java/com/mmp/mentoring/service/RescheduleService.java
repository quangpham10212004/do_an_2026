package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.MentoringDtos.RescheduleInput;
import com.mmp.mentoring.dto.MentoringDtos.RescheduleView;
import com.mmp.mentoring.dto.MentoringDtos.SessionView;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.entity.RescheduleProposal;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.RescheduleProposalRepository;
import com.mmp.mentoring.security.AuthUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

/**
 * US-06 (PRD-SES-5/6) — dời lịch phiên CONFIRMED: một bên đề xuất giờ mới, bên còn lại chấp nhận/từ chối.
 * Khung giờ đề xuất được giữ (tính là bận) khi đề xuất còn PENDING; chấp nhận → phiên chuyển sang giờ mới,
 * giữ nguyên thời lượng, giá và thanh toán.
 */
@Service
public class RescheduleService {

    private static final Logger log = LoggerFactory.getLogger(RescheduleService.class);
    private static final DateTimeFormatter DISPLAY = DateTimeFormatter.ofPattern("HH:mm dd/MM/yyyy");

    private final RescheduleProposalRepository proposals;
    private final SessionService sessions;
    private final ProfileClient profileClient;
    private final NotificationService notifications;
    private final RescheduleRules rules;
    private final TransactionTemplate tx;
    private final ZoneId zone;

    public RescheduleService(RescheduleProposalRepository proposals, SessionService sessions, ProfileClient profileClient,
                             NotificationService notifications, RescheduleRules rules, TransactionTemplate tx,
                             @Value("${app.timezone}") String timezone) {
        this.proposals = proposals;
        this.sessions = sessions;
        this.profileClient = profileClient;
        this.notifications = notifications;
        this.rules = rules;
        this.tx = tx;
        this.zone = ZoneId.of(timezone);
    }

    public RescheduleView propose(AuthUser user, UUID sessionId, RescheduleInput in) {
        MentoringSession session = sessions.load(sessionId);
        requireParticipant(user, session);
        OffsetDateTime now = OffsetDateTime.now();
        OffsetDateTime newStart = in.newStart();
        checkRules(session, now);
        if (newStart.isEqual(session.getScheduledAt())) {
            throw ApiException.badRequest("SAME_START", "Giờ mới trùng giờ hiện tại của phiên");
        }
        ProfileClient.MentorInfo mentor = profileClient.findMentor(session.getMentorId())
                .orElseThrow(() -> ApiException.notFound("MENTOR_NOT_FOUND", "Không tìm thấy mentor"));
        sessions.checkWindow(newStart, now);
        sessions.checkSlot(mentor, newStart, session.getDurationMinutes(), now);
        int buffer = mentor.effectiveBufferMinutes();
        RescheduleProposal saved;
        try {
            saved = tx.execute(s -> {
                sessions.lockMentor(session.getMentorId());
                MentoringSession current = sessions.loadForUpdate(sessionId);
                checkRules(current, OffsetDateTime.now());
                sessions.requireFree(current.getMentorId(), current.getMenteeId(), newStart, current.getDurationMinutes(), buffer, current.getId());
                return proposals.saveAndFlush(new RescheduleProposal(sessionId, user.userId(), newStart, now,
                        rules.expiresAt(now, current.getScheduledAt())));
            });
        } catch (DataIntegrityViolationException e) {
            throw ApiException.conflict("RESCHEDULE_PENDING", "Phiên đang có một đề xuất dời lịch chờ phản hồi");
        }
        UUID other = other(session, user.userId());
        notifications.notifyUser(other, "RESCHEDULE_PROPOSED", "Đề xuất dời lịch phiên mentoring",
                (user.userId().equals(session.getMentorId()) ? "Mentor" : "Mentee") + " đề xuất dời phiên lúc " + fmt(session.getScheduledAt())
                        + " sang " + fmt(newStart) + ". Vui lòng phản hồi trước " + fmt(saved.getExpiresAt()) + ".", "/mentoring/sessions");
        return toView(saved);
    }

    public SessionView accept(AuthUser user, UUID proposalId) {
        RescheduleProposal p = find(proposalId);
        MentoringSession session = sessions.load(p.getSessionId());
        requireParticipant(user, session);
        if (user.userId().equals(p.getProposedBy())) {
            throw ApiException.forbidden("Người đề xuất không thể tự chấp nhận đề xuất của mình");
        }
        ProfileClient.MentorInfo mentor = profileClient.findMentor(session.getMentorId())
                .orElseThrow(() -> ApiException.notFound("MENTOR_NOT_FOUND", "Không tìm thấy mentor"));
        int buffer = mentor.effectiveBufferMinutes();
        OffsetDateTime oldStart = session.getScheduledAt();
        // Nhánh từ chối đóng đề xuất rồi báo lỗi: trả kết quả thay vì ném trong transaction, nếu không lệnh đóng bị rollback.
        record Outcome(MentoringSession session, String code, String message) {
        }
        Outcome out = tx.execute(s -> {
            sessions.lockMentor(session.getMentorId());
            MentoringSession ss = sessions.loadForUpdate(p.getSessionId());   // thứ tự khoá: mentor → phiên → đề xuất
            RescheduleProposal current = find(proposalId);
            if (current.getStatus() != RescheduleProposal.Status.PENDING) {
                throw ApiException.conflict("RESCHEDULE_NOT_PENDING", "Đề xuất dời lịch đã được xử lý");
            }
            OffsetDateTime now = OffsetDateTime.now();
            String code = null;
            String message = null;
            if (!current.getExpiresAt().isAfter(now)) {
                code = "RESCHEDULE_EXPIRED";
                message = "Đề xuất dời lịch đã hết hạn";
            } else if (ss.getStatus() != MentoringSession.Status.CONFIRMED) {
                code = "SESSION_NOT_CONFIRMED";
                message = "Phiên không còn ở trạng thái đã xác nhận";
            } else if (!now.isBefore(ss.getScheduledAt())) {
                code = "RESCHEDULE_TOO_LATE";
                message = "Phiên đã tới hoặc quá giờ bắt đầu nên không thể dời lịch";
            } else if (ss.getMentorJoinedAt() != null || ss.getMenteeJoinedAt() != null) {
                code = "SESSION_ALREADY_JOINED";
                message = "Đã có người vào phòng học nên không thể dời lịch";
            } else if (!current.getNewStart().isAfter(now)) {
                code = "RESCHEDULE_START_PASSED";
                message = "Giờ đề xuất đã trôi qua";
            }
            if (code != null) {
                current.close(RescheduleProposal.Status.EXPIRED);
                return new Outcome(ss, code, message);
            }
            // Cả hai bên đã đồng ý giờ mới nên không kiểm lại lịch rảnh và thời gian báo trước; chỉ kiểm mentor chưa bị khoá / nghỉ vào ngày mới
            sessions.checkMentorStatus(mentor, current.getNewStart());
            // Bỏ qua khoảng bận của chính phiên này (giờ cũ và giờ đề xuất đều mang sessionId của phiên)
            sessions.requireFree(ss.getMentorId(), ss.getMenteeId(), current.getNewStart(), ss.getDurationMinutes(), buffer, ss.getId());
            ss.setScheduledAt(current.getNewStart());
            ss.resetReminders();
            ss.setRescheduleCount(ss.getRescheduleCount() + 1);
            current.close(RescheduleProposal.Status.ACCEPTED);
            return new Outcome(ss, null, null);
        });
        if (out.code() != null) throw ApiException.conflict(out.code(), out.message());
        MentoringSession moved = out.session();
        notifications.notifyUser(p.getProposedBy(), "RESCHEDULE_ACCEPTED", "Đề xuất dời lịch được chấp nhận",
                "Phiên lúc " + fmt(oldStart) + " đã được dời sang " + fmt(moved.getScheduledAt())
                        + ". Nếu đã thêm phiên vào lịch, hãy tải lại file .ics để cập nhật.", "/mentoring/sessions");
        return sessions.view(moved);
    }

    /** Bên nhận từ chối, hoặc người đề xuất rút lại đề xuất. */
    public RescheduleView decline(AuthUser user, UUID proposalId) {
        RescheduleProposal p = find(proposalId);
        MentoringSession session = sessions.load(p.getSessionId());
        requireParticipant(user, session);
        RescheduleProposal closed = tx.execute(s -> {
            RescheduleProposal current = find(proposalId);
            requireOpen(current);
            current.close(RescheduleProposal.Status.DECLINED);
            return current;
        });
        boolean withdrawn = user.userId().equals(p.getProposedBy());
        notifications.notifyUser(other(session, user.userId()), withdrawn ? "RESCHEDULE_WITHDRAWN" : "RESCHEDULE_DECLINED",
                withdrawn ? "Đề xuất dời lịch đã được rút lại" : "Đề xuất dời lịch bị từ chối",
                "Phiên vẫn giữ giờ cũ " + fmt(session.getScheduledAt()) + ".", "/mentoring/sessions");
        return toView(closed);
    }

    /** Job — đề xuất quá hạn → EXPIRED, báo người đề xuất. */
    @Scheduled(fixedDelayString = "${app.reschedule.expire-interval:PT1M}", initialDelayString = "PT45S")
    public void expireProposals() {
        for (RescheduleProposal p : proposals.findByStatusAndExpiresAtBefore(RescheduleProposal.Status.PENDING, OffsetDateTime.now())) {
            Boolean expired = tx.execute(s -> proposals.findById(p.getId()).filter(x -> x.getStatus() == RescheduleProposal.Status.PENDING)
                    .map(x -> {
                        x.close(RescheduleProposal.Status.EXPIRED);
                        return true;
                    }).orElse(false));
            if (Boolean.TRUE.equals(expired)) {
                log.info("Reschedule proposal {} expired", p.getId());
                notifications.notifyUser(p.getProposedBy(), "RESCHEDULE_EXPIRED", "Đề xuất dời lịch đã hết hạn",
                        "Đề xuất dời sang " + fmt(p.getNewStart()) + " không được phản hồi kịp nên đã hết hạn; phiên giữ giờ cũ.",
                        "/mentoring/sessions");
            }
        }
    }

    private void checkRules(MentoringSession session, OffsetDateTime now) {
        boolean open = proposals.findFirstBySessionIdAndStatus(session.getId(), RescheduleProposal.Status.PENDING).isPresent();
        boolean joined = session.getMentorJoinedAt() != null || session.getMenteeJoinedAt() != null;
        rules.proposeBlock(session.getStatus(), session.getScheduledAt(), session.getRescheduleCount(), open, joined, now).ifPresent(code -> {
            throw ApiException.conflict(code, switch (code) {
                case "SESSION_NOT_CONFIRMED" -> "Chỉ dời lịch được phiên đã xác nhận";
                case "RESCHEDULE_TOO_LATE" -> "Phiên đã tới hoặc quá giờ bắt đầu nên không thể dời lịch";
                case "SESSION_ALREADY_JOINED" -> "Đã có người vào phòng học nên không thể dời lịch";
                case "RESCHEDULE_LIMIT" -> "Mỗi phiên chỉ được dời lịch tối đa " + rules.maxPerSession() + " lần";
                default -> "Phiên đang có một đề xuất dời lịch chờ phản hồi";
            });
        });
    }

    private static void requireOpen(RescheduleProposal p) {
        if (p.getStatus() != RescheduleProposal.Status.PENDING) {
            throw ApiException.conflict("RESCHEDULE_NOT_PENDING", "Đề xuất dời lịch đã được xử lý");
        }
        if (!p.getExpiresAt().isAfter(OffsetDateTime.now())) {
            p.close(RescheduleProposal.Status.EXPIRED);
            throw ApiException.conflict("RESCHEDULE_EXPIRED", "Đề xuất dời lịch đã hết hạn");
        }
    }

    private static void requireParticipant(AuthUser user, MentoringSession s) {
        if (user.userId() == null || (!s.getMenteeId().equals(user.userId()) && !s.getMentorId().equals(user.userId()))) {
            throw ApiException.forbidden("Chỉ người tham gia phiên mới được dời lịch");
        }
    }

    private static UUID other(MentoringSession s, UUID me) {
        return me.equals(s.getMentorId()) ? s.getMenteeId() : s.getMentorId();
    }

    private RescheduleProposal find(UUID id) {
        return proposals.findById(id).orElseThrow(() -> ApiException.notFound("RESCHEDULE_NOT_FOUND", "Không tìm thấy đề xuất dời lịch"));
    }

    private String fmt(OffsetDateTime t) {
        return t.atZoneSameInstant(zone).format(DISPLAY);
    }

    static RescheduleView toView(RescheduleProposal p) {
        return new RescheduleView(p.getId(), p.getSessionId(), p.getProposedBy(), p.getNewStart(), p.getExpiresAt(),
                p.getStatus().name(), p.getCreatedAt());
    }
}
