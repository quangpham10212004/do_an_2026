package com.mmp.mentoring.service;

import com.mmp.mentoring.entity.MentoringSession;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Optional;

/**
 * US-06 (PRD-SES-5/6) — quy tắc dời lịch dạng hàm thuần:
 * <ul>
 *   <li>Chỉ phiên CONFIRMED, đề xuất trước giờ bắt đầu ≥ 2 giờ.</li>
 *   <li>Tối đa 2 lần dời / phiên (409 RESCHEDULE_LIMIT), mỗi phiên 1 đề xuất mở (409 RESCHEDULE_PENDING).</li>
 *   <li>Đề xuất hết hạn lúc min(tạo + 24 giờ, giờ bắt đầu gốc − 1 giờ).</li>
 * </ul>
 */
@Component
public class RescheduleRules {

    private final int maxPerSession;
    private final Duration minBeforeStart;
    private final Duration proposalTtl;
    private final Duration expireBeforeStart;

    public RescheduleRules(@Value("${app.reschedule.max-per-session:2}") int maxPerSession,
                           @Value("${app.reschedule.min-before-start:PT2H}") Duration minBeforeStart,
                           @Value("${app.reschedule.proposal-ttl:PT24H}") Duration proposalTtl,
                           @Value("${app.reschedule.expire-before-start:PT1H}") Duration expireBeforeStart) {
        this.maxPerSession = maxPerSession;
        this.minBeforeStart = minBeforeStart;
        this.proposalTtl = proposalTtl;
        this.expireBeforeStart = expireBeforeStart;
    }

    public static RescheduleRules defaults() {
        return new RescheduleRules(2, Duration.ofHours(2), Duration.ofHours(24), Duration.ofHours(1));
    }

    /** Mã lỗi (409) nếu không được đề xuất dời lịch; empty = được. */
    public Optional<String> proposeBlock(MentoringSession.Status status, OffsetDateTime start, int rescheduleCount,
                                         boolean hasOpenProposal, OffsetDateTime now) {
        if (status != MentoringSession.Status.CONFIRMED) return Optional.of("SESSION_NOT_CONFIRMED");
        if (now.plus(minBeforeStart).isAfter(start)) return Optional.of("RESCHEDULE_TOO_LATE");
        if (rescheduleCount >= maxPerSession) return Optional.of("RESCHEDULE_LIMIT");
        if (hasOpenProposal) return Optional.of("RESCHEDULE_PENDING");
        return Optional.empty();
    }

    public OffsetDateTime expiresAt(OffsetDateTime createdAt, OffsetDateTime originalStart) {
        OffsetDateTime byTtl = createdAt.plus(proposalTtl);
        OffsetDateTime byStart = originalStart.minus(expireBeforeStart);
        return byTtl.isBefore(byStart) ? byTtl : byStart;
    }

    public int maxPerSession() {
        return maxPerSession;
    }

    public Duration minBeforeStart() {
        return minBeforeStart;
    }
}
