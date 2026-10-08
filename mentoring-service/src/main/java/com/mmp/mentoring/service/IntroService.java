package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.MentoringDtos.DecisionInput;
import com.mmp.mentoring.dto.MentoringDtos.IntroSessionInput;
import com.mmp.mentoring.dto.MentoringDtos.RequestView;
import com.mmp.mentoring.entity.MentoringRequest;
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
import java.util.Map;
import java.util.UUID;

/**
 * Buổi làm quen (intro call): sau khi mentor đồng ý ({@code INTRO}), mentee đặt một buổi trò chuyện ngắn miễn phí.
 * Sau buổi này mỗi bên chọn CONTINUE hoặc DECLINE: cả hai CONTINUE thì yêu cầu thành {@code ACCEPTED} (lúc đó mới
 * chiếm một chỗ trong sức chứa của mentor và mới đặt được phiên có phí); một bên DECLINE thì kết thúc, không phát sinh
 * chi phí.
 */
@Service
public class IntroService {

    private static final DateTimeFormatter DISPLAY = DateTimeFormatter.ofPattern("HH:mm dd/MM/yyyy");

    private final MentoringRequestRepository requestRepo;
    private final SessionRepository sessionRepo;
    private final ProfileClient profileClient;
    private final NotificationService notifications;
    private final MentoringRequestService requestService;
    private final BookingValidator validator;
    private final RequestViewMapper mapper;
    private final TransactionTemplate tx;
    private final int introDurationMinutes;
    private final ZoneId zone;

    public IntroService(MentoringRequestRepository requestRepo, SessionRepository sessionRepo, ProfileClient profileClient,
                        NotificationService notifications, MentoringRequestService requestService, BookingValidator validator,
                        RequestViewMapper mapper, TransactionTemplate tx,
                        @Value("${app.intro.duration-minutes}") int introDurationMinutes) {
        this.requestRepo = requestRepo;
        this.sessionRepo = sessionRepo;
        this.profileClient = profileClient;
        this.notifications = notifications;
        this.requestService = requestService;
        this.validator = validator;
        this.mapper = mapper;
        this.tx = tx;
        this.introDurationMinutes = introDurationMinutes;
        this.zone = validator.zone();
    }

    /** Mentee đặt buổi làm quen cho yêu cầu đang ở giai đoạn INTRO. */
    public RequestView bookIntro(AuthUser mentee, UUID requestId, IntroSessionInput in) {
        MentoringRequest request = find(requestId);
        if (!mentee.isAdmin() && !request.getMenteeId().equals(mentee.userId())) {
            throw ApiException.forbidden("Bạn chỉ đặt được buổi làm quen cho yêu cầu của mình");
        }
        requireIntroStage(request);
        if (!sessionRepo.findActiveIntro(requestId).isEmpty()) {
            throw ApiException.conflict("INTRO_ALREADY_BOOKED", "Bạn đã có buổi làm quen cho yêu cầu này, hãy huỷ buổi cũ nếu muốn đổi");
        }
        OffsetDateTime start = in.scheduledAt();
        validator.checkWindow(start, OffsetDateTime.now());
        ProfileClient.MentorInfo mentor = profileClient.findMentor(request.getMentorId())
                .orElseThrow(() -> ApiException.notFound("MENTOR_NOT_FOUND", "Không tìm thấy mentor"));
        validator.checkAvailability(mentor, start, introDurationMinutes);

        MentoringSession saved = tx.execute(s -> {
            sessionRepo.lockMentorSchedule(request.getMentorId());
            if (!sessionRepo.findActiveIntro(requestId).isEmpty()) {
                throw ApiException.conflict("INTRO_ALREADY_BOOKED", "Bạn đã có buổi làm quen cho yêu cầu này");
            }
            validator.checkNoConflict(request.getMentorId(), request.getMenteeId(), start, introDurationMinutes, null);
            MentoringSession session = new MentoringSession();
            session.setRequestId(requestId);
            session.setMenteeId(request.getMenteeId());
            session.setMentorId(request.getMentorId());
            session.setScheduledAt(start);
            session.setDurationMinutes(introDurationMinutes);
            session.setType(MentoringSession.Type.INTRO);
            session.setTopic("Buổi làm quen");
            session.setPrice(BigDecimal.ZERO);
            session.setStatus(MentoringSession.Status.CONFIRMED);
            return sessionRepo.save(session);
        });
        String when = saved.getScheduledAt().atZoneSameInstant(zone).format(DISPLAY);
        String msg = "Buổi làm quen " + introDurationMinutes + " phút lúc " + when + " đã được xác nhận.";
        notifications.notifyUser(saved.getMenteeId(), "INTRO_BOOKED", "Đã đặt buổi làm quen", msg, "/mentoring/requests");
        notifications.notifyUser(saved.getMentorId(), "INTRO_BOOKED", "Có buổi làm quen mới", msg, "/mentoring/requests");
        return mapper.toView(request, names(request));
    }

