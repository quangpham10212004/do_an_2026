package com.mmp.mentoring.repository;

import com.mmp.mentoring.entity.Notification;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface NotificationRepository extends JpaRepository<Notification, UUID> {

    @Query("""
            SELECT n FROM Notification n
            WHERE n.recipientId = :userId OR (n.recipientId IS NULL AND n.recipientRole = :role)
            ORDER BY n.createdAt DESC
            """)
    List<Notification> findForUser(@Param("userId") UUID userId, @Param("role") String role, Pageable pageable);

    @Query("""
            SELECT COUNT(n) FROM Notification n
            WHERE n.read = false AND (n.recipientId = :userId OR (n.recipientId IS NULL AND n.recipientRole = :role))
            """)
    long countUnread(@Param("userId") UUID userId, @Param("role") String role);

    @Modifying
    @Query("""
            UPDATE Notification n SET n.read = true
            WHERE n.read = false AND (n.recipientId = :userId OR (n.recipientId IS NULL AND n.recipientRole = :role))
            """)
    int markAllRead(@Param("userId") UUID userId, @Param("role") String role);
}
