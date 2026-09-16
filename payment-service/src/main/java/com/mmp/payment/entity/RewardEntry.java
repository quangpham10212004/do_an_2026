package com.mmp.payment.entity;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "reward_ledger")
public class RewardEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false)
    private int points;

    @Column(nullable = false)
    private String reason;

    @Column(name = "referral_id")
    private UUID referralId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    protected RewardEntry() {
    }

    public RewardEntry(UUID userId, int points, String reason, UUID referralId) {
        this.userId = userId;
        this.points = points;
        this.reason = reason;
        this.referralId = referralId;
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public int getPoints() { return points; }
    public String getReason() { return reason; }
    public UUID getReferralId() { return referralId; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
