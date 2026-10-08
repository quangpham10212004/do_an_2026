package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.MentoringDtos.*;
import com.mmp.mentoring.entity.MentoringRequest;
import com.mmp.mentoring.entity.MentoringRequest.Decision;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.MentoringRequestRepository;
import com.mmp.mentoring.repository.SessionRepository;
import com.mmp.mentoring.security.AuthUser;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Buổi làm quen (intro call) trước khi mentor nhận hẳn mentee. Yêu cầu ở trạng thái INTRO không chiếm sức chứa của
 * mentor; mentee đặt một buổi ngắn miễn phí, sau buổi (đã được xác nhận tham dự — US-12) cả hai bấm CONTINUE thì yêu cầu
 * mới thành ACCEPTED, một bên DECLINE thì yêu cầu bị từ chối.
 */
@Service
public class IntroService {

    private static final DateTimeFormatter DISPLAY = DateTimeFormatter.ofPattern("HH:mm dd/MM/yyyy");

    /** Buổi làm quen còn "sống": đã đặt/đang diễn ra/đã xong — chặn đặt thêm. Buổi bị huỷ/vắng/hết hạn cho phép đặt lại. */
    static final Set<MentoringSession.Status> ACTIVE_INTRO =
            Set.of(MentoringSession.Status.PENDING, MentoringSession.Status.CONFIRMED,
                    MentoringSession.Status.AWAITING_ATTENDANCE, MentoringSession.Status.COMPLETED,
                    MentoringSession.Status.DISPUTED);

    private final MentoringRequestRepository requestRepo;
    private final SessionRepository sessionRepo;
    private final SessionService sessions;
    private final ProfileClient profileClient;
    private final NotificationService notifications;
    private final TransactionTemplate tx;
    private final ZoneId zone;
    private final int introMinutes;

    public IntroService(MentoringRequestRepository requestRepo, SessionRepository sessionRepo, SessionService sessions,
                        ProfileClient profileClient, NotificationService notifications, TransactionTemplate tx,
                        @Value("${app.timezone}") String timezone,
                        @Value("${app.intro.duration-minutes:15}") int introMinutes) {
        this.requestRepo = requestRepo;
        this.sessionRepo = sessionRepo;
        this.sessions = sessions;
        this.profileClient = profileClient;
        this.notifications = notifications;
        this.tx = tx;
        this.zone = ZoneId.of(timezone);
        this.introMinutes = introMinutes;
    }

    public int introMinutes() {
        return introMinutes;
    }

    /** Khung giờ còn trống cho buổi làm quen (thời lượng cố định theo cấu hình). */
    public AvailableSlotsView availableSlots(AuthUser caller, UUID requestId, int days) {
        MentoringRequest r = requestRepo.findById(requestId)
                .orElseThrow(() -> ApiException.notFound("REQUEST_NOT_FOUND", "Không tìm thấy yêu cầu"));
        requireMentee(caller, r);
        AvailableSlotsView v = sessions.slotsForDuration(caller, r.getMentorId(), introMinutes, days);
        return new AvailableSlotsView(v.timezone(), v.durationMinutes(), BigDecimal.ZERO, v.slots());
    }

