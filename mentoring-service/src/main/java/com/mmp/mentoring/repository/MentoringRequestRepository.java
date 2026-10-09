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

    /** US-15 — yêu cầu PENDING tạo trước {@code before} (đã quá hạn phản hồi). */
    @Query("SELECT r.id FROM MentoringRequest r WHERE r.status = 'PENDING' AND r.createdAt < :before ORDER BY r.createdAt")
    List<UUID> findPendingIdsCreatedBefore(@Param("before") java.time.OffsetDateTime before);

    /** Chỉ dùng cho endpoint dev (/internal/dev/requests/{id}/shift) — created_at không cập nhật được qua entity. */
    @org.springframework.data.jpa.repository.Modifying
    @Query(value = "UPDATE mentoring_requests SET created_at = :createdAt WHERE id = :id", nativeQuery = true)
    int overrideCreatedAt(@Param("id") UUID id, @Param("createdAt") java.time.OffsetDateTime createdAt);

    /**
     * US-31 — yêu cầu ACCEPTED kèm mốc hoạt động gần nhất: max(lúc chấp nhận, lúc tạo phiên mới nhất của cặp, giờ bắt đầu
     * phiên chưa huỷ/hết hạn muộn nhất — phiên tương lai nên luôn "đang hoạt động") và inactivity_warned_at.
     * Cột: id (text), last_activity, inactivity_warned_at.
     */
    @Query(value = """
            SELECT CAST(r.id AS text) AS id,
                   GREATEST(COALESCE(r.responded_at, r.created_at),
                            COALESCE(MAX(s.created_at), r.created_at),
                            COALESCE(MAX(s.scheduled_at) FILTER (WHERE s.status NOT IN ('CANCELLED', 'EXPIRED')), r.created_at)) AS last_activity,
                   r.inactivity_warned_at AS warned_at
            FROM mentoring_requests r
            LEFT JOIN sessions s ON s.mentee_id = r.mentee_id AND s.mentor_id = r.mentor_id
            WHERE r.status = 'ACCEPTED'
            GROUP BY r.id
            """, nativeQuery = true)
    List<Object[]> findAcceptedActivity();

    /** US-31 — đặt lịch phiên mới xoá nhắc "không hoạt động". */
    @org.springframework.data.jpa.repository.Modifying
    @Query(value = "UPDATE mentoring_requests SET inactivity_warned_at = NULL WHERE id = :id AND inactivity_warned_at IS NOT NULL", nativeQuery = true)
    int clearInactivityWarning(@Param("id") UUID id);

    /** Chỉ dùng cho endpoint dev (e2e) — lùi mốc chấp nhận / nhắc không hoạt động. */
    @org.springframework.data.jpa.repository.Modifying
    @Query(value = "UPDATE mentoring_requests SET created_at = :at, responded_at = :at, inactivity_warned_at = :warnedAt WHERE id = :id", nativeQuery = true)
    int overrideActivity(@Param("id") UUID id, @Param("at") java.time.OffsetDateTime at, @Param("warnedAt") java.time.OffsetDateTime warnedAt);

    /** Khoá dòng yêu cầu khi phản hồi / hết hạn để hai thao tác không ghi đè nhau. */
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM MentoringRequest r WHERE r.id = :id")
    Optional<MentoringRequest> findForUpdate(@Param("id") UUID id);

    /** US-14 — advisory lock theo mentee trong transaction: kiểm tra "tối đa 3 PENDING" + tạo yêu cầu không bị chen ngang. */
    @Query(value = "SELECT pg_advisory_xact_lock(hashtext('mentee-requests:' || CAST(:menteeId AS text)))", nativeQuery = true)
    Object lockMenteeRequests(@Param("menteeId") UUID menteeId);

    /** US-35 — mentor có yêu cầu được trả lời / hết hạn kể từ {@code since} (cột: mentor_id text). */
    @Query(value = """
            SELECT DISTINCT CAST(mentor_id AS text) FROM mentoring_requests
            WHERE (responded_at IS NOT NULL AND responded_at >= :since) OR (expired_at IS NOT NULL AND expired_at >= :since)
            """, nativeQuery = true)
    List<String> findMentorsWithResponsesSince(@Param("since") java.time.OffsetDateTime since);

    /**
     * US-35 — tối đa {@code limit} yêu cầu gần nhất của mentor đã rời PENDING bằng trả lời hoặc hết hạn trong cửa sổ.
     * Cột: created_at, responded_at, status.
     */
    @Query(value = """
            SELECT created_at, responded_at, status FROM mentoring_requests
            WHERE mentor_id = :mentorId
              AND (responded_at IS NOT NULL OR status = 'EXPIRED')
              AND COALESCE(responded_at, expired_at, created_at) >= :from
            ORDER BY COALESCE(responded_at, expired_at, created_at) DESC
            LIMIT :limit
            """, nativeQuery = true)
    List<Object[]> findResponseOutcomes(@Param("mentorId") UUID mentorId, @Param("from") java.time.OffsetDateTime from,
                                        @Param("limit") int limit);
}
