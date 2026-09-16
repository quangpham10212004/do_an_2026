package com.mmp.payment.entity;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "referrals")
public class Referral {

    /** REGISTERED: đã đăng ký qua mã; QUALIFIED: đã có giao dịch hợp lệ đầu tiên; REJECTED: vi phạm quy tắc */
    public enum Status { REGISTERED, QUALIFIED, REJECTED }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "referrer_id", nullable = false)
    private UUID referrerId;

    @Column(name = "referee_id", nullable = false, unique = true)
    private UUID refereeId;

    @Column(nullable = false)
    private String code;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.REGISTERED;

    @Column(name = "reject_reason")
    private String rejectReason;

    @Column(name = "qualifying_tx_id")
    private UUID qualifyingTxId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(name = "qualified_at")
    private OffsetDateTime qualifiedAt;

    protected Referral() {
    }

    public Referral(UUID referrerId, UUID refereeId, String code) {
        this.referrerId = referrerId;
        this.refereeId = refereeId;
        this.code = code;
    }

    public UUID getId() { return id; }
    public UUID getReferrerId() { return referrerId; }
    public UUID getRefereeId() { return refereeId; }
    public String getCode() { return code; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public String getRejectReason() { return rejectReason; }
    public void setRejectReason(String rejectReason) { this.rejectReason = rejectReason; }
    public UUID getQualifyingTxId() { return qualifyingTxId; }
    public void setQualifyingTxId(UUID qualifyingTxId) { this.qualifyingTxId = qualifyingTxId; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getQualifiedAt() { return qualifiedAt; }
    public void setQualifiedAt(OffsetDateTime qualifiedAt) { this.qualifiedAt = qualifiedAt; }
}
