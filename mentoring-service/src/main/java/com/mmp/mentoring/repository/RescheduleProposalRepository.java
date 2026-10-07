package com.mmp.mentoring.repository;

import com.mmp.mentoring.entity.RescheduleProposal;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RescheduleProposalRepository extends JpaRepository<RescheduleProposal, UUID> {

    Optional<RescheduleProposal> findFirstBySessionIdAndStatus(UUID sessionId, RescheduleProposal.Status status);

    List<RescheduleProposal> findBySessionIdInAndStatus(Collection<UUID> sessionIds, RescheduleProposal.Status status);

    List<RescheduleProposal> findByStatusAndExpiresAtBefore(RescheduleProposal.Status status, OffsetDateTime before);

    /** Đề xuất PENDING của các phiên mà người dùng tham gia, có giờ bắt đầu mới trong cửa sổ — dùng như khoảng bận. */
    @Query("""
            SELECT p FROM RescheduleProposal p, MentoringSession s
            WHERE p.sessionId = s.id AND p.status = 'PENDING'
              AND (s.mentorId = :userId OR s.menteeId = :userId)
              AND p.newStart < :to AND p.newStart > :fromMinusMaxDuration
            """)
    List<RescheduleProposal> findPendingAround(@Param("userId") UUID userId,
                                               @Param("fromMinusMaxDuration") OffsetDateTime fromMinusMaxDuration,
                                               @Param("to") OffsetDateTime to);
}
