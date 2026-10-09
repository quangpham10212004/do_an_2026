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

    /** US-34 — phiên CONFIRMED bắt đầu trong (now, until] còn thiếu ít nhất một lần nhắc (24 giờ / 1 giờ). */
    @Query("""
            SELECT s FROM MentoringSession s
            WHERE s.status = 'CONFIRMED' AND s.scheduledAt > :now AND s.scheduledAt <= :until
              AND (s.reminder24hSentAt IS NULL OR s.reminder1hSentAt IS NULL)
            ORDER BY s.scheduledAt
            """)
    List<MentoringSession> findNeedingReminder(@Param("now") OffsetDateTime now, @Param("until") OffsetDateTime until);

    /**
     * US-34 — đánh dấu đã nhắc có điều kiện (chỉ khi chưa đánh dấu và phiên còn CONFIRMED): trả 1 cho đúng một lượt chạy
     * nên không nhắc trùng kể cả khi job chạy song song. {@code skip24h} = đánh dấu luôn mốc 24 giờ khi gửi nhắc 1 giờ.
     */
    @org.springframework.data.jpa.repository.Modifying
    @Query(value = """
            UPDATE sessions SET reminder_24h_sent_at = :at
            WHERE id = :id AND status = 'CONFIRMED' AND reminder_24h_sent_at IS NULL AND reminder_1h_sent_at IS NULL
            """, nativeQuery = true)
    int claimReminder24h(@Param("id") UUID id, @Param("at") OffsetDateTime at);

    @org.springframework.data.jpa.repository.Modifying
    @Query(value = """
            UPDATE sessions SET reminder_1h_sent_at = :at, reminder_24h_sent_at = COALESCE(reminder_24h_sent_at, :at)
            WHERE id = :id AND status = 'CONFIRMED' AND reminder_1h_sent_at IS NULL
            """, nativeQuery = true)
    int claimReminder1h(@Param("id") UUID id, @Param("at") OffsetDateTime at);

    @Query("SELECT s FROM MentoringSession s WHERE s.status = 'PENDING' AND s.createdAt < :before")
    List<MentoringSession> findExpiredPending(@Param("before") OffsetDateTime before);

    long countByStatus(MentoringSession.Status status);

    /** US-27 — phiên sắp tới đang giữ chỗ (PENDING/CONFIRMED, chưa bắt đầu) của mentor. */
    @Query("SELECT s FROM MentoringSession s WHERE s.mentorId = :mentorId AND s.status IN ('PENDING', 'CONFIRMED') AND s.scheduledAt > :now ORDER BY s.scheduledAt")
    List<MentoringSession> findUpcomingHoldingByMentor(@Param("mentorId") UUID mentorId, @Param("now") OffsetDateTime now);

    /** US-31 — phiên sắp tới đang giữ chỗ của 1 cặp mentee–mentor. */
    @Query("""
            SELECT s FROM MentoringSession s
            WHERE s.menteeId = :menteeId AND s.mentorId = :mentorId AND s.status IN ('PENDING', 'CONFIRMED') AND s.scheduledAt > :now
            ORDER BY s.scheduledAt
            """)
    List<MentoringSession> findUpcomingHoldingByPair(@Param("menteeId") UUID menteeId, @Param("mentorId") UUID mentorId,
                                                    @Param("now") OffsetDateTime now);

    /**
     * US-33 (PRD-MSG-3) — cặp mentee–mentor đã có phiên trả phí được xác nhận (đã thanh toán: CONFIRMED hoặc đã diễn ra).
     * Khi đó SĐT/email trong tin nhắn không còn bị che.
     */
    @Query("""
            SELECT COUNT(s) > 0 FROM MentoringSession s
            WHERE s.menteeId = :menteeId AND s.mentorId = :mentorId AND s.price > 0
              AND s.status IN ('CONFIRMED', 'AWAITING_ATTENDANCE', 'COMPLETED', 'NO_SHOW_MENTEE', 'NO_SHOW_MENTOR', 'DISPUTED')
            """)
    boolean existsPaidConfirmedForPair(@Param("menteeId") UUID menteeId, @Param("mentorId") UUID mentorId);

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
