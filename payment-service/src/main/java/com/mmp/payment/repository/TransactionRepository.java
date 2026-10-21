package com.mmp.payment.repository;

import com.mmp.payment.entity.Transaction;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TransactionRepository extends JpaRepository<Transaction, UUID> {

    /** Giao dịch học phí của người trả (không gồm nạp ví — xem {@link #findTopups}). */
    @Query("SELECT t FROM Transaction t WHERE t.payerId = :payerId AND t.kind = 'SESSION' ORDER BY t.createdAt DESC")
    List<Transaction> findByPayerIdOrderByCreatedAtDesc(@Param("payerId") UUID payerId);

    @Query("SELECT t FROM Transaction t WHERE t.payerId = :payerId AND t.kind = 'TOPUP' ORDER BY t.createdAt DESC")
    List<Transaction> findTopups(@Param("payerId") UUID payerId);

    /** Các lần nạp thành công (còn hoàn được: SUCCESS / PARTIALLY_REFUNDED) từ mốc `since`, mới nhất trước. */
    @Query("SELECT t FROM Transaction t WHERE t.payerId = :payerId AND t.kind = 'TOPUP' AND t.status IN ('SUCCESS', 'PARTIALLY_REFUNDED') "
            + "AND t.createdAt >= :since ORDER BY t.createdAt DESC")
    List<Transaction> findRefundableTopupsSince(@Param("payerId") UUID payerId, @Param("since") OffsetDateTime since);

    @Query("SELECT MAX(t.createdAt) FROM Transaction t WHERE t.payerId = :payerId AND t.kind = 'TOPUP' AND t.status IN ('SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED')")
    OffsetDateTime latestTopupAt(@Param("payerId") UUID payerId);

    @Query("SELECT t FROM Transaction t WHERE t.mentorId = :mentorId AND t.kind = 'SESSION' ORDER BY t.createdAt DESC")
    List<Transaction> findByMentorIdOrderByCreatedAtDesc(@Param("mentorId") UUID mentorId);

    List<Transaction> findBySessionIdOrderByCreatedAtDesc(UUID sessionId);

    Optional<Transaction> findFirstBySessionIdAndStatus(UUID sessionId, Transaction.Status status);

    boolean existsBySessionIdAndStatus(UUID sessionId, Transaction.Status status);

    boolean existsBySessionIdAndStatusIn(UUID sessionId, Collection<Transaction.Status> statuses);

    /** US-13 — khoá các giao dịch của phiên (SELECT … FOR UPDATE) trước khi hoàn tiền / tạm giữ. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT t FROM Transaction t WHERE t.sessionId = :sessionId AND t.status IN :statuses ORDER BY t.createdAt DESC")
    List<Transaction> lockBySessionIdAndStatusIn(@Param("sessionId") UUID sessionId,
                                                 @Param("statuses") Collection<Transaction.Status> statuses);

    /** US-25 — khoá 1 giao dịch theo id (giải phóng thu nhập). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT t FROM Transaction t WHERE t.id = :id")
    Optional<Transaction> lockById(@Param("id") UUID id);

    /** US-25 — giao dịch "đã từng thu tiền" của mentor (SUCCESS / ON_HOLD / PARTIALLY_REFUNDED / REFUNDED). */
    List<Transaction> findByMentorIdAndStatusInOrderByCreatedAtDesc(UUID mentorId, Collection<Transaction.Status> statuses);

    @Query("SELECT COALESCE(SUM(t.fee), 0) FROM Transaction t WHERE t.kind = 'SESSION' AND t.status IN :statuses")
    BigDecimal sumFeeByStatusIn(@Param("statuses") Collection<Transaction.Status> statuses);

    /** Số giao dịch học phí (không gồm nạp ví) của người trả ở trạng thái `status`. */
    @Query("SELECT COUNT(t) FROM Transaction t WHERE t.payerId = :payerId AND t.kind = 'SESSION' AND t.status = :status")
    long countByPayerIdAndStatus(@Param("payerId") UUID payerId, @Param("status") Transaction.Status status);

    List<Transaction> findByStatusInAndSessionSyncedFalse(List<Transaction.Status> statuses);

    @Query("SELECT t FROM Transaction t WHERE t.kind = 'SESSION' AND (:status IS NULL OR t.status = :status) ORDER BY t.createdAt DESC")
    Page<Transaction> search(@Param("status") Transaction.Status status, Pageable pageable);

    @Query("SELECT COALESCE(SUM(t.amount), 0) FROM Transaction t WHERE t.kind = 'SESSION' AND t.status = :status")
    BigDecimal sumByStatus(@Param("status") Transaction.Status status);

    @Query("SELECT COUNT(t) FROM Transaction t WHERE t.kind = 'SESSION' AND t.status = :status")
    long countByStatus(@Param("status") Transaction.Status status);

    /** US-56 — vnp_TxnRef → giao dịch. */
    Optional<Transaction> findByProviderTxnRef(String providerTxnRef);

    /** US-56 — giao dịch VNPay còn PENDING quá lâu → hỏi VNPay (querydr). */
    List<Transaction> findByProviderAndStatusAndCreatedAtBefore(String provider, Transaction.Status status, OffsetDateTime before);
}
