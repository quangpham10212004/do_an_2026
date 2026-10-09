package com.mmp.mentoring.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "sessions")
public class MentoringSession {

    /**
     * PENDING (chờ thanh toán) → CONFIRMED | EXPIRED (quá hạn thanh toán); PENDING/CONFIRMED → CANCELLED (trước giờ bắt đầu);
     * CONFIRMED → AWAITING_ATTENDANCE (tới giờ kết thúc, US-12) → COMPLETED | NO_SHOW_MENTEE | NO_SHOW_MENTOR | DISPUTED |
     * CANCELLED (huỷ trong buổi gọi).
     */
    public enum Status { PENDING, CONFIRMED, AWAITING_ATTENDANCE, COMPLETED, EXPIRED, CANCELLED, NO_SHOW_MENTEE, NO_SHOW_MENTOR, DISPUTED }

    /** US-12 — câu trả lời xác nhận tham dự của mỗi bên. */
    public enum Attendance { HELD, MENTOR_NO_SHOW, MENTEE_NO_SHOW, CANCELLED_ON_CALL }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "request_id")
    private UUID requestId;

    @Column(name = "mentee_id", nullable = false)
    private UUID menteeId;

    @Column(name = "mentor_id", nullable = false)
    private UUID mentorId;

    @Column(name = "scheduled_at", nullable = false)
    private OffsetDateTime scheduledAt;

    @Column(name = "duration_minutes", nullable = false)
    private int durationMinutes = 60;

    @Column(nullable = false)
    private BigDecimal price = BigDecimal.ZERO;

    private String topic;

    @Enumerated(EnumType.STRING)
    @Column(name = "session_type")
    private SessionType sessionType;

    private String agenda;

    @Column(name = "pre_read_link")
    private String preReadLink;

    @Column(name = "meeting_link")
    private String meetingLink;

    /** US-01 — MENTEE | MENTOR | SYSTEM */
    @Column(name = "cancelled_by")
    private String cancelledBy;

    @Column(name = "cancel_reason")
    private String cancelReason;

    @Column(name = "refund_percent")
    private Integer refundPercent;

    @Column(name = "cancelled_at")
    private OffsetDateTime cancelledAt;

    /** US-06 — số lần đã dời lịch (tối đa 2). */
    @Column(name = "reschedule_count", nullable = false)
    private int rescheduleCount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.PENDING;

    @Enumerated(EnumType.STRING)
    @Column(name = "mentee_attendance")
    private Attendance menteeAttendance;

    @Enumerated(EnumType.STRING)
    @Column(name = "mentor_attendance")
    private Attendance mentorAttendance;

    @Column(name = "mentee_attended_at")
    private OffsetDateTime menteeAttendedAt;

    @Column(name = "mentor_attended_at")
    private OffsetDateTime mentorAttendedAt;

    @Column(name = "attendance_resolution")
    private String attendanceResolution;

    @Column(name = "resolved_at")
    private OffsetDateTime resolvedAt;

    /** Cột cũ (trước US-34) — giữ để đọc an toàn; nhắc lịch dùng 2 mốc dưới. */
    @Column(name = "reminder_sent", nullable = false)
    private boolean reminderSent;

    /** US-34 — đã gửi nhắc 24 giờ / 1 giờ trước giờ bắt đầu (null = chưa). */
    @Column(name = "reminder_24h_sent_at")
    private OffsetDateTime reminder24hSentAt;

    @Column(name = "reminder_1h_sent_at")
    private OffsetDateTime reminder1hSentAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @PrePersist
    void onCreate() {
        createdAt = OffsetDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = OffsetDateTime.now();
    }

    public OffsetDateTime endsAt() {
        return scheduledAt.plusMinutes(durationMinutes);
    }

    public UUID getId() { return id; }
    public UUID getRequestId() { return requestId; }
    public void setRequestId(UUID requestId) { this.requestId = requestId; }
    public UUID getMenteeId() { return menteeId; }
    public void setMenteeId(UUID menteeId) { this.menteeId = menteeId; }
    public UUID getMentorId() { return mentorId; }
    public void setMentorId(UUID mentorId) { this.mentorId = mentorId; }
    public OffsetDateTime getScheduledAt() { return scheduledAt; }
    public void setScheduledAt(OffsetDateTime scheduledAt) { this.scheduledAt = scheduledAt; }
    public int getDurationMinutes() { return durationMinutes; }
    public void setDurationMinutes(int durationMinutes) { this.durationMinutes = durationMinutes; }
    public BigDecimal getPrice() { return price; }
    public void setPrice(BigDecimal price) { this.price = price; }
    public String getTopic() { return topic; }
    public void setTopic(String topic) { this.topic = topic; }
    public SessionType getSessionType() { return sessionType; }
    public void setSessionType(SessionType sessionType) { this.sessionType = sessionType; }
    public String getAgenda() { return agenda; }
    public void setAgenda(String agenda) { this.agenda = agenda; }
    public String getPreReadLink() { return preReadLink; }
    public void setPreReadLink(String preReadLink) { this.preReadLink = preReadLink; }
    public String getMeetingLink() { return meetingLink; }
    public void setMeetingLink(String meetingLink) { this.meetingLink = meetingLink; }
    public String getCancelledBy() { return cancelledBy; }
    public void setCancelledBy(String cancelledBy) { this.cancelledBy = cancelledBy; }
    public String getCancelReason() { return cancelReason; }
    public void setCancelReason(String cancelReason) { this.cancelReason = cancelReason; }
    public Integer getRefundPercent() { return refundPercent; }
    public void setRefundPercent(Integer refundPercent) { this.refundPercent = refundPercent; }
    public OffsetDateTime getCancelledAt() { return cancelledAt; }
    public void setCancelledAt(OffsetDateTime cancelledAt) { this.cancelledAt = cancelledAt; }
    public int getRescheduleCount() { return rescheduleCount; }
    public void setRescheduleCount(int rescheduleCount) { this.rescheduleCount = rescheduleCount; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public Attendance getMenteeAttendance() { return menteeAttendance; }
    public Attendance getMentorAttendance() { return mentorAttendance; }
    public OffsetDateTime getMenteeAttendedAt() { return menteeAttendedAt; }
    public OffsetDateTime getMentorAttendedAt() { return mentorAttendedAt; }

    public void answerAsMentee(Attendance answer, OffsetDateTime at) {
        this.menteeAttendance = answer;
        this.menteeAttendedAt = at;
    }

    public void answerAsMentor(Attendance answer, OffsetDateTime at) {
        this.mentorAttendance = answer;
        this.mentorAttendedAt = at;
    }

    public String getAttendanceResolution() { return attendanceResolution; }
    public OffsetDateTime getResolvedAt() { return resolvedAt; }

    /** Chỉ dùng cho endpoint dev (e2e US-41). */
    public void markResolvedAt(OffsetDateTime at) { this.resolvedAt = at; }

    public void resolve(Status outcome, String resolution, OffsetDateTime at) {
        this.status = outcome;
        this.attendanceResolution = resolution;
        this.resolvedAt = at;
    }

    public boolean isReminderSent() { return reminderSent; }
    public void setReminderSent(boolean reminderSent) { this.reminderSent = reminderSent; }
    public OffsetDateTime getReminder24hSentAt() { return reminder24hSentAt; }
    public OffsetDateTime getReminder1hSentAt() { return reminder1hSentAt; }

    /** US-34 — dời lịch: giờ mới cần được nhắc lại từ đầu. */
    public void resetReminders() {
        this.reminderSent = false;
        this.reminder24hSentAt = null;
        this.reminder1hSentAt = null;
    }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
