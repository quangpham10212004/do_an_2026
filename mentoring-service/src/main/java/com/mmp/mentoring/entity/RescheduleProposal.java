package com.mmp.mentoring.entity;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

/** US-06 — đề xuất dời lịch một phiên CONFIRMED. */
@Entity
@Table(name = "reschedule_proposals")
public class RescheduleProposal {

    public enum Status { PENDING, ACCEPTED, DECLINED, EXPIRED }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "session_id", nullable = false)
    private UUID sessionId;

    @Column(name = "proposed_by", nullable = false)
    private UUID proposedBy;

    @Column(name = "new_start", nullable = false)
    private OffsetDateTime newStart;

    @Column(name = "expires_at", nullable = false)
    private OffsetDateTime expiresAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.PENDING;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "responded_at")
    private OffsetDateTime respondedAt;

    protected RescheduleProposal() {
    }

    public RescheduleProposal(UUID sessionId, UUID proposedBy, OffsetDateTime newStart, OffsetDateTime createdAt, OffsetDateTime expiresAt) {
        this.sessionId = sessionId;
        this.proposedBy = proposedBy;
        this.newStart = newStart;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
    }

    public void close(Status status) {
        this.status = status;
        this.respondedAt = OffsetDateTime.now();
    }

    public UUID getId() { return id; }
    public UUID getSessionId() { return sessionId; }
    public UUID getProposedBy() { return proposedBy; }
    public OffsetDateTime getNewStart() { return newStart; }
    public OffsetDateTime getExpiresAt() { return expiresAt; }
    public Status getStatus() { return status; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getRespondedAt() { return respondedAt; }
}
