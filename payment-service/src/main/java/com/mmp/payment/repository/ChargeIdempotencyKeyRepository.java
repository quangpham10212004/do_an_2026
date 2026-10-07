package com.mmp.payment.repository;

import com.mmp.payment.entity.ChargeIdempotencyKey;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

public interface ChargeIdempotencyKeyRepository extends JpaRepository<ChargeIdempotencyKey, UUID> {

    Optional<ChargeIdempotencyKey> findByUserIdAndIdemKey(UUID userId, String idemKey);

    @Modifying
    @Query("DELETE FROM ChargeIdempotencyKey k WHERE k.createdAt < :before")
    int deleteOlderThan(@Param("before") OffsetDateTime before);
}
