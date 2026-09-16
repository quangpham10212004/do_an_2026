package com.mmp.mentoring.repository;

import com.mmp.mentoring.entity.MentoringSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;
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

    long countByStatus(MentoringSession.Status status);

    /** Khoá tư vấn (advisory lock) theo mentor trong transaction — tránh 2 mentee đặt trùng 1 khung giờ cùng lúc. */
    @Query(value = "SELECT pg_advisory_xact_lock(hashtext(CAST(:mentorId AS text)))", nativeQuery = true)
    Object lockMentorSchedule(@Param("mentorId") UUID mentorId);
}
