package com.mmp.payment.entity;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * US-13 — Idempotency-Key của POST /api/payment/charge. Cùng (userId, idemKey) trong thời hạn
 * {@code app.payment.idempotency-ttl} (24 giờ) trả về giao dịch đã tạo lần đầu thay vì charge lần hai.
 * transactionId null = lần gọi đầu đang xử lý (chưa tạo giao dịch).
 */
@Entity
@Table(name = "charge_idempotency_keys")
public class ChargeIdempotencyKey {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "idem_key", nullable = false)
    private String idemKey;

    @Column(name = "session_id", nullable = false)
    private UUID sessionId;

    @Column(name = "transaction_id")
    private UUID transactionId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    protected ChargeIdempotencyKey() {
    }

    public ChargeIdempotencyKey(UUID userId, String idemKey, UUID sessionId) {
        this.userId = userId;
        this.idemKey = idemKey;
        this.sessionId = sessionId;
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public String getIdemKey() { return idemKey; }
    public UUID getSessionId() { return sessionId; }
    public UUID getTransactionId() { return transactionId; }
    public void setTransactionId(UUID transactionId) { this.transactionId = transactionId; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }
}
