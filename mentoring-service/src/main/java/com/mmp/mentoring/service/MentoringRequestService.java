package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.MentoringDtos.*;
import com.mmp.mentoring.entity.MentoringRequest;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.MentoringRequestRepository;
import com.mmp.mentoring.repository.SessionRepository;
import com.mmp.mentoring.security.AuthUser;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

/**
 * Gửi/phản hồi yêu cầu mentoring (FR-5.2, FR-5.3) và quản lý sức chứa của mentor.
 *
 * <p>Mentor có thể nhận thẳng (ACCEPT), đồng ý cho một buổi làm quen trước (INTRO) hoặc từ chối (REJECT).
 * Yêu cầu ở giai đoạn INTRO chưa chiếm chỗ của mentor; xem {@link IntroService} cho phần sau buổi làm quen.</p>
 */
@Service
public class MentoringRequestService {

    private static final List<MentoringRequest.Status> OPEN = List.of(
            MentoringRequest.Status.PENDING, MentoringRequest.Status.INTRO, MentoringRequest.Status.ACCEPTED);

    private final MentoringRequestRepository requestRepo;
    private final SessionRepository sessionRepo;
    private final ProfileClient profileClient;
    private final NotificationService notifications;
    private final PackageService packageService;
    private final RequestViewMapper mapper;
    private final TransactionTemplate tx;
    private final int maxOpenIntros;

    public MentoringRequestService(MentoringRequestRepository requestRepo, SessionRepository sessionRepo,
                                   ProfileClient profileClient, NotificationService notifications,
                                   PackageService packageService, RequestViewMapper mapper, TransactionTemplate tx,
                                   @Value("${app.intro.max-open-per-mentor}") int maxOpenIntros) {
        this.requestRepo = requestRepo;
        this.sessionRepo = sessionRepo;
        this.profileClient = profileClient;
        this.notifications = notifications;
        this.packageService = packageService;
        this.mapper = mapper;
        this.tx = tx;
        this.maxOpenIntros = maxOpenIntros;
    }

    public RequestView create(AuthUser mentee, CreateRequestInput in) {
        ProfileClient.MentorInfo mentor = profileClient.findMentor(in.mentorId())
                .orElseThrow(() -> ApiException.notFound("MENTOR_NOT_FOUND", "Không tìm thấy mentor"));
        if (!"APPROVED".equals(mentor.verificationStatus())) {
            throw ApiException.badRequest("MENTOR_NOT_VERIFIED", "Mentor chưa được xác thực năng lực");
        }
        if (!mentor.isAvailable()) {
            throw ApiException.badRequest("MENTOR_UNAVAILABLE", "Mentor hiện không nhận mentee mới");
        }
        if (requestRepo.existsByMenteeIdAndMentorIdAndStatusIn(mentee.userId(), in.mentorId(), OPEN)) {
            throw ApiException.conflict("REQUEST_ALREADY_EXISTS", "Bạn đã có yêu cầu đang chờ hoặc đang được mentor này hướng dẫn");
        }
        MentoringRequest saved = tx.execute(s -> requestRepo.save(
                new MentoringRequest(mentee.userId(), in.mentorId(), trimToNull(in.message()))));
        String menteeName = profileClient.summary(mentee.userId()).map(ProfileClient.ProfileSummary::displayName).orElse("Một mentee");
        notifications.notifyUser(in.mentorId(), "REQUEST_RECEIVED", "Yêu cầu mentoring mới",
                menteeName + " muốn được bạn hướng dẫn.", "/mentoring/requests");
        return mapper.toView(saved, Map.of(mentee.userId(), menteeName, mentor.userId(), mentor.displayName()));
    }

    /** FR-5.3 — mentor nhận thẳng, đồng ý làm quen trước, hoặc từ chối. Nhận thẳng chỉ khi còn sức chứa. */
    public RequestView respond(AuthUser mentor, UUID requestId, RespondRequestInput in) {
        MentoringRequest updated = tx.execute(s -> {
            MentoringRequest r = find(requestId);
            if (!mentor.isAdmin() && !r.getMentorId().equals(mentor.userId())) {
                throw ApiException.forbidden("Yêu cầu này không gửi tới bạn");
            }
            if (r.getStatus() != MentoringRequest.Status.PENDING) {
                throw ApiException.conflict("REQUEST_NOT_PENDING", "Yêu cầu đã được xử lý");
            }
            switch (in.decision()) {
                case "ACCEPT" -> {
                    ensureCapacity(r.getMentorId());
                    r.setStatus(MentoringRequest.Status.ACCEPTED);
                }
                case "INTRO" -> {
                    if (requestRepo.countByMentorIdAndStatus(r.getMentorId(), MentoringRequest.Status.INTRO) >= maxOpenIntros) {
                        throw ApiException.conflict("INTRO_LIMIT_REACHED",
                                "Bạn đang có " + maxOpenIntros + " yêu cầu ở giai đoạn làm quen, hãy chốt bớt trước khi nhận thêm");
                    }
                    r.setStatus(MentoringRequest.Status.INTRO);
                }
                default -> r.setStatus(MentoringRequest.Status.REJECTED);
            }
            r.setResponseNote(trimToNull(in.note()));
            r.setRespondedAt(OffsetDateTime.now());
            return r;
        });
        syncActiveMentees(updated.getMentorId());
        switch (updated.getStatus()) {
            case ACCEPTED -> notifications.notifyUser(updated.getMenteeId(), "REQUEST_ACCEPTED", "Yêu cầu mentoring được chấp nhận",
                    "Mentor đã nhận bạn. Hãy đặt lịch phiên mentoring đầu tiên!", "/mentoring/requests");
            case INTRO -> notifications.notifyUser(updated.getMenteeId(), "REQUEST_INTRO", "Mentor đồng ý buổi làm quen",
                    "Hãy đặt một buổi trò chuyện " + mapper.introDurationMinutes() + " phút (miễn phí) để hai bên làm quen trước khi bắt đầu.",
                    "/mentoring/requests");
            default -> notifications.notifyUser(updated.getMenteeId(), "REQUEST_REJECTED", "Yêu cầu mentoring bị từ chối",
                    "Mentor chưa thể nhận bạn lúc này." + (updated.getResponseNote() == null ? "" : " Lời nhắn: " + updated.getResponseNote()),
                    "/mentoring/requests");
        }
        return mapper.toView(updated, names(updated));
    }

