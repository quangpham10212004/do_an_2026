package com.mmp.mentoring.repository;

import com.mmp.mentoring.entity.SessionNote;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;

/** US-40 — ghi chú chung của phiên. */
public interface SessionNoteRepository extends JpaRepository<SessionNote, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT n FROM SessionNote n WHERE n.sessionId = :sessionId")
    Optional<SessionNote> findForUpdate(@Param("sessionId") UUID sessionId);

    /** Tạo dòng rỗng nếu chưa có (an toàn khi hai người lưu lần đầu cùng lúc). */
    @org.springframework.data.jpa.repository.Modifying
    @Query(value = "INSERT INTO session_notes (session_id, content, version, updated_at) VALUES (:sessionId, '', 0, now()) "
            + "ON CONFLICT (session_id) DO NOTHING", nativeQuery = true)
    int ensureExists(@Param("sessionId") UUID sessionId);
}
