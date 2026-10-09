package com.mmp.mentoring.repository;

import com.mmp.mentoring.entity.Message;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

/** US-33 — tin nhắn + mốc đã đọc (bảng conversation_reads, chỉ truy cập bằng native query). */
public interface MessageRepository extends JpaRepository<Message, UUID> {

    /** Tin mới nhất trước — trang đầu của luồng (đảo lại khi trả về). */
    List<Message> findByConversationIdOrderByCreatedAtDesc(UUID conversationId, Pageable pageable);

    /** Polling: chỉ tin sau mốc {@code after}. */
    List<Message> findByConversationIdAndCreatedAtAfterOrderByCreatedAtAsc(UUID conversationId, OffsetDateTime after);

    long countByConversationIdAndSenderId(UUID conversationId, UUID senderId);

    /**
     * Thống kê theo cuộc trò chuyện cho 1 người: id, lúc có tin cuối, nội dung tin cuối, người gửi tin cuối, số tin chưa đọc.
     * Cột: conversation_id (text), last_at, last_body, last_sender (text), unread (bigint).
     */
    @Query(value = """
            SELECT CAST(m.conversation_id AS text) AS conversation_id,
                   MAX(m.created_at) AS last_at,
                   (ARRAY_AGG(m.body ORDER BY m.created_at DESC))[1] AS last_body,
                   CAST((ARRAY_AGG(m.sender_id ORDER BY m.created_at DESC))[1] AS text) AS last_sender,
                   COUNT(*) FILTER (WHERE m.sender_id <> :userId AND m.created_at > COALESCE(cr.last_read_at, '-infinity')) AS unread
            FROM messages m
            LEFT JOIN conversation_reads cr ON cr.conversation_id = m.conversation_id AND cr.user_id = :userId
            WHERE m.conversation_id IN (:ids)
            GROUP BY m.conversation_id, cr.last_read_at
            """, nativeQuery = true)
    List<Object[]> conversationStats(@Param("userId") UUID userId, @Param("ids") Collection<UUID> ids);

    /** Tổng số tin chưa đọc của 1 người trên mọi cuộc trò chuyện mà họ là mentor hoặc mentee (badge trên thanh điều hướng). */
    @Query(value = """
            SELECT COUNT(*) FROM messages m
            JOIN mentoring_requests r ON r.id = m.conversation_id
            LEFT JOIN conversation_reads cr ON cr.conversation_id = m.conversation_id AND cr.user_id = :userId
            WHERE (r.mentor_id = :userId OR r.mentee_id = :userId)
              AND m.sender_id <> :userId
              AND m.created_at > COALESCE(cr.last_read_at, '-infinity')
            """, nativeQuery = true)
    long countUnread(@Param("userId") UUID userId);

    /** Số tin chưa đọc của 1 người trong 1 cuộc trò chuyện. */
    @Query(value = """
            SELECT COUNT(*) FROM messages m
            LEFT JOIN conversation_reads cr ON cr.conversation_id = m.conversation_id AND cr.user_id = :userId
            WHERE m.conversation_id = :conversationId AND m.sender_id <> :userId
              AND m.created_at > COALESCE(cr.last_read_at, '-infinity')
            """, nativeQuery = true)
    long countUnreadIn(@Param("conversationId") UUID conversationId, @Param("userId") UUID userId);

    /** Đánh dấu đã đọc tới {@code at} (không lùi mốc). */
    @Modifying
    @Query(value = """
            INSERT INTO conversation_reads (conversation_id, user_id, last_read_at) VALUES (:conversationId, :userId, :at)
            ON CONFLICT (conversation_id, user_id)
            DO UPDATE SET last_read_at = GREATEST(conversation_reads.last_read_at, EXCLUDED.last_read_at)
            """, nativeQuery = true)
    int markRead(@Param("conversationId") UUID conversationId, @Param("userId") UUID userId, @Param("at") OffsetDateTime at);

    /** Khoá advisory theo cuộc trò chuyện: kiểm tra "tối đa 3 tin trước khi chấp nhận" + ghi tin không bị chen ngang. */
    @Query(value = "SELECT pg_advisory_xact_lock(hashtext('conversation:' || CAST(:conversationId AS text)))", nativeQuery = true)
    Object lockConversation(@Param("conversationId") UUID conversationId);
}
