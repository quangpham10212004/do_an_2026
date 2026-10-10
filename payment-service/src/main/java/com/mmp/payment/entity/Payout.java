package com.mmp.payment.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/** US-42 (PRD-PAY-5) — yêu cầu rút tiền: REQUESTED → PAID | REJECTED. */
@Entity
@Table(name = "payouts")
public class Payout {

    public enum Status { REQUESTED, PAID, REJECTED }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "mentor_id", nullable = false, updatable = false)
    private UUID mentorId;

    @Column(nullable = false, updatable = false)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.REQUESTED;

    @Column(name = "bank_name", nullable = false, updatable = false)
    private String bankName;

    @Column(name = "account_number", nullable = false, updatable = false)
    private String accountNumber;

    @Column(name = "holder_name", nullable = false, updatable = false)
    private String holderName;

    private String reference;

    private String note;

    @Column(name = "requested_at", nullable = false, updatable = false)
    private OffsetDateTime requestedAt;

    @Column(name = "decided_at")
    private OffsetDateTime decidedAt;

    @Column(name = "decided_by")
    private UUID decidedBy;

    protected Payout() {
    }

    public Payout(UUID mentorId, BigDecimal amount, BankAccount bank, OffsetDateTime now) {
        this.mentorId = mentorId;
        this.amount = amount;
        this.bankName = bank.getBankName();
        this.accountNumber = bank.getAccountNumber();
        this.holderName = bank.getHolderName();
        this.requestedAt = now;
    }

    public void decide(Status status, String reference, String note, UUID by, OffsetDateTime at) {
        this.status = status;
        this.reference = reference;
        this.note = note;
        this.decidedBy = by;
        this.decidedAt = at;
    }

    public UUID getId() { return id; }
    public UUID getMentorId() { return mentorId; }
    public BigDecimal getAmount() { return amount; }
    public Status getStatus() { return status; }
    public String getBankName() { return bankName; }
    public String getAccountNumber() { return accountNumber; }
    public String getHolderName() { return holderName; }
    public String getReference() { return reference; }
    public String getNote() { return note; }
    public OffsetDateTime getRequestedAt() { return requestedAt; }
    public OffsetDateTime getDecidedAt() { return decidedAt; }
    public UUID getDecidedBy() { return decidedBy; }
}
