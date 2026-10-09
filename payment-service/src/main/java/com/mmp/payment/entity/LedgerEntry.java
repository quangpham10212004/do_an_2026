package com.mmp.payment.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * US-25 — một dòng sổ thu nhập mentor (bảng mentor_ledger, append-only: không có setter, code không UPDATE/DELETE và
 * trigger CSDL chặn mọi UPDATE/DELETE). Số tiền luôn dương; kiểu dòng quyết định chiều cộng/trừ (xem EarningRules).
 */
@Entity
@Table(name = "mentor_ledger")
public class LedgerEntry {

    public enum Type { EARNING_PENDING, EARNING_AVAILABLE, REVERSAL, PAYOUT }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "mentor_id", nullable = false, updatable = false)
    private UUID mentorId;

    @Column(name = "session_id", nullable = false, updatable = false)
    private UUID sessionId;

    @Column(name = "transaction_id", nullable = false, updatable = false)
    private UUID transactionId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private Type type;

    @Column(nullable = false, updatable = false)
    private BigDecimal amount;

    @Column(name = "refund_id", updatable = false)
    private UUID refundId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    protected LedgerEntry() {
    }

    public LedgerEntry(Transaction t, Type type, BigDecimal amount, UUID refundId) {
        this.mentorId = t.getMentorId();
        this.sessionId = t.getSessionId();
        this.transactionId = t.getId();
        this.type = type;
        this.amount = amount;
        this.refundId = refundId;
    }

    public UUID getId() { return id; }
    public UUID getMentorId() { return mentorId; }
    public UUID getSessionId() { return sessionId; }
    public UUID getTransactionId() { return transactionId; }
    public Type getType() { return type; }
    public BigDecimal getAmount() { return amount; }
    public UUID getRefundId() { return refundId; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
