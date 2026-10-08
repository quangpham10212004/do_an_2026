package com.mmp.mentoring.entity;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "mentoring_requests")
public class MentoringRequest {

    /**
     * PENDING → ACCEPTED | REJECTED | CANCELLED | EXPIRED (US-15: không phản hồi sau 72 giờ);
     * ACCEPTED → ENDED (US-31 kết thúc quan hệ mentoring). COMPLETED = giá trị cũ trước US-31 (migration V12 đã đổi sang
     * ENDED; chỉ còn để đọc an toàn, API trả về ENDED).
     */
    public enum Status { PENDING, ACCEPTED, REJECTED, CANCELLED, COMPLETED, EXPIRED, ENDED }

    /** US-31 — lý do kết thúc; INACTIVE chỉ do hệ thống. */
    public enum EndReason { GOAL_REACHED, NO_LONGER_NEEDED, NOT_A_FIT, OTHER, INACTIVE }

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

    /** US-31 — MENTEE | MENTOR | ADMIN | SYSTEM. */
    @Column(name = "ended_by")
    private String endedBy;

    @Enumerated(EnumType.STRING)
    @Column(name = "end_reason")
    private EndReason endReason;

    @Column(name = "end_note")
    private String endNote;

    @Column(name = "ended_at")
    private OffsetDateTime endedAt;

    @Column(name = "inactivity_warned_at")
    private OffsetDateTime inactivityWarnedAt;

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

    /** Trạng thái hiển thị: COMPLETED cũ được đọc như ENDED. */
    public Status effectiveStatus() {
        return status == Status.COMPLETED ? Status.ENDED : status;
    }

    /** US-31 — ACCEPTED → ENDED. */
    public void end(String by, EndReason reason, String note, OffsetDateTime at) {
        this.status = Status.ENDED;
        this.endedBy = by;
        this.endReason = reason;
        this.endNote = note;
        this.endedAt = at;
    }

    public void warnInactive(OffsetDateTime at) {
        this.inactivityWarnedAt = at;
    }

    public void clearInactivityWarning() {
        this.inactivityWarnedAt = null;
    }

    public String getEndedBy() { return endedBy; }
    public EndReason getEndReason() { return endReason; }
    public String getEndNote() { return endNote; }
    public OffsetDateTime getEndedAt() { return endedAt; }
    public OffsetDateTime getInactivityWarnedAt() { return inactivityWarnedAt; }

    /** US-15 — PENDING quá hạn phản hồi. */
    public void expire(OffsetDateTime at) {
        this.status = Status.EXPIRED;
        this.expiredAt = at;
    }
}
