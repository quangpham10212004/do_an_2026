package com.mmp.payment.repository;

import com.mmp.payment.entity.EarningSchedule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface EarningScheduleRepository extends JpaRepository<EarningSchedule, UUID> {

    /** Lịch tới hạn chưa xử lý (job giải phóng). */
    @Query("SELECT e.transactionId FROM EarningSchedule e WHERE e.settledAt IS NULL AND e.releaseAt <= :now ORDER BY e.releaseAt")
    List<UUID> findDueTransactionIds(@Param("now") OffsetDateTime now);

    List<EarningSchedule> findByTransactionIdIn(Collection<UUID> transactionIds);

    List<EarningSchedule> findBySessionId(UUID sessionId);
}
