package com.mmp.payment.repository;

import com.mmp.payment.entity.Payout;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** US-42 — yêu cầu rút tiền. */
public interface PayoutRepository extends JpaRepository<Payout, UUID> {

    List<Payout> findByMentorIdOrderByRequestedAtDesc(UUID mentorId);

    Optional<Payout> findFirstByMentorIdAndStatus(UUID mentorId, Payout.Status status);

    List<Payout> findByStatusOrderByRequestedAtAsc(Payout.Status status);

    List<Payout> findAllByOrderByRequestedAtDesc();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM Payout p WHERE p.id = :id")
    Optional<Payout> findForUpdate(@Param("id") UUID id);

    /** Khoá advisory theo mentor: kiểm tra "1 yêu cầu đang mở" + số dư + tạo yêu cầu không bị chen ngang. */
    @Query(value = "SELECT pg_advisory_xact_lock(hashtext('payout:' || CAST(:mentorId AS text)))", nativeQuery = true)
    Object lockMentor(@Param("mentorId") UUID mentorId);
}
