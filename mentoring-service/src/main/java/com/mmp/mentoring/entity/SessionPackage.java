package com.mmp.mentoring.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Gói buổi (combo). Vòng đời: PENDING_PAYMENT → ACTIVE → EXHAUSTED | EXPIRED | CANCELLED.
 * EXPIRED/CANCELLED mà còn buổi chưa dùng thì ghi {@code refundDue} + {@code refundPending}; job hoàn tiền
 * gọi payment-service và thử lại cho tới khi thành công.
 */
@Entity
@Table(name = "session_packages")
public class SessionPackage {

    public enum Status { PENDING_PAYMENT, ACTIVE, EXHAUSTED, EXPIRED, CANCELLED }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "mentee_id", nullable = false)
    private UUID menteeId;

    @Column(name = "mentor_id", nullable = false)
    private UUID mentorId;

    @Column(name = "request_id")
    private UUID requestId;

    @Column(name = "sessions_total", nullable = false)
    private int sessionsTotal;

    @Column(name = "sessions_remaining", nullable = false)
    private int sessionsRemaining;

    @Column(name = "duration_minutes", nullable = false)
    private int durationMinutes;

    @Column(name = "discount_percent", nullable = false)
    private int discountPercent;

    @Column(name = "unit_price", nullable = false)
    private BigDecimal unitPrice;

    @Column(name = "total_price", nullable = false)
    private BigDecimal totalPrice;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.PENDING_PAYMENT;

    @Column(name = "expires_at")
    private OffsetDateTime expiresAt;

    @Column(name = "refund_due", nullable = false)
    private BigDecimal refundDue = BigDecimal.ZERO;

    @Column(name = "refund_pending", nullable = false)
    private boolean refundPending;

    @Column(name = "refunded_amount", nullable = false)
    private BigDecimal refundedAmount = BigDecimal.ZERO;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected SessionPackage() {
    }

    public SessionPackage(UUID menteeId, UUID mentorId, UUID requestId, int sessionsTotal, int durationMinutes,
                          int discountPercent, BigDecimal unitPrice, BigDecimal totalPrice) {
        this.menteeId = menteeId;
        this.mentorId = mentorId;
        this.requestId = requestId;
        this.sessionsTotal = sessionsTotal;
        this.sessionsRemaining = sessionsTotal;
        this.durationMinutes = durationMinutes;
        this.discountPercent = discountPercent;
        this.unitPrice = unitPrice;
        this.totalPrice = totalPrice;
    }

    @PrePersist
    void onCreate() {
        createdAt = OffsetDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = OffsetDateTime.now();
    }

    public UUID getId() { return id; }
    public UUID getMenteeId() { return menteeId; }
    public UUID getMentorId() { return mentorId; }
    public UUID getRequestId() { return requestId; }
    public int getSessionsTotal() { return sessionsTotal; }
    public int getSessionsRemaining() { return sessionsRemaining; }
    public void setSessionsRemaining(int sessionsRemaining) { this.sessionsRemaining = sessionsRemaining; }
    public int getDurationMinutes() { return durationMinutes; }
    public int getDiscountPercent() { return discountPercent; }
    public BigDecimal getUnitPrice() { return unitPrice; }
    public BigDecimal getTotalPrice() { return totalPrice; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public OffsetDateTime getExpiresAt() { return expiresAt; }
    public void setExpiresAt(OffsetDateTime expiresAt) { this.expiresAt = expiresAt; }
    public BigDecimal getRefundDue() { return refundDue; }
    public void setRefundDue(BigDecimal refundDue) { this.refundDue = refundDue; }
    public boolean isRefundPending() { return refundPending; }
    public void setRefundPending(boolean refundPending) { this.refundPending = refundPending; }
    public BigDecimal getRefundedAmount() { return refundedAmount; }
    public void setRefundedAmount(BigDecimal refundedAmount) { this.refundedAmount = refundedAmount; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }

    /** Gói còn dùng được để đặt phiên tại thời điểm {@code now}. */
    public boolean isUsable(OffsetDateTime now) {
        return status == Status.ACTIVE && sessionsRemaining > 0 && (expiresAt == null || expiresAt.isAfter(now));
    }
}
