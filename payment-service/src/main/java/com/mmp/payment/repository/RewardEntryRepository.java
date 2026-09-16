package com.mmp.payment.repository;

import com.mmp.payment.entity.RewardEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface RewardEntryRepository extends JpaRepository<RewardEntry, UUID> {

    List<RewardEntry> findByUserIdOrderByCreatedAtDesc(UUID userId);

    @Query("SELECT COALESCE(SUM(r.points), 0) FROM RewardEntry r WHERE r.userId = :userId")
    long balance(@Param("userId") UUID userId);
}
