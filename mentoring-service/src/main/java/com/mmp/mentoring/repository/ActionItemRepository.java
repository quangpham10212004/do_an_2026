package com.mmp.mentoring.repository;

import com.mmp.mentoring.entity.ActionItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** US-40 — action item của cặp mentor–mentee. */
public interface ActionItemRepository extends JpaRepository<ActionItem, UUID> {

    /**
     * Trang phiên: việc tạo trong phiên này + việc còn mở của cặp tạo ở các phiên bắt đầu sớm hơn (mang sang).
     * Sắp xếp: chưa xong trước, rồi theo hạn và lúc tạo.
     */
    @Query("""
            SELECT a FROM ActionItem a
            WHERE a.sessionId = :sessionId
               OR (a.menteeId = :menteeId AND a.mentorId = :mentorId AND a.done = false
                   AND a.sessionId IN (SELECT s.id FROM MentoringSession s
                                       WHERE s.menteeId = :menteeId AND s.mentorId = :mentorId AND s.scheduledAt < :before))
            ORDER BY a.done, a.dueDate NULLS LAST, a.createdAt
            """)
    List<ActionItem> findForSession(@Param("sessionId") UUID sessionId, @Param("menteeId") UUID menteeId,
                                    @Param("mentorId") UUID mentorId, @Param("before") OffsetDateTime before);

    /** Không gian mentoring: toàn bộ việc còn mở của cặp. */
    List<ActionItem> findByMenteeIdAndMentorIdAndDoneFalseOrderByDueDateAscCreatedAtAsc(UUID menteeId, UUID mentorId);

    long countBySessionId(UUID sessionId);
}
