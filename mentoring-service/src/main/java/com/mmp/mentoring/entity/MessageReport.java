package com.mmp.mentoring.entity;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

/** US-33 (PRD-MSG-4) — báo cáo tin nhắn = hồ sơ kiểm duyệt OPEN → RESOLVED (DISMISSED | WARNED). */
@Entity
@Table(name = "message_reports")
public class MessageReport {

    public enum Reason { SPAM, HARASSMENT, OFF_PLATFORM_PAYMENT, OTHER }

    public enum Status { OPEN, RESOLVED }

    public enum Outcome { DISMISSED, WARNED }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "message_id", nullable = false, updatable = false)
    private UUID messageId;

    @Column(name = "conversation_id", nullable = false, updatable = false)
    private UUID conversationId;

    @Column(name = "reporter_id", nullable = false, updatable = false)
    private UUID reporterId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private Reason reason;

    private String note;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.OPEN;

    @Enumerated(EnumType.STRING)
    private Outcome outcome;

    @Column(name = "resolution_note")
    private String resolutionNote;

    @Column(name = "resolved_by")
    private UUID resolvedBy;

    @Column(name = "resolved_at")
    private OffsetDateTime resolvedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    protected MessageReport() {
    }

    public MessageReport(UUID messageId, UUID conversationId, UUID reporterId, Reason reason, String note, OffsetDateTime now) {
        this.messageId = messageId;
        this.conversationId = conversationId;
        this.reporterId = reporterId;
        this.reason = reason;
        this.note = note;
        this.createdAt = now;
    }

    public void resolve(Outcome outcome, String note, UUID by, OffsetDateTime at) {
        this.status = Status.RESOLVED;
        this.outcome = outcome;
        this.resolutionNote = note;
        this.resolvedBy = by;
        this.resolvedAt = at;
    }

    public UUID getId() { return id; }
    public UUID getMessageId() { return messageId; }
    public UUID getConversationId() { return conversationId; }
    public UUID getReporterId() { return reporterId; }
    public Reason getReason() { return reason; }
    public String getNote() { return note; }
    public Status getStatus() { return status; }
    public Outcome getOutcome() { return outcome; }
    public String getResolutionNote() { return resolutionNote; }
    public UUID getResolvedBy() { return resolvedBy; }
    public OffsetDateTime getResolvedAt() { return resolvedAt; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
