package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.MentoringDtos.*;
import com.mmp.mentoring.entity.MentoringRequest;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.MentoringRequestRepository;
import com.mmp.mentoring.security.AuthUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

/** Gửi/phản hồi yêu cầu mentoring (FR-5.2, FR-5.3) và quản lý sức chứa của mentor. */
@Service
public class MentoringRequestService {

    private final MentoringRequestRepository requestRepo;
    private final ProfileClient profileClient;
    private final NotificationService notifications;
    private final TransactionTemplate tx;

    public MentoringRequestService(MentoringRequestRepository requestRepo, ProfileClient profileClient,
                                   NotificationService notifications, TransactionTemplate tx) {
        this.requestRepo = requestRepo;
        this.profileClient = profileClient;
        this.notifications = notifications;
        this.tx = tx;
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
        if (requestRepo.existsByMenteeIdAndMentorIdAndStatusIn(mentee.userId(), in.mentorId(),
                List.of(MentoringRequest.Status.PENDING, MentoringRequest.Status.ACCEPTED))) {
            throw ApiException.conflict("REQUEST_ALREADY_EXISTS", "Bạn đã có yêu cầu đang chờ hoặc đang được mentor này hướng dẫn");
        }
        MentoringRequest saved = tx.execute(s -> requestRepo.save(
                new MentoringRequest(mentee.userId(), in.mentorId(), trimToNull(in.message()))));
        String menteeName = profileClient.summary(mentee.userId()).map(ProfileClient.ProfileSummary::displayName).orElse("Một mentee");
        notifications.notifyUser(in.mentorId(), "REQUEST_RECEIVED", "Yêu cầu mentoring mới",
                menteeName + " muốn được bạn hướng dẫn.", "/mentoring/requests");
        return toView(saved, Map.of(mentee.userId(), menteeName, mentor.userId(), mentor.displayName()));
    }

    /** FR-5.3 — mentor chấp nhận/từ chối. Chấp nhận chỉ khi còn sức chứa. */
    public RequestView respond(AuthUser mentor, UUID requestId, RespondRequestInput in) {
        MentoringRequest updated = tx.execute(s -> {
            MentoringRequest r = find(requestId);
            if (!mentor.isAdmin() && !r.getMentorId().equals(mentor.userId())) {
                throw ApiException.forbidden("Yêu cầu này không gửi tới bạn");
            }
            if (r.getStatus() != MentoringRequest.Status.PENDING) {
                throw ApiException.conflict("REQUEST_NOT_PENDING", "Yêu cầu đã được xử lý");
            }
            if ("ACCEPT".equals(in.decision())) {
                int capacity = profileClient.findMentor(r.getMentorId()).map(ProfileClient.MentorInfo::capacity).orElse(0);
                if (requestRepo.countActiveMentees(r.getMentorId()) >= capacity) {
                    throw ApiException.conflict("CAPACITY_FULL", "Bạn đã nhận đủ số mentee tối đa (" + capacity + ")");
                }
                r.setStatus(MentoringRequest.Status.ACCEPTED);
            } else {
                r.setStatus(MentoringRequest.Status.REJECTED);
            }
            r.setResponseNote(trimToNull(in.note()));
            r.setRespondedAt(OffsetDateTime.now());
            return r;
        });
        syncActiveMentees(updated.getMentorId());
        boolean accepted = updated.getStatus() == MentoringRequest.Status.ACCEPTED;
        notifications.notifyUser(updated.getMenteeId(), accepted ? "REQUEST_ACCEPTED" : "REQUEST_REJECTED",
                accepted ? "Yêu cầu mentoring được chấp nhận" : "Yêu cầu mentoring bị từ chối",
                accepted ? "Mentor đã nhận bạn. Hãy đặt lịch phiên mentoring đầu tiên!" : "Mentor chưa thể nhận bạn lúc này."
                        + (updated.getResponseNote() == null ? "" : " Lời nhắn: " + updated.getResponseNote()),
                "/mentoring/requests");
        return toView(updated, names(updated));
    }

    public RequestView cancel(AuthUser mentee, UUID requestId) {
        MentoringRequest r = tx.execute(s -> {
            MentoringRequest req = find(requestId);
            if (!mentee.isAdmin() && !req.getMenteeId().equals(mentee.userId())) {
                throw ApiException.forbidden("Bạn không thể huỷ yêu cầu của người khác");
            }
            if (req.getStatus() != MentoringRequest.Status.PENDING) {
                throw ApiException.conflict("REQUEST_NOT_PENDING", "Chỉ huỷ được yêu cầu đang chờ phản hồi");
            }
            req.setStatus(MentoringRequest.Status.CANCELLED);
            return req;
        });
        return toView(r, names(r));
    }

    /** Kết thúc quan hệ mentoring → giải phóng 1 slot sức chứa của mentor. */
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
        UUID other = user.userId().equals(r.getMentorId()) ? r.getMenteeId() : r.getMentorId();
        notifications.notifyUser(other, "MENTORING_ENDED", "Kết thúc mentoring",
                "Quan hệ mentoring đã được đánh dấu hoàn thành.", "/mentoring/requests");
        return toView(r, names(r));
    }

    public List<RequestView> mine(AuthUser user) {
        List<MentoringRequest> list = switch (user.role()) {
            case "MENTOR" -> requestRepo.findByMentorIdOrderByCreatedAtDesc(user.userId());
            case "MENTEE" -> requestRepo.findByMenteeIdOrderByCreatedAtDesc(user.userId());
            default -> requestRepo.findAll();
        };
        Map<UUID, String> names = profileClient.displayNames(
                list.stream().flatMap(r -> Stream.of(r.getMenteeId(), r.getMentorId())).toList());
        return list.stream().map(r -> toView(r, names)).toList();
    }

    public void syncActiveMentees(UUID mentorId) {
        profileClient.updateActiveMentees(mentorId, requestRepo.countActiveMentees(mentorId));
    }

    private MentoringRequest find(UUID id) {
        return requestRepo.findById(id).orElseThrow(() -> ApiException.notFound("REQUEST_NOT_FOUND", "Không tìm thấy yêu cầu"));
    }

    private Map<UUID, String> names(MentoringRequest r) {
        return profileClient.displayNames(List.of(r.getMenteeId(), r.getMentorId()));
    }

    private static RequestView toView(MentoringRequest r, Map<UUID, String> names) {
        return new RequestView(r.getId(), r.getMenteeId(), names.get(r.getMenteeId()), r.getMentorId(),
                names.get(r.getMentorId()), r.getMessage(), r.getStatus().name(), r.getResponseNote(), r.getCreatedAt(),
                r.getRespondedAt());
    }

    static String trimToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