    /**
     * Mentee đặt buổi làm quen cho yêu cầu đang INTRO: miễn phí, xác nhận ngay, cùng quy tắc lịch với phiên thường
     * (giờ rảnh của mentor, buffer, báo trước, không trùng lịch — kiểm tra trong transaction có advisory lock).
     */
    public SessionView bookIntro(AuthUser mentee, UUID requestId, BookIntroInput in) {
        MentoringRequest request = requestRepo.findById(requestId)
                .orElseThrow(() -> ApiException.notFound("REQUEST_NOT_FOUND", "Không tìm thấy yêu cầu"));
        requireMentee(mentee, request);
        if (request.getStatus() != MentoringRequest.Status.INTRO) {
            throw ApiException.conflict("REQUEST_NOT_INTRO", "Chỉ đặt được buổi làm quen khi mentor đã đề nghị làm quen");
        }
        OffsetDateTime start = in.scheduledAt();
        OffsetDateTime now = OffsetDateTime.now();
        sessions.checkWindow(start, now);
        ProfileClient.MentorInfo mentor = profileClient.findMentor(request.getMentorId())
                .orElseThrow(() -> ApiException.notFound("MENTOR_NOT_FOUND", "Không tìm thấy mentor"));
        sessions.checkSlot(mentor, start, introMinutes, now);
        String agenda = MentoringRequestService.trimToNull(in.agenda());
        if (agenda == null) {
            agenda = "Buổi làm quen: " + abbreviate(request.getGoal(), BookingRules.AGENDA_MAX - 20);
        }
        if (agenda.length() > BookingRules.AGENDA_MAX) {
            throw ApiException.badRequest("INVALID_AGENDA", "Agenda tối đa " + BookingRules.AGENDA_MAX + " ký tự");
        }
        int buffer = mentor.effectiveBufferMinutes();
        String finalAgenda = agenda;

        MentoringSession saved = tx.execute(s -> {
            sessions.lockMentor(request.getMentorId());
            MentoringRequest locked = requestRepo.findForUpdate(requestId).orElseThrow();
            if (locked.getStatus() != MentoringRequest.Status.INTRO) {
                throw ApiException.conflict("REQUEST_NOT_INTRO", "Yêu cầu không còn ở bước làm quen");
            }
            if (!sessionRepo.findByRequestIdAndKindAndStatusIn(requestId, MentoringSession.Kind.INTRO, ACTIVE_INTRO).isEmpty()) {
                throw ApiException.conflict("INTRO_ALREADY_BOOKED", "Bạn đã có buổi làm quen cho yêu cầu này");
            }
            sessions.requireFree(request.getMentorId(), request.getMenteeId(), start, introMinutes, buffer, null);
            MentoringSession session = new MentoringSession();
            session.setKind(MentoringSession.Kind.INTRO);
            session.setRequestId(requestId);
            session.setMenteeId(request.getMenteeId());
            session.setMentorId(request.getMentorId());
            session.setScheduledAt(start);
            session.setDurationMinutes(introMinutes);
            session.setSessionType(request.getSessionType());
            session.setAgenda(finalAgenda);
            session.setTopic("Buổi làm quen");
            session.setMeetingLink(MeetingLinks.sanitize(mentor.meetingLink()));
            session.setPrice(BigDecimal.ZERO);
            session.setStatus(MentoringSession.Status.CONFIRMED);
            return sessionRepo.save(session);
        });

        String when = saved.getScheduledAt().atZoneSameInstant(zone).format(DISPLAY);
        notifications.notifyUser(saved.getMentorId(), "INTRO_BOOKED", "Có buổi làm quen mới",
                "Mentee đã đặt buổi làm quen " + introMinutes + " phút lúc " + when + ".", "/mentoring/requests");
        notifications.notifyUser(saved.getMenteeId(), "INTRO_BOOKED", "Đã đặt buổi làm quen",
                "Buổi làm quen " + introMinutes + " phút lúc " + when + " đã được xác nhận.", "/mentoring/requests");
        return sessions.view(saved);
    }

