package com.mmp.mentoring.entity;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

/** Lời gọi payment-service cần đảm bảo tới nơi — ghi cùng transaction, PaymentOutboxJob gửi lại. */
@Entity
@Table(name = "payment_outbox")
public class PaymentOutbox {

    /**
     * REWARD (US-01), REFUND (US-12 NO_SHOW_MENTOR / CANCELLED_ON_CALL, US-32 kết luận tranh chấp), HOLD (US-12 DISPUTED,
     * US-32 mở tranh chấp), FINAL_STATE (US-25 trạng thái cuối → đồng hồ giải phóng thu nhập), RELEASE (US-32 giải phóng
     * giao dịch tạm giữ).
     */
    public enum Kind { REWARD, REFUND, HOLD, FINAL_STATE, RELEASE }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "session_id")
    private UUID sessionId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Kind kind;

    @Column(nullable = false)
    private String payload;

    @Column(nullable = false)
    private int attempts;

    @Column(name = "last_error")
    private String lastError;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(name = "sent_at")
    private OffsetDateTime sentAt;

    protected PaymentOutbox() {
    }

    public PaymentOutbox(UUID sessionId, Kind kind, String payload) {
        this.sessionId = sessionId;
        this.kind = kind;
        this.payload = payload;
    }

    /** createdAt tường minh — các bản ghi của cùng 1 phiên được gửi theo đúng thứ tự xếp hàng. */
    public PaymentOutbox(UUID sessionId, Kind kind, String payload, OffsetDateTime createdAt) {
        this(sessionId, kind, payload);
        this.createdAt = createdAt;
    }

    public UUID getId() { return id; }
    public UUID getSessionId() { return sessionId; }
    public Kind getKind() { return kind; }
    public String getPayload() { return payload; }
    public int getAttempts() { return attempts; }
    public String getLastError() { return lastError; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getSentAt() { return sentAt; }

    public void markSent() {
        this.sentAt = OffsetDateTime.now();
    }

    /** Lỗi vĩnh viễn (4xx từ payment-service): không gửi lại, giữ lý do để tra cứu. */
    public void markAbandoned(String error) {
        markFailed(error);
        this.sentAt = OffsetDateTime.now();
    }

    public void markFailed(String error) {
        this.attempts++;
        this.lastError = error == null ? null : error.substring(0, Math.min(500, error.length()));
    }
}
