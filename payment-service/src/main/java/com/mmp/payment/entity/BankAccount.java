package com.mmp.payment.entity;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

/** US-42 (PRD-PAY-5) — tài khoản nhận tiền của mentor (sandbox). */
@Entity
@Table(name = "mentor_bank_accounts")
public class BankAccount {

    @Id
    @Column(name = "mentor_id")
    private UUID mentorId;

    @Column(name = "bank_name", nullable = false)
    private String bankName;

    @Column(name = "account_number", nullable = false)
    private String accountNumber;

    @Column(name = "holder_name", nullable = false)
    private String holderName;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected BankAccount() {
    }

    public BankAccount(UUID mentorId) {
        this.mentorId = mentorId;
    }

    public void update(String bankName, String accountNumber, String holderName, OffsetDateTime now) {
        this.bankName = bankName;
        this.accountNumber = accountNumber;
        this.holderName = holderName;
        this.updatedAt = now;
    }

    public UUID getMentorId() { return mentorId; }
    public String getBankName() { return bankName; }
    public String getAccountNumber() { return accountNumber; }
    public String getHolderName() { return holderName; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
