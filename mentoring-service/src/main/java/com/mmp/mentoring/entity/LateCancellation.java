package com.mmp.mentoring.entity;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

/** US-01 — mentee huỷ phiên miễn phí sát giờ (&lt; 2 giờ trước giờ bắt đầu). */
@Entity
@Table(name = "late_cancellations")
public class LateCancellation {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "mentee_id", nullable = false)
    private UUID menteeId;

    @Column(name = "session_id", nullable = false, unique = true)
    private UUID sessionId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    protected LateCancellation() {
    }

    public LateCancellation(UUID menteeId, UUID sessionId) {
        this.menteeId = menteeId;
        this.sessionId = sessionId;
    }

    public UUID getId() { return id; }
    public UUID getMenteeId() { return menteeId; }
    public UUID getSessionId() { return sessionId; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
