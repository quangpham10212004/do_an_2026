package com.mmp.mentoring.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** US-32 (PRD-ADM-1) — tranh chấp của 1 phiên mentoring. */
@Entity
@Table(name = "disputes")
public class Dispute {

    public enum Type { NO_SHOW, QUALITY, BEHAVIOR, PAYMENT, OTHER }

    /** OPEN → IN_REVIEW → RESOLVED (OPEN → RESOLVED trực tiếp cũng được). */
    public enum Status { OPEN, IN_REVIEW, RESOLVED }

    public enum Outcome { FULL_REFUND, PARTIAL_REFUND, NO_REFUND, WARNING, SUSPEND }

    /** Người mở: MENTEE / MENTOR của phiên, hoặc SYSTEM khi phiên chuyển DISPUTED. */
    public enum OpenedByRole { MENTEE, MENTOR, SYSTEM }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "session_id", nullable = false, updatable = false)
    private UUID sessionId;

    @Column(name = "opened_by", updatable = false)
    private UUID openedBy;

    @Enumerated(EnumType.STRING)
    @Column(name = "opened_by_role", nullable = false, updatable = false)
    private OpenedByRole openedByRole;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private Type type;

    @Column(nullable = false, updatable = false)
    private String description;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "evidence_links", nullable = false, columnDefinition = "text[]")
    private String[] evidenceLinks = new String[0];

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.OPEN;

    @Enumerated(EnumType.STRING)
    private Outcome outcome;

    @Column(name = "refund_percent")
    private Integer refundPercent;

    @Column(name = "resolution_note")
    private String resolutionNote;

    @Column(name = "resolved_by")
    private UUID resolvedBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(name = "first_response_at")
    private OffsetDateTime firstResponseAt;

    @Column(name = "resolved_at")
    private OffsetDateTime resolvedAt;

    protected Dispute() {
    }

    public Dispute(UUID sessionId, UUID openedBy, OpenedByRole openedByRole, Type type, String description, List<String> evidenceLinks) {
        this.sessionId = sessionId;
        this.openedBy = openedBy;
        this.openedByRole = openedByRole;
        this.type = type;
        this.description = description;
        this.evidenceLinks = evidenceLinks == null ? new String[0] : evidenceLinks.toArray(String[]::new);
    }

    public boolean isOpen() {
        return status != Status.RESOLVED;
    }

    /** OPEN → IN_REVIEW; ghi thời điểm phản hồi đầu tiên (SLA). */
    public void startReview(OffsetDateTime at) {
        this.status = Status.IN_REVIEW;
        if (firstResponseAt == null) firstResponseAt = at;
    }

    public void resolve(Outcome outcome, Integer refundPercent, String note, UUID adminId, OffsetDateTime at) {
        if (firstResponseAt == null) firstResponseAt = at;
        this.status = Status.RESOLVED;
        this.outcome = outcome;
        this.refundPercent = refundPercent;
        this.resolutionNote = note;
        this.resolvedBy = adminId;
        this.resolvedAt = at;
    }

    public UUID getId() { return id; }
    public UUID getSessionId() { return sessionId; }
    public UUID getOpenedBy() { return openedBy; }
    public OpenedByRole getOpenedByRole() { return openedByRole; }
    public Type getType() { return type; }
    public String getDescription() { return description; }
    public List<String> getEvidenceLinks() { return evidenceLinks == null ? List.of() : List.of(evidenceLinks); }
    public Status getStatus() { return status; }
    public Outcome getOutcome() { return outcome; }
    public Integer getRefundPercent() { return refundPercent; }
    public String getResolutionNote() { return resolutionNote; }
    public UUID getResolvedBy() { return resolvedBy; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getFirstResponseAt() { return firstResponseAt; }
    public OffsetDateTime getResolvedAt() { return resolvedAt; }
}
