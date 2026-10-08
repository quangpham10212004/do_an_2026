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

    /** Số yêu cầu đang ở trạng thái {@code status} của 1 mentor (giới hạn số yêu cầu INTRO đồng thời). */
    long countByMentorIdAndStatus(UUID mentorId, MentoringRequest.Status status);

    long countByMenteeIdAndStatus(UUID menteeId, MentoringRequest.Status status);

    /** US-15 — yêu cầu PENDING tạo trước {@code before} (đã quá hạn phản hồi). */
    @Query("SELECT r.id FROM MentoringRequest r WHERE r.status = 'PENDING' AND r.createdAt < :before ORDER BY r.createdAt")
    List<UUID> findPendingIdsCreatedBefore(@Param("before") java.time.OffsetDateTime before);

    /** Chỉ dùng cho endpoint dev (/internal/dev/requests/{id}/shift) — created_at không cập nhật được qua entity. */
    @org.springframework.data.jpa.repository.Modifying
    @Query(value = "UPDATE mentoring_requests SET created_at = :createdAt WHERE id = :id", nativeQuery = true)
    int overrideCreatedAt(@Param("id") UUID id, @Param("createdAt") java.time.OffsetDateTime createdAt);

    /** Khoá dòng yêu cầu khi phản hồi / hết hạn để hai thao tác không ghi đè nhau. */
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM MentoringRequest r WHERE r.id = :id")
    Optional<MentoringRequest> findForUpdate(@Param("id") UUID id);

    /** US-14 — advisory lock theo mentee trong transaction: kiểm tra "tối đa 3 PENDING" + tạo yêu cầu không bị chen ngang. */
    @Query(value = "SELECT pg_advisory_xact_lock(hashtext('mentee-requests:' || CAST(:menteeId AS text)))", nativeQuery = true)
    Object lockMenteeRequests(@Param("menteeId") UUID menteeId);
}
