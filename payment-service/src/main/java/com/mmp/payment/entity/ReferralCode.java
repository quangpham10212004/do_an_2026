package com.mmp.payment.entity;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "referral_codes")
public class ReferralCode {

    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Column(nullable = false, unique = true)
    private String code;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    protected ReferralCode() {
    }

    public ReferralCode(UUID userId, String code) {
        this.userId = userId;
        this.code = code;
    }

    public UUID getUserId() { return userId; }
    public String getCode() { return code; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