    /** Mỗi bên chọn tiếp tục hay dừng sau khi buổi làm quen đã kết thúc. */
    public RequestView decide(AuthUser user, UUID requestId, DecisionInput in) {
        boolean continuing = "CONTINUE".equals(in.decision());
        MentoringRequest updated = tx.execute(s -> {
            MentoringRequest r = find(requestId);
            boolean isMentee = r.getMenteeId().equals(user.userId());
            boolean isMentor = r.getMentorId().equals(user.userId());
            if (!isMentee && !isMentor) {
                throw ApiException.forbidden("Bạn không thuộc yêu cầu này");
            }
            requireIntroStage(r);
            MentoringSession intro = sessionRepo.findActiveIntro(requestId).stream().findFirst()
                    .orElseThrow(() -> ApiException.conflict("INTRO_NOT_BOOKED", "Chưa có buổi làm quen nào cho yêu cầu này"));
            if (!RequestViewMapper.isDecisionOpen(intro, OffsetDateTime.now())) {
                throw ApiException.conflict("INTRO_NOT_FINISHED", "Chỉ chọn được sau khi buổi làm quen kết thúc");
            }
            MentoringRequest.Decision d = MentoringRequest.Decision.valueOf(in.decision());
            if (isMentee) r.setMenteeDecision(d); else r.setMentorDecision(d);
            if (!continuing) {
                r.setStatus(isMentor ? MentoringRequest.Status.REJECTED : MentoringRequest.Status.CANCELLED);
                r.setRespondedAt(OffsetDateTime.now());
            } else if (r.getMenteeDecision() == MentoringRequest.Decision.CONTINUE
                    && r.getMentorDecision() == MentoringRequest.Decision.CONTINUE) {
                requestService.ensureCapacity(r.getMentorId());
                r.setStatus(MentoringRequest.Status.ACCEPTED);
                r.setRespondedAt(OffsetDateTime.now());
            }
            return r;
        });
        notifyAfterDecision(updated, user, continuing);
        return mapper.toView(updated, names(updated));
    }

    private void notifyAfterDecision(MentoringRequest r, AuthUser actor, boolean continuing) {
        boolean actorIsMentee = r.getMenteeId().equals(actor.userId());
        UUID other = actorIsMentee ? r.getMentorId() : r.getMenteeId();
        if (r.getStatus() == MentoringRequest.Status.ACCEPTED) {
            requestService.syncActiveMentees(r.getMentorId());
            String msg = "Hai bên đã đồng ý tiếp tục sau buổi làm quen. Bạn có thể đặt phiên mentoring chính thức.";
            notifications.notifyUser(r.getMenteeId(), "REQUEST_ACCEPTED", "Quan hệ mentoring đã được chốt", msg, "/mentoring/requests");
            notifications.notifyUser(r.getMentorId(), "REQUEST_ACCEPTED", "Quan hệ mentoring đã được chốt", msg, "/mentoring/requests");
        } else if (!continuing) {
            notifications.notifyUser(other, "INTRO_DECLINED", "Không tiếp tục sau buổi làm quen",
                    "Sau buổi làm quen, " + (actorIsMentee ? "mentee" : "mentor") + " chọn không tiếp tục. Yêu cầu đã được đóng.", "/mentoring/requests");
        } else {
            notifications.notifyUser(other, "INTRO_DECISION", "Đang chờ bạn quyết định",
                    (actorIsMentee ? "Mentee" : "Mentor") + " muốn tiếp tục sau buổi làm quen. Hãy chọn tiếp tục hoặc không.", "/mentoring/requests");
        }
    }

    private static void requireIntroStage(MentoringRequest r) {
        if (r.getStatus() != MentoringRequest.Status.INTRO) {
            throw ApiException.conflict("REQUEST_NOT_INTRO", "Yêu cầu không ở giai đoạn làm quen");
        }
    }

    private MentoringRequest find(UUID id) {
        return requestRepo.findById(id).orElseThrow(() -> ApiException.notFound("REQUEST_NOT_FOUND", "Không tìm thấy yêu cầu"));
    }

    private Map<UUID, String> names(MentoringRequest r) {
        return profileClient.displayNames(List.of(r.getMenteeId(), r.getMentorId()));
    }
}
