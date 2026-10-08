package com.mmp.payment.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "transactions")
public class Transaction {

    /**
     * FR-6.3 / US-13 — vòng đời: PENDING → SUCCESS | FAILED; SUCCESS → PARTIALLY_REFUNDED → REFUNDED;
     * SUCCESS → REFUNDED; SUCCESS → ON_HOLD → SUCCESS (US-12 tranh chấp: chưa trả mentor, chưa hoàn mentee).
     */
    public enum Status { PENDING, SUCCESS, FAILED, REFUNDED, PARTIALLY_REFUNDED, ON_HOLD }

    /** "Đã thu tiền" — tối đa 1 giao dịch như vậy cho mỗi phiên (unique index uq_transactions_session_paid). */
    public static final List<Status> PAID_STATUSES = List.of(Status.SUCCESS, Status.ON_HOLD, Status.PARTIALLY_REFUNDED);

    /** Còn hoàn tiền được (ON_HOLD phải release trước). */
    public static final List<Status> REFUNDABLE_STATUSES = List.of(Status.SUCCESS, Status.PARTIALLY_REFUNDED);

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Phiên được thanh toán; null nếu giao dịch này thanh toán một gói buổi (package_id). */
    @Column(name = "session_id")
    private UUID sessionId;

    /** Gói buổi được thanh toán; null nếu là phiên lẻ. Đúng một trong hai (session_id, package_id) có giá trị. */
    @Column(name = "package_id")
    private UUID packageId;

    @Column(name = "payer_id", nullable = false)
    private UUID payerId;

    @Column(name = "mentor_id", nullable = false)
    private UUID mentorId;

    @Column(nullable = false)
    private BigDecimal amount;

    /** US-13 — tỉ lệ phí nền tảng chốt lúc charge (vd. 0.1500). */
    @Column(name = "fee_rate", nullable = false)
    private BigDecimal feeRate = BigDecimal.ZERO;

    /** US-13 — phí nền tảng (VND) chốt lúc charge; đổi cấu hình về sau không làm đổi giá trị này. */
    @Column(nullable = false)
    private BigDecimal fee = BigDecimal.ZERO;

    /** US-13 — phần mentor nhận = amount − fee, chốt lúc charge. */
    @Column(name = "mentor_earning", nullable = false)
    private BigDecimal mentorEarning = BigDecimal.ZERO;

    @Column(name = "hold_reason")
    private String holdReason;

    @Column(name = "held_at")
    private OffsetDateTime heldAt;

    @Column(nullable = false)
    private String currency = "VND";

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.PENDING;

    @Column(nullable = false)
    private String provider = "SANDBOX";

    @Column(name = "provider_reference")
    private String providerReference;

    @Column(name = "failure_reason")
    private String failureReason;

    @Column(name = "session_synced", nullable = false)
    private boolean sessionSynced;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

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
    public UUID getSessionId() { return sessionId; }
    public void setSessionId(UUID sessionId) { this.sessionId = sessionId; }
    public UUID getPackageId() { return packageId; }
    public void setPackageId(UUID packageId) { this.packageId = packageId; }
    public UUID getPayerId() { return payerId; }
    public void setPayerId(UUID payerId) { this.payerId = payerId; }
    public UUID getMentorId() { return mentorId; }
    public void setMentorId(UUID mentorId) { this.mentorId = mentorId; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public String getCurrency() { return currency; }
    public BigDecimal getFeeRate() { return feeRate; }
    public BigDecimal getFee() { return fee; }
    public BigDecimal getMentorEarning() { return mentorEarning; }

    /** US-13 — chốt phí nền tảng tại thời điểm charge. */
    public void applyFee(BigDecimal rate, BigDecimal fee, BigDecimal mentorEarning) {
        this.feeRate = rate;
        this.fee = fee;
        this.mentorEarning = mentorEarning;
    }

    public String getHoldReason() { return holdReason; }
    public OffsetDateTime getHeldAt() { return heldAt; }

    /** US-12 — SUCCESS → ON_HOLD (tranh chấp). */
    public void hold(String reason) {
        this.status = Status.ON_HOLD;
        this.holdReason = reason;
        this.heldAt = OffsetDateTime.now();
    }

    /** US-12 — ON_HOLD → SUCCESS. */
    public void release() {
        this.status = Status.SUCCESS;
    }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public String getProvider() { return provider; }
    public String getProviderReference() { return providerReference; }
    public void setProviderReference(String providerReference) { this.providerReference = providerReference; }
    public String getFailureReason() { return failureReason; }
    public void setFailureReason(String failureReason) { this.failureReason = failureReason; }
    public boolean isSessionSynced() { return sessionSynced; }
    public void setSessionSynced(boolean sessionSynced) { this.sessionSynced = sessionSynced; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
