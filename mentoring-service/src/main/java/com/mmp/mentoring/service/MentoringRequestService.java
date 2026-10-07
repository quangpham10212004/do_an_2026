package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.MentoringDtos.*;
import com.mmp.mentoring.entity.MentoringRequest;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.MentoringRequestRepository;
import com.mmp.mentoring.security.AuthUser;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/** Gửi/phản hồi yêu cầu mentoring (FR-5.2, FR-5.3) và quản lý sức chứa của mentor. */
@Service
public class MentoringRequestService {

    /** Yêu cầu "đang mở": mentor đang xét (PENDING) hoặc đang hướng dẫn (ACCEPTED). */
    static final List<MentoringRequest.Status> OPEN_STATUSES =
            List.of(MentoringRequest.Status.PENDING, MentoringRequest.Status.ACCEPTED);

    private final MentoringRequestRepository requestRepo;
    private final ProfileClient profileClient;
    private final NotificationService notifications;
    private final TransactionTemplate tx;
    private final int maxPending;

    public MentoringRequestService(MentoringRequestRepository requestRepo, ProfileClient profileClient,
                                   NotificationService notifications, TransactionTemplate tx,
                                   @Value("${app.requests.max-pending:3}") int maxPending) {
        this.requestRepo = requestRepo;
        this.profileClient = profileClient;
        this.notifications = notifications;
        this.tx = tx;
        this.maxPending = maxPending;
    }

    /**
     * FR-5.2 / US-14 — gửi yêu cầu theo form (goal 50–1000 ký tự, loại phiên, tần suất, thời gian dự kiến). Mỗi mentee
     * tối đa {@code app.requests.max-pending} (3) yêu cầu PENDING; 1 yêu cầu đang mở với mỗi mentor.
     */
    public RequestView create(AuthUser mentee, CreateRequestInput in) {
        String goal = trimToNull(in.goal());
        RequestRules.validateForm(goal, in.expectedDurationMonths()).ifPresent(code -> {
            throw ApiException.badRequest(code, "INVALID_GOAL".equals(code)
                    ? "Mục tiêu phải dài từ " + RequestRules.GOAL_MIN + " đến " + RequestRules.GOAL_MAX + " ký tự"
                    : "Thời gian dự kiến phải là 1, 3 hoặc 6 tháng");
        });
        ProfileClient.MentorInfo mentor = profileClient.findMentor(in.mentorId())
                .orElseThrow(() -> ApiException.notFound("MENTOR_NOT_FOUND", "Không tìm thấy mentor"));
        if (!"APPROVED".equals(mentor.verificationStatus())) {
            throw ApiException.badRequest("MENTOR_NOT_VERIFIED", "Mentor chưa được xác thực năng lực");
        }
        // US-05 — PAUSED/ON_LEAVE/SUSPENDED: không nhận mentee mới (mentee đã được nhận vẫn đặt lịch được khi PAUSED)
        if (!mentor.isAvailable() || mentor.effectiveStatus() != ProfileClient.MentorStatus.ACCEPTING) {
            throw ApiException.badRequest("MENTOR_UNAVAILABLE", "Mentor hiện không nhận mentee mới");
        }
        MentoringRequest saved = tx.execute(s -> {
            requestRepo.lockMenteeRequests(mentee.userId());
            if (requestRepo.existsByMenteeIdAndMentorIdAndStatusIn(mentee.userId(), in.mentorId(), OPEN_STATUSES)) {
                throw ApiException.conflict("REQUEST_ALREADY_EXISTS", "Bạn đã có yêu cầu đang chờ hoặc đang được mentor này hướng dẫn");
            }
            if (RequestRules.tooManyPending(requestRepo.countByMenteeIdAndStatus(mentee.userId(), MentoringRequest.Status.PENDING), maxPending)) {
                throw ApiException.conflict("TOO_MANY_PENDING_REQUESTS", "Bạn chỉ được có tối đa " + maxPending
                        + " yêu cầu đang chờ phản hồi. Hãy chờ mentor trả lời hoặc huỷ bớt yêu cầu.");
            }
            return requestRepo.save(new MentoringRequest(mentee.userId(), in.mentorId(), goal, in.sessionType(), in.frequency(),
                    in.expectedDurationMonths(), trimToNull(in.message())));
        });
        String menteeName = profileClient.summary(mentee.userId()).map(ProfileClient.ProfileSummary::displayName).orElse("Một mentee");
        notifications.notifyUser(in.mentorId(), "REQUEST_RECEIVED", "Yêu cầu mentoring mới",
                menteeName + " muốn được bạn hướng dẫn.", "/mentoring/requests");
        return toView(saved, Map.of(mentee.userId(), menteeName, mentor.userId(), mentor.displayName()), Map.of());
    }

