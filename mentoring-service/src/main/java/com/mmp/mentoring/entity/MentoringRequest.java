package com.mmp.mentoring.entity;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "mentoring_requests")
public class MentoringRequest {

    /** PENDING → ACCEPTED | REJECTED | CANCELLED; ACCEPTED → COMPLETED (kết thúc quan hệ mentoring) */
    public enum Status { PENDING, ACCEPTED, REJECTED, CANCELLED, COMPLETED }

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
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getRespondedAt() { return respondedAt; }
    public void setRespondedAt(OffsetDateTime respondedAt) { this.respondedAt = respondedAt; }
}
