package com.mmp.mentoring.service;

import com.mmp.mentoring.dto.MentoringDtos.IntroView;
import com.mmp.mentoring.dto.MentoringDtos.RequestView;
import com.mmp.mentoring.entity.MentoringRequest;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.repository.SessionRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/** Dựng {@link RequestView}, kèm buổi làm quen (nếu có) và việc hai bên đã có thể chọn tiếp tục hay chưa. */
@Component
public class RequestViewMapper {

    private final SessionRepository sessionRepo;
    private final int introDurationMinutes;

    public RequestViewMapper(SessionRepository sessionRepo, @Value("${app.intro.duration-minutes}") int introDurationMinutes) {
        this.sessionRepo = sessionRepo;
        this.introDurationMinutes = introDurationMinutes;
    }

    public int introDurationMinutes() {
        return introDurationMinutes;
    }

    public RequestView toView(MentoringRequest r, Map<UUID, String> names) {
        IntroView intro = null;
        if (r.getStatus() == MentoringRequest.Status.INTRO) {
            intro = sessionRepo.findActiveIntro(r.getId()).stream().findFirst().map(RequestViewMapper::toIntro).orElse(null);
        }
        return new RequestView(r.getId(), r.getMenteeId(), names.get(r.getMenteeId()), r.getMentorId(),
                names.get(r.getMentorId()), r.getMessage(), r.getStatus().name(), r.getResponseNote(),
                r.getMenteeDecision() == null ? null : r.getMenteeDecision().name(),
                r.getMentorDecision() == null ? null : r.getMentorDecision().name(),
                intro, introDurationMinutes, r.getCreatedAt(), r.getRespondedAt());
    }

    static IntroView toIntro(MentoringSession s) {
        return new IntroView(s.getId(), s.getScheduledAt(), s.endsAt(), s.getStatus().name(), isDecisionOpen(s, OffsetDateTime.now()));
    }

    /** Hai bên chỉ chọn tiếp tục/dừng sau khi buổi làm quen đã kết thúc. */
    static boolean isDecisionOpen(MentoringSession intro, OffsetDateTime now) {
        return (intro.getStatus() == MentoringSession.Status.CONFIRMED || intro.getStatus() == MentoringSession.Status.COMPLETED)
                && !intro.endsAt().isAfter(now);
    }
}
