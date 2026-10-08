package com.mmp.mentoring.repository;

import com.mmp.mentoring.entity.SessionPackage;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SessionPackageRepository extends JpaRepository<SessionPackage, UUID> {

    List<SessionPackage> findByMenteeIdOrderByCreatedAtDesc(UUID menteeId);

    List<SessionPackage> findByMentorIdOrderByCreatedAtDesc(UUID mentorId);

    List<SessionPackage> findByMenteeIdAndMentorIdAndStatusIn(UUID menteeId, UUID mentorId, java.util.Collection<SessionPackage.Status> statuses);

    /** Khoá hàng khi trừ/hoàn buổi để hai request song song không dùng quá số buổi còn lại. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM SessionPackage p WHERE p.id = :id")
    Optional<SessionPackage> findByIdForUpdate(@Param("id") UUID id);

    @Query("SELECT p FROM SessionPackage p WHERE p.status = 'ACTIVE' AND p.expiresAt < :now")
    List<SessionPackage> findExpired(@Param("now") OffsetDateTime now);

    @Query("SELECT p FROM SessionPackage p WHERE p.status = 'PENDING_PAYMENT' AND p.createdAt < :before")
    List<SessionPackage> findExpiredPendingPayment(@Param("before") OffsetDateTime before);

    List<SessionPackage> findByRefundPendingTrue();
}
