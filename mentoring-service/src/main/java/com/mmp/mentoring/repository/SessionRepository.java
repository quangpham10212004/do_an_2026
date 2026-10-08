package com.mmp.mentoring.repository;

import com.mmp.mentoring.entity.MentoringSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SessionRepository extends JpaRepository<MentoringSession, UUID> {

    List<MentoringSession> findByMenteeIdOrderByScheduledAtDesc(UUID menteeId);

    List<MentoringSession> findByMentorIdOrderByScheduledAtDesc(UUID mentorId);

    /** Các phiên đang giữ chỗ (PENDING/CONFIRMED) của 1 người trong khoảng thời gian — dùng kiểm tra trùng lịch. */
    @Query("""
            SELECT s FROM MentoringSession s
            WHERE (s.mentorId = :userId OR s.menteeId = :userId)
              AND s.status IN ('PENDING', 'CONFIRMED')
              AND s.scheduledAt < :to
              AND s.scheduledAt > :fromMinusMaxDuration
            """)
    List<MentoringSession> findActiveAround(@Param("userId") UUID userId,
                                            @Param("fromMinusMaxDuration") OffsetDateTime fromMinusMaxDuration,
                                            @Param("to") OffsetDateTime to);

    @Query("SELECT s FROM MentoringSession s WHERE s.status = 'CONFIRMED' AND s.reminderSent = false AND s.scheduledAt BETWEEN :now AND :until")
    List<MentoringSession> findNeedingReminder(@Param("now") OffsetDateTime now, @Param("until") OffsetDateTime until);

    @Query("SELECT s FROM MentoringSession s WHERE s.status = 'PENDING' AND s.createdAt < :before")
    List<MentoringSession> findExpiredPending(@Param("before") OffsetDateTime before);

    /** Buổi làm quen của các yêu cầu (mới nhất trước) — hiển thị trên trang yêu cầu. */
    List<MentoringSession> findByRequestIdInAndKindOrderByScheduledAtDesc(java.util.Collection<UUID> requestIds,
                                                                          MentoringSession.Kind kind);

    /** Buổi làm quen của 1 yêu cầu có trạng thái nằm trong {@code statuses}. */
    List<MentoringSession> findByRequestIdAndKindAndStatusIn(UUID requestId, MentoringSession.Kind kind,
                                                             java.util.Collection<MentoringSession.Status> statuses);

    long countByStatus(MentoringSession.Status status);

    /** US-12 — khoá dòng phiên (SELECT … FOR UPDATE) khi trả lời / kết luận tham dự. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM MentoringSession s WHERE s.id = :id")
    Optional<MentoringSession> findForUpdate(@Param("id") UUID id);

    /** US-12 — phiên có trạng thái {@code status} đã kết thúc trước {@code endedBefore} (giờ kết thúc = bắt đầu + thời lượng). */
    @Query(value = """
            SELECT CAST(id AS text) FROM sessions
            WHERE status = :status AND scheduled_at + make_interval(mins => duration_minutes) <= :endedBefore
            ORDER BY scheduled_at
            LIMIT 500
            """, nativeQuery = true)
    List<String> findIdsEndedBefore(@Param("status") String status, @Param("endedBefore") OffsetDateTime endedBefore);

    /** Khoá tư vấn (advisory lock) theo mentor trong transaction — tránh 2 mentee đặt trùng 1 khung giờ cùng lúc. */
    @Query(value = "SELECT pg_advisory_xact_lock(hashtext(CAST(:mentorId AS text)))", nativeQuery = true)
    Object lockMentorSchedule(@Param("mentorId") UUID mentorId);
}