    /** FR-5.3 / US-14 — mentor chấp nhận/từ chối (từ chối bắt buộc lý do). Chấp nhận chỉ khi còn sức chứa. */
    public RequestView respond(AuthUser mentor, UUID requestId, RespondRequestInput in) {
        boolean reject = "REJECT".equals(in.decision());
        if (reject && in.rejectReason() == null) {
            throw ApiException.badRequest("REJECT_REASON_REQUIRED", "Vui lòng chọn lý do từ chối");
        }
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
                r.setRejectReason(in.rejectReason());
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
                        + (updated.getRejectReason() == null ? "" : " Lý do: " + RequestRules.rejectReasonLabel(updated.getRejectReason()) + ".")
                        + (updated.getResponseNote() == null ? "" : " Lời nhắn: " + updated.getResponseNote()),
                accepted ? "/mentoring/requests" : "/matching");
        return toView(updated, names(updated), Map.of());
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
        return toView(r, names(r), Map.of());
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
        return toView(r, names(r), Map.of());
    }

    public List<RequestView> mine(AuthUser user) {
        List<MentoringRequest> list = switch (user.role()) {
            case "MENTOR" -> requestRepo.findByMentorIdOrderByCreatedAtDesc(user.userId());
            case "MENTEE" -> requestRepo.findByMenteeIdOrderByCreatedAtDesc(user.userId());
            default -> requestRepo.findAll();
        };
        Map<UUID, String> names = profileClient.displayNames(
                list.stream().flatMap(r -> Stream.of(r.getMenteeId(), r.getMentorId())).toList());
        Map<UUID, MenteeSummary> profiles = "MENTEE".equals(user.role()) ? Map.of() : menteeProfiles(list);
        return list.stream().map(r -> toView(r, names, profiles)).toList();
    }

    /**
     * US-14 — tóm tắt hồ sơ mentee cho mentor (chỉ yêu cầu PENDING/ACCEPTED để hạn chế số lời gọi). Lấy từ profile-service
     * (best-effort); không lấy được thì mentor vẫn thấy goal / loại phiên / tần suất mà yêu cầu đã lưu.
     */
    private Map<UUID, MenteeSummary> menteeProfiles(List<MentoringRequest> list) {
        Set<UUID> ids = list.stream().filter(r -> OPEN_STATUSES.contains(r.getStatus()))
                .map(MentoringRequest::getMenteeId).collect(Collectors.toSet());
        Map<UUID, MenteeSummary> result = new java.util.HashMap<>();
        for (UUID id : ids) {
            profileClient.menteeProfile(id).ifPresent(p -> result.put(id, new MenteeSummary(p.displayName(), p.domain(),
                    p.currentLevel(), p.goal(), p.skills() == null ? List.of() : p.skills())));
        }
        return result;
    }

    public void syncActiveMentees(UUID mentorId) {
        profileClient.updateActiveMentees(mentorId, requestRepo.countActiveMentees(mentorId));
    }

    /**
     * Nội bộ — mentor và mentee có yêu cầu đang mở hay không. ai-service dùng để chỉ cho
     * mentor tải CV của mentee mà mình đang xét hoặc đang hướng dẫn.
     */
    public RelationshipView relationship(UUID mentorId, UUID menteeId) {
        return new RelationshipView(mentorId, menteeId,
                requestRepo.existsByMenteeIdAndMentorIdAndStatusIn(menteeId, mentorId, OPEN_STATUSES));
    }

    private MentoringRequest find(UUID id) {
        return requestRepo.findById(id).orElseThrow(() -> ApiException.notFound("REQUEST_NOT_FOUND", "Không tìm thấy yêu cầu"));
    }

    private Map<UUID, String> names(MentoringRequest r) {
        return profileClient.displayNames(List.of(r.getMenteeId(), r.getMentorId()));
    }

    static RequestView toView(MentoringRequest r, Map<UUID, String> names, Map<UUID, MenteeSummary> profiles) {
        return new RequestView(r.getId(), r.getMenteeId(), names.get(r.getMenteeId()), r.getMentorId(),
                names.get(r.getMentorId()), r.getMessage(), r.getGoal(),
                r.getSessionType() == null ? null : r.getSessionType().name(),
                r.getFrequency() == null ? null : r.getFrequency().name(), r.getExpectedDurationMonths(),
                r.getStatus().name(), r.getRejectReason() == null ? null : r.getRejectReason().name(),
                r.getResponseNote(), r.getCreatedAt(), r.getRespondedAt(), profiles.get(r.getMenteeId()));
    }

    static String trimToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
