package com.mmp.mentoring.entity;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

/** US-02 — một lần vi phạm của mentor. */
@Entity
@Table(name = "mentor_strikes")
public class MentorStrike {

    public enum Reason { MENTOR_CANCEL, MENTOR_NO_SHOW }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "mentor_id", nullable = false)
    private UUID mentorId;

    @Column(name = "session_id")
    private UUID sessionId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Reason reason;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    protected MentorStrike() {
    }

    public MentorStrike(UUID mentorId, UUID sessionId, Reason reason) {
        this.mentorId = mentorId;
        this.sessionId = sessionId;
        this.reason = reason;
    }

    public UUID getId() { return id; }
    public UUID getMentorId() { return mentorId; }
    public UUID getSessionId() { return sessionId; }
    public Reason getReason() { return reason; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
