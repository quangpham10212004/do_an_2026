package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.MentoringDtos.SessionInternalView;
import com.mmp.mentoring.dto.MentoringDtos.SessionView;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.entity.Review;
import com.mmp.mentoring.repository.ReviewRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/** Dựng {@link SessionView}: gắn tên hiển thị, đánh giá và quy tắc đổi lịch để giao diện báo trước cho người dùng. */
@Component
public class SessionViewMapper {

    private final ProfileClient profileClient;
    private final ReviewRepository reviewRepo;
    private final int rescheduleLimit;
    private final long freeRescheduleHours;

    public SessionViewMapper(ProfileClient profileClient, ReviewRepository reviewRepo,
                             @Value("${app.reschedule.max-per-session}") int rescheduleLimit,
                             @Value("${app.reschedule.free-window}") Duration freeWindow) {
        this.profileClient = profileClient;
        this.reviewRepo = reviewRepo;
        this.rescheduleLimit = rescheduleLimit;
        this.freeRescheduleHours = freeWindow.toHours();
    }

    public SessionView toView(MentoringSession s) {
        return toViews(List.of(s)).get(0);
    }

    public List<SessionView> toViews(List<MentoringSession> sessions) {
        Map<UUID, String> names = profileClient.displayNames(
                sessions.stream().flatMap(s -> Stream.of(s.getMenteeId(), s.getMentorId())).toList());
        Map<UUID, Review> reviews = sessions.isEmpty() ? Map.of()
                : reviewRepo.findBySessionIdIn(sessions.stream().map(MentoringSession::getId).toList()).stream()
                .collect(Collectors.toMap(Review::getSessionId, r -> r));
        return sessions.stream().map(s -> {
            Review r = reviews.get(s.getId());
            return new SessionView(s.getId(), s.getRequestId(), s.getMenteeId(), names.get(s.getMenteeId()), s.getMentorId(),
                    names.get(s.getMentorId()), s.getScheduledAt(), s.getDurationMinutes(), s.getPrice(), s.getTopic(),
                    s.getStatus().name(), r != null, r == null ? null : r.getRating(), s.getCreatedAt(),
                    s.getType().name(), s.getPackageId(), s.getRescheduleCount(), rescheduleLimit, freeRescheduleHours,
                    s.getProposedAt(), s.getProposedBy());
        }).toList();
    }

    public SessionInternalView toInternal(MentoringSession s) {
        return new SessionInternalView(s.getId(), s.getMenteeId(), s.getMentorId(), s.getScheduledAt(), s.getDurationMinutes(),
                s.getPrice(), s.getStatus().name());
    }
}