    /**
     * Sau buổi làm quen (đã COMPLETED — hai bên xác nhận tham dự), mỗi bên quyết định CONTINUE / DECLINE.
     * DECLINE của bất kỳ bên nào → REJECTED. Cả hai CONTINUE → ACCEPTED (kiểm tra sức chứa khi mentor CONTINUE).
     */
    public MentoringRequest decide(AuthUser user, UUID requestId, IntroDecisionInput in) {
        MentoringRequest updated = tx.execute(s -> {
            MentoringRequest r = requestRepo.findForUpdate(requestId)
                    .orElseThrow(() -> ApiException.notFound("REQUEST_NOT_FOUND", "Không tìm thấy yêu cầu"));
            boolean isMentee = user.userId() != null && user.userId().equals(r.getMenteeId());
            boolean isMentor = user.userId() != null && user.userId().equals(r.getMentorId());
            if (!isMentee && !isMentor) {
                throw ApiException.forbidden("Bạn không thuộc yêu cầu này");
            }
            if (r.getStatus() != MentoringRequest.Status.INTRO) {
                throw ApiException.conflict("REQUEST_NOT_INTRO", "Yêu cầu không ở bước làm quen");
            }
            boolean held = sessionRepo.findByRequestIdAndKindAndStatusIn(requestId, MentoringSession.Kind.INTRO,
                    Set.of(MentoringSession.Status.COMPLETED)).size() > 0;
            if (!held) {
                throw ApiException.conflict("INTRO_NOT_HELD", "Chỉ quyết định được sau khi buổi làm quen đã diễn ra (đã xác nhận tham dự)");
            }
            Decision existing = isMentee ? r.getMenteeDecision() : r.getMentorDecision();
            if (existing != null) {
                throw ApiException.conflict("DECISION_ALREADY_MADE", "Bạn đã quyết định rồi");
            }
            if (in.decision() == Decision.CONTINUE && isMentor) {
                int capacity = profileClient.findMentor(r.getMentorId()).map(ProfileClient.MentorInfo::capacity).orElse(0);
                if (requestRepo.countActiveMentees(r.getMentorId()) >= capacity) {
                    throw ApiException.conflict("CAPACITY_FULL", "Bạn đã nhận đủ số mentee tối đa (" + capacity + ")");
                }
            }
            if (isMentee) r.setMenteeDecision(in.decision());
            else r.setMentorDecision(in.decision());
            if (in.decision() == Decision.DECLINE) {
                r.setStatus(MentoringRequest.Status.REJECTED);
                r.setRejectReason(MentoringRequest.RejectReason.OTHER);
                r.setResponseNote(MentoringRequestService.trimToNull(in.note()));
                r.setRespondedAt(OffsetDateTime.now());
            } else if (r.getMenteeDecision() == Decision.CONTINUE && r.getMentorDecision() == Decision.CONTINUE) {
                r.setStatus(MentoringRequest.Status.ACCEPTED);
                r.setRespondedAt(OffsetDateTime.now());
            }
            return r;
        });
        UUID other = user.userId().equals(updated.getMentorId()) ? updated.getMenteeId() : updated.getMentorId();
        switch (updated.getStatus()) {
            case ACCEPTED -> {
                syncActiveMentees(updated.getMentorId());
                for (UUID id : List.of(updated.getMenteeId(), updated.getMentorId())) {
                    notifications.notifyUser(id, "REQUEST_ACCEPTED", "Hai bên đã đồng ý làm việc cùng nhau",
                            "Quan hệ mentoring đã bắt đầu. Hãy đặt lịch phiên đầu tiên!", "/mentoring/requests");
                }
            }
            case REJECTED -> notifications.notifyUser(other, "REQUEST_REJECTED", "Sau buổi làm quen, một bên chọn không tiếp tục",
                    "Yêu cầu mentoring đã kết thúc. Bạn có thể tìm mentor khác phù hợp hơn.", "/matching");
            default -> notifications.notifyUser(other, "INTRO_DECISION", "Đối phương đã quyết định sau buổi làm quen",
                    "Hãy vào trang Yêu cầu để chọn tiếp tục hay không.", "/mentoring/requests");
        }
        return updated;
    }

    private void syncActiveMentees(UUID mentorId) {
        profileClient.updateActiveMentees(mentorId, requestRepo.countActiveMentees(mentorId));
    }

    private static void requireMentee(AuthUser user, MentoringRequest r) {
        if (!user.isAdmin() && !r.getMenteeId().equals(user.userId())) {
            throw ApiException.forbidden("Chỉ mentee của yêu cầu mới đặt được buổi làm quen");
        }
    }

    private static String abbreviate(String text, int max) {
        if (text == null) return "";
        String t = text.trim();
        return t.length() <= max ? t : t.substring(0, Math.max(0, max - 1)) + "…";
    }
}
