package com.mmp.mentoring.entity;

import jakarta.persistence.*;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

/** US-40 (PRD-SES-11) — việc cần làm sau phiên; thuộc về cặp mentor–mentee, việc còn mở mang sang phiên sau. */
@Entity
@Table(name = "action_items")
public class ActionItem {

    public enum Owner { MENTEE, MENTOR }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "session_id", nullable = false, updatable = false)
    private UUID sessionId;

    @Column(name = "mentee_id", nullable = false, updatable = false)
    private UUID menteeId;

    @Column(name = "mentor_id", nullable = false, updatable = false)
    private UUID mentorId;

    @Column(nullable = false)
    private String text;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Owner owner;

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Column(nullable = false)
    private boolean done;

    @Column(name = "done_at")
    private OffsetDateTime doneAt;

    @Column(name = "created_by", nullable = false, updatable = false)
    private UUID createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected ActionItem() {
    }

    public ActionItem(MentoringSession session, String text, Owner owner, LocalDate dueDate, UUID createdBy, OffsetDateTime now) {
        this.sessionId = session.getId();
        this.menteeId = session.getMenteeId();
        this.mentorId = session.getMentorId();
        this.text = text;
        this.owner = owner;
        this.dueDate = dueDate;
        this.createdBy = createdBy;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void update(String text, Owner owner, LocalDate dueDate, boolean clearDueDate, Boolean done, OffsetDateTime now) {
        if (text != null) this.text = text;
        if (owner != null) this.owner = owner;
        if (clearDueDate) this.dueDate = null;
        else if (dueDate != null) this.dueDate = dueDate;
        if (done != null && done != this.done) {
            this.done = done;
            this.doneAt = done ? now : null;
        }
        this.updatedAt = now;
    }

    public UUID getId() { return id; }
    public UUID getSessionId() { return sessionId; }
    public UUID getMenteeId() { return menteeId; }
    public UUID getMentorId() { return mentorId; }
    public String getText() { return text; }
    public Owner getOwner() { return owner; }
    public LocalDate getDueDate() { return dueDate; }
    public boolean isDone() { return done; }
    public OffsetDateTime getDoneAt() { return doneAt; }
    public UUID getCreatedBy() { return createdBy; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
