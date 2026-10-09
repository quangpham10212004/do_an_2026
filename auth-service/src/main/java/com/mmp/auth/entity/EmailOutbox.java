package com.mmp.auth.entity;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

/** US-38 — một email thông báo trong hàng đợi gửi. */
@Entity
@Table(name = "email_outbox")
public class EmailOutbox {

    public enum Status { PENDING, SENT, SKIPPED, FAILED }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "to_email", nullable = false, updatable = false)
    private String toEmail;

    @Column(nullable = false, updatable = false)
    private String category;

    @Column(nullable = false, updatable = false)
    private String type;

    @Column(nullable = false, updatable = false)
    private String subject;

    @Column(nullable = false, updatable = false)
    private String body;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.PENDING;

    @Column(name = "skip_reason")
    private String skipReason;

    @Column(name = "send_after", nullable = false)
    private OffsetDateTime sendAfter;

    @Column(nullable = false)
    private int attempts;

    @Column(name = "last_error")
    private String lastError;

    @Column(name = "sent_at")
    private OffsetDateTime sentAt;

    @Column(name = "dedupe_key", updatable = false)
    private String dedupeKey;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    protected EmailOutbox() {
    }

    public EmailOutbox(UUID userId, String toEmail, String category, String type, String subject, String body,
                       OffsetDateTime sendAfter, String dedupeKey, OffsetDateTime now) {
        this.userId = userId;
        this.toEmail = toEmail;
        this.category = category;
        this.type = type;
        this.subject = subject;
        this.body = body;
        this.sendAfter = sendAfter;
        this.dedupeKey = dedupeKey;
        this.createdAt = now;
    }

    /** Giữ chỗ gửi: dời send_after để lượt job khác không lấy lại dòng này trong lúc đang gửi (ngoài transaction). */
    public void lease(OffsetDateTime until) {
        this.sendAfter = until;
    }

    public void skip(String reason) {
        this.status = Status.SKIPPED;
        this.skipReason = reason;
    }

    public void markSent(OffsetDateTime at) {
        this.status = Status.SENT;
        this.sentAt = at;
        this.attempts++;
        this.lastError = null;
    }

    /** Lỗi gửi: thử lại sau {@code retryAt}; quá {@code maxAttempts} lần thì FAILED. */
    public void markFailed(String error, OffsetDateTime retryAt, int maxAttempts) {
        this.attempts++;
        this.lastError = error == null ? null : error.substring(0, Math.min(error.length(), 500));
        if (this.attempts >= maxAttempts) {
            this.status = Status.FAILED;
        } else {
            this.sendAfter = retryAt;
        }
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public String getToEmail() { return toEmail; }
    public String getCategory() { return category; }
    public String getType() { return type; }
    public String getSubject() { return subject; }
    public String getBody() { return body; }
    public Status getStatus() { return status; }
    public String getSkipReason() { return skipReason; }
    public OffsetDateTime getSendAfter() { return sendAfter; }
    public int getAttempts() { return attempts; }
    public OffsetDateTime getSentAt() { return sentAt; }
    public String getDedupeKey() { return dedupeKey; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
