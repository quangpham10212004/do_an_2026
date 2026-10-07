package com.mmp.mentoring.repository;

import com.mmp.mentoring.entity.MentoringRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MentoringRequestRepository extends JpaRepository<MentoringRequest, UUID> {

    List<MentoringRequest> findByMentorIdOrderByCreatedAtDesc(UUID mentorId);

    List<MentoringRequest> findByMenteeIdOrderByCreatedAtDesc(UUID menteeId);

    boolean existsByMenteeIdAndMentorIdAndStatusIn(UUID menteeId, UUID mentorId, Collection<MentoringRequest.Status> statuses);

    Optional<MentoringRequest> findFirstByMenteeIdAndMentorIdAndStatus(UUID menteeId, UUID mentorId, MentoringRequest.Status status);

    @Query("SELECT COUNT(DISTINCT r.menteeId) FROM MentoringRequest r WHERE r.mentorId = :mentorId AND r.status = 'ACCEPTED'")
    long countActiveMentees(@Param("mentorId") UUID mentorId);

    long countByMenteeIdAndStatus(UUID menteeId, MentoringRequest.Status status);

    /** US-14 — advisory lock theo mentee trong transaction: kiểm tra "tối đa 3 PENDING" + tạo yêu cầu không bị chen ngang. */
    @Query(value = "SELECT pg_advisory_xact_lock(hashtext('mentee-requests:' || CAST(:menteeId AS text)))", nativeQuery = true)
    Object lockMenteeRequests(@Param("menteeId") UUID menteeId);
}
