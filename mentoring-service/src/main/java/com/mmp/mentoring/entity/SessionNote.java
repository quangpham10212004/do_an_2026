package com.mmp.mentoring.entity;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

/** US-40 (PRD-SES-10) — ghi chú chung của phiên (markdown), cả hai bên sửa; version chống ghi đè. */
@Entity
@Table(name = "session_notes")
public class SessionNote {

    @Id
    @Column(name = "session_id")
    private UUID sessionId;

    @Column(nullable = false)
    private String content = "";

    @Column(nullable = false)
    private int version;

    @Column(name = "updated_by")
    private UUID updatedBy;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected SessionNote() {
    }

    public SessionNote(UUID sessionId, OffsetDateTime now) {
        this.sessionId = sessionId;
        this.updatedAt = now;
    }

    public void edit(String content, UUID by, OffsetDateTime now) {
        this.content = content;
        this.updatedBy = by;
        this.updatedAt = now;
        this.version++;
    }

    public UUID getSessionId() { return sessionId; }
    public String getContent() { return content; }
    public int getVersion() { return version; }
    public UUID getUpdatedBy() { return updatedBy; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
