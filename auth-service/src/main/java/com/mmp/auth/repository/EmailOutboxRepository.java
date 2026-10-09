package com.mmp.auth.repository;

import com.mmp.auth.entity.EmailOutbox;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** US-38 — hàng đợi email thông báo. */
public interface EmailOutboxRepository extends JpaRepository<EmailOutbox, UUID> {

    boolean existsByDedupeKey(String dedupeKey);

    /** Email tới hạn gửi (FOR UPDATE SKIP LOCKED — nhiều instance không gửi trùng). */
    @Query(value = """
            SELECT * FROM email_outbox WHERE status = 'PENDING' AND send_after <= :now
            ORDER BY send_after LIMIT :limit FOR UPDATE SKIP LOCKED
            """, nativeQuery = true)
    List<EmailOutbox> lockDue(@Param("now") OffsetDateTime now, @Param("limit") int limit);

    List<EmailOutbox> findTop50ByUserIdOrderByCreatedAtDesc(UUID userId);
}