    /** Mentee huỷ yêu cầu khi còn chờ phản hồi hoặc đang làm quen (các buổi làm quen chưa diễn ra bị huỷ theo). */
    public RequestView cancel(AuthUser mentee, UUID requestId) {
        MentoringRequest r = tx.execute(s -> {
            MentoringRequest req = find(requestId);
            if (!mentee.isAdmin() && !req.getMenteeId().equals(mentee.userId())) {
                throw ApiException.forbidden("Bạn không thể huỷ yêu cầu của người khác");
            }
            if (req.getStatus() != MentoringRequest.Status.PENDING && req.getStatus() != MentoringRequest.Status.INTRO) {
                throw ApiException.conflict("REQUEST_NOT_PENDING", "Chỉ huỷ được yêu cầu đang chờ phản hồi hoặc đang làm quen");
            }
            req.setStatus(MentoringRequest.Status.CANCELLED);
            cancelOpenIntroSessions(req.getId());
            return req;
        });
        return mapper.toView(r, names(r));
    }

    /** Kết thúc quan hệ mentoring → giải phóng 1 slot sức chứa của mentor và đóng các gói còn hiệu lực. */
    public RequestView complete(AuthUser user, UUID requestId) {
        MentoringRequest r = tx.execute(s -> {
            MentoringRequest req = find(requestId);
            if (!user.isAdmin() && !req.getMentorId().equals(user.userId()) && !req.getMenteeId().equals(user.userId())) {
                throw ApiException.forbidden("Bạn không thuộc quan hệ mentoring này");
            }
            if (req.getStatus() != MentoringRequest.Status.ACCEPTED) {
                throw ApiException.conflict("REQUEST_NOT_ACTIVE", "Quan hệ mentoring không còn hoạt động");
            }
            req.setStatus(MentoringRequest.Status.COMPLETED);
            return req;
        });
        syncActiveMentees(r.getMentorId());
        packageService.endForRelationship(r.getMenteeId(), r.getMentorId());
        UUID other = user.userId().equals(r.getMentorId()) ? r.getMenteeId() : r.getMentorId();
        notifications.notifyUser(other, "MENTORING_ENDED", "Kết thúc mentoring",
                "Quan hệ mentoring đã được đánh dấu hoàn thành.", "/mentoring/requests");
        return mapper.toView(r, names(r));
    }

    public List<RequestView> mine(AuthUser user) {
        List<MentoringRequest> list = switch (user.role()) {
            case "MENTOR" -> requestRepo.findByMentorIdOrderByCreatedAtDesc(user.userId());
            case "MENTEE" -> requestRepo.findByMenteeIdOrderByCreatedAtDesc(user.userId());
            default -> requestRepo.findAll();
        };
        Map<UUID, String> names = profileClient.displayNames(
                list.stream().flatMap(r -> Stream.of(r.getMenteeId(), r.getMentorId())).toList());
        return list.stream().map(r -> mapper.toView(r, names)).toList();
    }

    public void syncActiveMentees(UUID mentorId) {
        profileClient.updateActiveMentees(mentorId, requestRepo.countActiveMentees(mentorId));
    }

    /** Sức chứa của mentor còn chỗ cho một mentee mới (gọi trong transaction). */
    void ensureCapacity(UUID mentorId) {
        int capacity = profileClient.findMentor(mentorId).map(ProfileClient.MentorInfo::capacity).orElse(0);
        if (requestRepo.countActiveMentees(mentorId) >= capacity) {
            throw ApiException.conflict("CAPACITY_FULL", "Bạn đã nhận đủ số mentee tối đa (" + capacity + ")");
        }
    }

    private void cancelOpenIntroSessions(UUID requestId) {
        sessionRepo.findByRequestIdAndStatusIn(requestId, List.of(MentoringSession.Status.PENDING, MentoringSession.Status.CONFIRMED))
                .stream().filter(s -> s.getType() == MentoringSession.Type.INTRO)
                .forEach(s -> s.setStatus(MentoringSession.Status.CANCELLED));
    }

    private MentoringRequest find(UUID id) {
        return requestRepo.findById(id).orElseThrow(() -> ApiException.notFound("REQUEST_NOT_FOUND", "Không tìm thấy yêu cầu"));
    }

    private Map<UUID, String> names(MentoringRequest r) {
        return profileClient.displayNames(List.of(r.getMenteeId(), r.getMentorId()));
    }

    static String trimToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
