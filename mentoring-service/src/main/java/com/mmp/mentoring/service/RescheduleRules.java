package com.mmp.mentoring.service;

import com.mmp.mentoring.entity.MentoringSession;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Optional;

/**
 * US-06 (PRD-SES-5/6) — quy tắc dời lịch dạng hàm thuần. Dời lịch là chính sách RIÊNG, tách khỏi chính sách huỷ (không tiền, không strike):
 * <ul>
 *   <li>Chỉ phiên CONFIRMED, đề xuất được bất kỳ lúc nào TRƯỚC giờ bắt đầu hiện tại (409 RESCHEDULE_TOO_LATE khi đã tới / quá giờ).</li>
 *   <li>Đã có người vào phòng (mentor_joined_at / mentee_joined_at) thì không dời nữa (409 SESSION_ALREADY_JOINED) để nhật ký vào phòng
 *       — căn cứ xác định vắng mặt — không mâu thuẫn với giờ mới.</li>
 *   <li>Tối đa 2 lần dời / phiên (409 RESCHEDULE_LIMIT), mỗi phiên 1 đề xuất mở (409 RESCHEDULE_PENDING).</li>
 *   <li>Đề xuất hết hạn lúc min(tạo + proposal-ttl, giờ bắt đầu hiện tại).</li>
 * </ul>
 */
@Component
public class RescheduleRules {

    private final int maxPerSession;
    private final Duration proposalTtl;

    public RescheduleRules(@Value("${app.reschedule.max-per-session:2}") int maxPerSession,
                           @Value("${app.reschedule.proposal-ttl:PT24H}") Duration proposalTtl) {
        this.maxPerSession = maxPerSession;
        this.proposalTtl = proposalTtl;
    }

    public static RescheduleRules defaults() {
        return new RescheduleRules(2, Duration.ofHours(24));
    }

    /** Mã lỗi (409) nếu không được đề xuất dời lịch; empty = được. */
    public Optional<String> proposeBlock(MentoringSession.Status status, OffsetDateTime start, int rescheduleCount,
                                         boolean hasOpenProposal, boolean someoneJoined, OffsetDateTime now) {
        if (status != MentoringSession.Status.CONFIRMED) return Optional.of("SESSION_NOT_CONFIRMED");
        if (!now.isBefore(start)) return Optional.of("RESCHEDULE_TOO_LATE");
        if (someoneJoined) return Optional.of("SESSION_ALREADY_JOINED");
        if (rescheduleCount >= maxPerSession) return Optional.of("RESCHEDULE_LIMIT");
        if (hasOpenProposal) return Optional.of("RESCHEDULE_PENDING");
        return Optional.empty();
    }

    public OffsetDateTime expiresAt(OffsetDateTime createdAt, OffsetDateTime currentStart) {
        OffsetDateTime byTtl = createdAt.plus(proposalTtl);
        return byTtl.isBefore(currentStart) ? byTtl : currentStart;
    }

    public int maxPerSession() {
        return maxPerSession;
    }
}
