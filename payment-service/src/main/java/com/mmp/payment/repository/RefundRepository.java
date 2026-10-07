package com.mmp.payment.repository;

import com.mmp.payment.entity.Refund;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface RefundRepository extends JpaRepository<Refund, UUID> {

    List<Refund> findByTransactionIdInOrderByCreatedAtAsc(Collection<UUID> transactionIds);

    @Query("SELECT COALESCE(SUM(r.amount), 0) FROM Refund r WHERE r.transactionId = :transactionId")
    BigDecimal sumByTransactionId(@Param("transactionId") UUID transactionId);
}
