package com.mmp.mentoring.entity;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

/** US-40 (PRD-SES-12) — ghi chú riêng của mentor cho một phiên; mentee không đọc được. */
@Entity
@Table(name = "mentor_private_notes")
public class MentorPrivateNote {

    @Id
    @Column(name = "session_id")
    private UUID sessionId;

    @Column(name = "mentor_id", nullable = false, updatable = false)
    private UUID mentorId;

    @Column(nullable = false)
    private String content = "";

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected MentorPrivateNote() {
    }

    public MentorPrivateNote(UUID sessionId, UUID mentorId, OffsetDateTime now) {
        this.sessionId = sessionId;
        this.mentorId = mentorId;
        this.updatedAt = now;
    }

    public void edit(String content, OffsetDateTime now) {
        this.content = content;
        this.updatedAt = now;
    }

    public UUID getSessionId() { return sessionId; }
    public UUID getMentorId() { return mentorId; }
    public String getContent() { return content; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
