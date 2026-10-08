package com.mmp.mentoring.entity;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "mentoring_requests")
public class MentoringRequest {

    /**
     * PENDING → ACCEPTED | INTRO | REJECTED | CANCELLED;
     * INTRO (đang làm quen, chưa chiếm chỗ của mentor) → ACCEPTED khi cả hai CONTINUE | REJECTED | CANCELLED;
     * ACCEPTED → COMPLETED (kết thúc quan hệ mentoring)
     */
    public enum Status { PENDING, INTRO, ACCEPTED, REJECTED, CANCELLED, COMPLETED }

    /** Quyết định của mỗi bên sau buổi làm quen. */
    public enum Decision { CONTINUE, DECLINE }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "mentee_id", nullable = false)
    private UUID menteeId;

    @Column(name = "mentor_id", nullable = false)
    private UUID mentorId;

    private String message;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.PENDING;

    @Column(name = "response_note")
    private String responseNote;

    @Enumerated(EnumType.STRING)
    @Column(name = "mentee_decision")
    private Decision menteeDecision;

    @Enumerated(EnumType.STRING)
    @Column(name = "mentor_decision")
    private Decision mentorDecision;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(name = "responded_at")
    private OffsetDateTime respondedAt;

    protected MentoringRequest() {
    }

    public MentoringRequest(UUID menteeId, UUID mentorId, String message) {
        this.menteeId = menteeId;
        this.mentorId = mentorId;
        this.message = message;
    }

    public UUID getId() { return id; }
    public UUID getMenteeId() { return menteeId; }
    public UUID getMentorId() { return mentorId; }
    public String getMessage() { return message; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public String getResponseNote() { return responseNote; }
    public void setResponseNote(String responseNote) { this.responseNote = responseNote; }
    public Decision getMenteeDecision() { return menteeDecision; }
    public void setMenteeDecision(Decision menteeDecision) { this.menteeDecision = menteeDecision; }
    public Decision getMentorDecision() { return mentorDecision; }
    public void setMentorDecision(Decision mentorDecision) { this.mentorDecision = mentorDecision; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getRespondedAt() { return respondedAt; }
    public void setRespondedAt(OffsetDateTime respondedAt) { this.respondedAt = respondedAt; }
}
