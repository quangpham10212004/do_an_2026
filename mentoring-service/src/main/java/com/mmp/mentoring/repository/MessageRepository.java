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

    /**
     * US-38 — người nhận có tin chưa đọc tạo trước {@code cutoff} (đã chờ ≥ 30 phút) và sau mốc email gần nhất của họ.
     * Cột: user_id (text), số tin, tin mới nhất (timestamp), danh sách người gửi (text, phân tách dấu phẩy).
     */
    @Query(value = """
            SELECT CAST(u.user_id AS text), COUNT(*), MAX(m.created_at), string_agg(DISTINCT CAST(m.sender_id AS text), ',')
            FROM messages m
            JOIN mentoring_requests r ON r.id = m.conversation_id
            CROSS JOIN LATERAL (SELECT CASE WHEN m.sender_id = r.mentor_id THEN r.mentee_id ELSE r.mentor_id END AS user_id) u
            LEFT JOIN conversation_reads cr ON cr.conversation_id = m.conversation_id AND cr.user_id = u.user_id
            LEFT JOIN message_email_digests d ON d.user_id = u.user_id
            WHERE m.created_at <= :cutoff
              AND m.created_at > COALESCE(cr.last_read_at, '-infinity')
              AND m.created_at > COALESCE(d.last_message_at, '-infinity')
            GROUP BY u.user_id
            LIMIT 500
            """, nativeQuery = true)
    List<Object[]> findUnreadDigests(@Param("cutoff") OffsetDateTime cutoff);

    @Modifying
    @Query(value = """
            INSERT INTO message_email_digests (user_id, last_message_at, last_sent_at) VALUES (:userId, :lastMessageAt, :now)
            ON CONFLICT (user_id) DO UPDATE SET last_message_at = GREATEST(message_email_digests.last_message_at, EXCLUDED.last_message_at),
                                                last_sent_at = EXCLUDED.last_sent_at
            """, nativeQuery = true)
    int markDigested(@Param("userId") UUID userId, @Param("lastMessageAt") OffsetDateTime lastMessageAt,
                     @Param("now") OffsetDateTime now);

    /** Chỉ dùng cho endpoint dev (e2e) — lùi thời điểm gửi các tin của một cuộc trò chuyện. */
    @Modifying
    @Query(value = "UPDATE messages SET created_at = created_at - make_interval(mins => :minutes) WHERE conversation_id = :conversationId",
            nativeQuery = true)
    int shiftBack(@Param("conversationId") UUID conversationId, @Param("minutes") int minutes);
}
