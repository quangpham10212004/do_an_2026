package com.mmp.payment.repository;

import com.mmp.payment.entity.LedgerEntry;
import org.springframework.data.repository.Repository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

/**
 * US-25 — sổ thu nhập append-only: cố ý kế thừa {@link Repository} (không phải JpaRepository) nên không có delete;
 * chỉ thêm dòng và đọc.
 */
public interface LedgerRepository extends Repository<LedgerEntry, UUID> {

    LedgerEntry save(LedgerEntry entry);

    List<LedgerEntry> findByTransactionIdOrderByCreatedAtAsc(UUID transactionId);

    List<LedgerEntry> findByTransactionIdInOrderByCreatedAtAsc(Collection<UUID> transactionIds);

    List<LedgerEntry> findByMentorIdOrderByCreatedAtAsc(UUID mentorId);
}
