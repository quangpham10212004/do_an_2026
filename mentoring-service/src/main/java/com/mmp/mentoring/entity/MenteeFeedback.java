package com.mmp.mentoring.entity;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

/** US-41 (PRD-REV-4) — nhận xét riêng của mentor về mentee sau một phiên; không công khai. */
@Entity
@Table(name = "mentee_feedback")
public class MenteeFeedback {

    @Id
    @Column(name = "session_id")
    private UUID sessionId;

    @Column(name = "mentor_id", nullable = false, updatable = false)
    private UUID mentorId;

    @Column(name = "mentee_id", nullable = false, updatable = false)
    private UUID menteeId;

    @Column(nullable = false)
    private int preparation;

    @Column(nullable = false)
    private int engagement;

    private String comment;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    protected MenteeFeedback() {
    }

    public MenteeFeedback(MentoringSession s, int preparation, int engagement, String comment, OffsetDateTime now) {
        this.sessionId = s.getId();
        this.mentorId = s.getMentorId();
        this.menteeId = s.getMenteeId();
        this.preparation = preparation;
        this.engagement = engagement;
        this.comment = comment;
        this.createdAt = now;
    }

    public UUID getSessionId() { return sessionId; }
    public UUID getMentorId() { return mentorId; }
    public UUID getMenteeId() { return menteeId; }
    public int getPreparation() { return preparation; }
    public int getEngagement() { return engagement; }
    public String getComment() { return comment; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
