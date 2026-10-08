package com.mmp.payment.repository;

import com.mmp.payment.entity.Transaction;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TransactionRepository extends JpaRepository<Transaction, UUID> {

    List<Transaction> findByPayerIdOrderByCreatedAtDesc(UUID payerId);

    List<Transaction> findByMentorIdOrderByCreatedAtDesc(UUID mentorId);

    List<Transaction> findBySessionIdOrderByCreatedAtDesc(UUID sessionId);

    List<Transaction> findByPackageIdOrderByCreatedAtDesc(UUID packageId);

    boolean existsByPackageIdAndStatusIn(UUID packageId, java.util.Collection<Transaction.Status> statuses);

    Optional<Transaction> findFirstByPackageIdAndStatusIn(UUID packageId, java.util.Collection<Transaction.Status> statuses);

    Optional<Transaction> findFirstBySessionIdAndStatus(UUID sessionId, Transaction.Status status);

    boolean existsBySessionIdAndStatus(UUID sessionId, Transaction.Status status);

    long countByPayerIdAndStatus(UUID payerId, Transaction.Status status);

    List<Transaction> findByStatusInAndSessionSyncedFalse(List<Transaction.Status> statuses);

    @Query("SELECT t FROM Transaction t WHERE (:status IS NULL OR t.status = :status) ORDER BY t.createdAt DESC")
    Page<Transaction> search(@Param("status") Transaction.Status status, Pageable pageable);

    /** Doanh thu ròng = số đã thu trừ số đã hoàn, trên các giao dịch đã thu tiền. */
    @Query("SELECT COALESCE(SUM(t.amount - t.refundedAmount), 0) FROM Transaction t WHERE t.status IN ('SUCCESS', 'PARTIALLY_REFUNDED')")
    BigDecimal netRevenue();

    long countByStatus(Transaction.Status status);
}
