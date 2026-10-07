package com.mmp.mentoring.entity;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "mentoring_requests")
public class MentoringRequest {

    /**
     * PENDING → ACCEPTED | REJECTED | CANCELLED | EXPIRED (US-15: không phản hồi sau 72 giờ);
     * ACCEPTED → COMPLETED (kết thúc quan hệ mentoring)
     */
    public enum Status { PENDING, ACCEPTED, REJECTED, CANCELLED, COMPLETED, EXPIRED }

    /** US-14 — tần suất mong muốn. */
    public enum Frequency { WEEKLY, BIWEEKLY, MONTHLY, ONE_OFF }

    /** US-14 — lý do mentor từ chối. */
    public enum RejectReason { FULL, NOT_MY_EXPERTISE, SCHEDULE, OTHER }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "mentee_id", nullable = false)
    private UUID menteeId;

    @Column(name = "mentor_id", nullable = false)
    private UUID mentorId;

    private String message;

    /** US-14 — mục tiêu (50–1000 ký tự cho yêu cầu mới). */
    @Column(nullable = false)
    private String goal;

    @Enumerated(EnumType.STRING)
    @Column(name = "session_type", nullable = false)
    private SessionType sessionType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Frequency frequency;

    @Column(name = "expected_duration_months", nullable = false)
    private int expectedDurationMonths;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.PENDING;

    @Column(name = "response_note")
    private String responseNote;

    @Enumerated(EnumType.STRING)
    @Column(name = "reject_reason")
    private RejectReason rejectReason;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(name = "responded_at")
    private OffsetDateTime respondedAt;

    @Column(name = "expired_at")
    private OffsetDateTime expiredAt;

    protected MentoringRequest() {
    }

    public MentoringRequest(UUID menteeId, UUID mentorId, String goal, SessionType sessionType, Frequency frequency,
                            int expectedDurationMonths, String message) {
        this.menteeId = menteeId;
        this.mentorId = mentorId;
        this.goal = goal;
        this.sessionType = sessionType;
        this.frequency = frequency;
        this.expectedDurationMonths = expectedDurationMonths;
        this.message = message;
    }

    public UUID getId() { return id; }
    public UUID getMenteeId() { return menteeId; }
    public UUID getMentorId() { return mentorId; }
    public String getMessage() { return message; }
    public String getGoal() { return goal; }
    public SessionType getSessionType() { return sessionType; }
    public Frequency getFrequency() { return frequency; }
    public int getExpectedDurationMonths() { return expectedDurationMonths; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public String getResponseNote() { return responseNote; }
    public void setResponseNote(String responseNote) { this.responseNote = responseNote; }
    public RejectReason getRejectReason() { return rejectReason; }
    public void setRejectReason(RejectReason rejectReason) { this.rejectReason = rejectReason; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getRespondedAt() { return respondedAt; }
    public void setRespondedAt(OffsetDateTime respondedAt) { this.respondedAt = respondedAt; }
    public OffsetDateTime getExpiredAt() { return expiredAt; }

    /** US-15 — PENDING quá hạn phản hồi. */
    public void expire(OffsetDateTime at) {
        this.status = Status.EXPIRED;
        this.expiredAt = at;
    }
}
