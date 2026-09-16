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

    Optional<Transaction> findFirstBySessionIdAndStatus(UUID sessionId, Transaction.Status status);

    boolean existsBySessionIdAndStatus(UUID sessionId, Transaction.Status status);

    long countByPayerIdAndStatus(UUID payerId, Transaction.Status status);

    List<Transaction> findByStatusInAndSessionSyncedFalse(List<Transaction.Status> statuses);

    @Query("SELECT t FROM Transaction t WHERE (:status IS NULL OR t.status = :status) ORDER BY t.createdAt DESC")
    Page<Transaction> search(@Param("status") Transaction.Status status, Pageable pageable);

    @Query("SELECT COALESCE(SUM(t.amount), 0) FROM Transaction t WHERE t.status = :status")
    BigDecimal sumByStatus(@Param("status") Transaction.Status status);

    long countByStatus(Transaction.Status status);
}
