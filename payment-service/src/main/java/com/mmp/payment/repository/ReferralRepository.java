package com.mmp.payment.repository;

import com.mmp.payment.entity.Referral;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ReferralRepository extends JpaRepository<Referral, UUID> {

    Optional<Referral> findByRefereeId(UUID refereeId);

    List<Referral> findByReferrerIdOrderByCreatedAtDesc(UUID referrerId);

    long countByReferrerIdAndStatusAndQualifiedAtAfter(UUID referrerId, Referral.Status status, OffsetDateTime after);

    List<Referral> findAllByOrderByCreatedAtDesc();
}
