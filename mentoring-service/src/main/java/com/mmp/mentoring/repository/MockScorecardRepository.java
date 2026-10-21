package com.mmp.mentoring.repository;

import com.mmp.mentoring.entity.MockScorecard;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface MockScorecardRepository extends JpaRepository<MockScorecard, UUID> {

    /** PRD-PREP-4 — lịch sử phiếu của mentee, cũ → mới (biểu đồ tiến bộ). */
    List<MockScorecard> findByMenteeIdOrderByCreatedAtAsc(UUID menteeId);

    /**
     * PRD-PREP-2 — phiên phỏng vấn thử đã kết thúc, đã diễn ra, chưa có phiếu và chưa bị đánh dấu thiếu phiếu:
     * [id, giờ kết thúc, đã nhắc 12h?, đã nhắc 36h?]. Giới hạn 500 / lượt job.
     */
    @Query(value = """
            SELECT CAST(s.id AS text), s.scheduled_at + make_interval(mins => s.duration_minutes),
                   s.scorecard_reminder_12h_at IS NOT NULL, s.scorecard_reminder_36h_at IS NOT NULL
            FROM sessions s
            WHERE s.session_type = 'MOCK_INTERVIEW'
              AND s.scorecard_missing_at IS NULL
              AND s.status IN ('AWAITING_ATTENDANCE', 'COMPLETED', 'DISPUTED')
              AND s.scheduled_at + make_interval(mins => s.duration_minutes) <= :endedBefore
              AND NOT EXISTS (SELECT 1 FROM mock_scorecards m WHERE m.session_id = s.id)
            ORDER BY s.scheduled_at
            LIMIT 500
            """, nativeQuery = true)
    List<Object[]> findAwaitingScorecard(@Param("endedBefore") OffsetDateTime endedBefore);

    /** Đánh dấu đã nhắc (trả 1 nếu lượt này giành được quyền gửi — chống gửi trùng khi nhiều instance). */
    @Modifying
    @Query(value = "UPDATE sessions SET scorecard_reminder_12h_at = :now WHERE id = :id AND scorecard_reminder_12h_at IS NULL", nativeQuery = true)
    int claimReminder12h(@Param("id") UUID id, @Param("now") OffsetDateTime now);

    @Modifying
    @Query(value = "UPDATE sessions SET scorecard_reminder_36h_at = :now WHERE id = :id AND scorecard_reminder_36h_at IS NULL", nativeQuery = true)
    int claimReminder36h(@Param("id") UUID id, @Param("now") OffsetDateTime now);

    @Modifying
    @Query(value = """
            UPDATE sessions SET scorecard_missing_at = :now
            WHERE id = :id AND scorecard_missing_at IS NULL
              AND NOT EXISTS (SELECT 1 FROM mock_scorecards m WHERE m.session_id = :id)
            """, nativeQuery = true)
    int markMissing(@Param("id") UUID id, @Param("now") OffsetDateTime now);

    /** Mentor đã nộp phiếu (muộn) → gỡ dấu "thiếu phiếu". */
    @Modifying
    @Query(value = "UPDATE sessions SET scorecard_missing_at = NULL WHERE id = :id", nativeQuery = true)
    int clearMissing(@Param("id") UUID id);

    @Query(value = "SELECT scorecard_missing_at IS NOT NULL FROM sessions WHERE id = :id", nativeQuery = true)
    boolean isMissing(@Param("id") UUID id);

    /** Số phiên phỏng vấn thử của mentor bị đánh dấu thiếu phiếu trong N ngày (hạ thứ hạng phỏng vấn thử). */
    @Query(value = "SELECT count(*) FROM sessions WHERE mentor_id = :mentorId AND scorecard_missing_at > :since", nativeQuery = true)
    long countMissingSince(@Param("mentorId") UUID mentorId, @Param("since") OffsetDateTime since);
}
