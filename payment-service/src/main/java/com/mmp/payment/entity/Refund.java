package com.mmp.payment.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/** US-13 — một lần hoàn tiền (toàn phần hoặc một phần) của giao dịch; tổng các lần ≤ amount của giao dịch. */
@Entity
@Table(name = "refunds")
public class Refund {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "transaction_id", nullable = false)
    private UUID transactionId;

    @Column(nullable = false)
    private BigDecimal amount;

    private String reason;

    /** Người thực hiện (admin); null = hệ thống / service nội bộ. */
    @Column(name = "actor_id")
    private UUID actorId;

    @Column(name = "provider_reference")
    private String providerReference;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    protected Refund() {
    }

    public Refund(UUID transactionId, BigDecimal amount, String reason, UUID actorId, String providerReference) {
        this.transactionId = transactionId;
        this.amount = amount;
        this.reason = reason;
        this.actorId = actorId;
        this.providerReference = providerReference;
    }

    public UUID getId() { return id; }
    public UUID getTransactionId() { return transactionId; }
    public BigDecimal getAmount() { return amount; }
    public String getReason() { return reason; }
    public UUID getActorId() { return actorId; }
    public String getProviderReference() { return providerReference; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
