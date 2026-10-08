package com.mmp.mentoring.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "sessions")
public class MentoringSession {

    /** PENDING (chờ thanh toán) → CONFIRMED → COMPLETED; PENDING/CONFIRMED → CANCELLED */
    public enum Status { PENDING, CONFIRMED, COMPLETED, CANCELLED }

    /** INTRO: buổi làm quen miễn phí trước khi chốt quan hệ; REGULAR: buổi mentoring chính thức. */
    public enum Type { INTRO, REGULAR }

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
    @Column(nullable = false)
    private Status status = Status.PENDING;

    @Column(name = "reminder_sent", nullable = false)
    private boolean reminderSent;

    @Enumerated(EnumType.STRING)
    @Column(name = "session_type", nullable = false)
    private Type type = Type.REGULAR;

    /** Gói buổi đã trừ 1 buổi cho phiên này (null nếu phiên lẻ). */
    @Column(name = "package_id")
    private UUID packageId;

    @Column(name = "reschedule_count", nullable = false)
    private int rescheduleCount;

    /** Đề xuất đổi lịch đang chờ bên còn lại đồng ý. */
    @Column(name = "proposed_at")
    private OffsetDateTime proposedAt;

    @Column(name = "proposed_by")
    private UUID proposedBy;

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
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public boolean isReminderSent() { return reminderSent; }
    public void setReminderSent(boolean reminderSent) { this.reminderSent = reminderSent; }
    public Type getType() { return type; }
    public void setType(Type type) { this.type = type; }
    public UUID getPackageId() { return packageId; }
    public void setPackageId(UUID packageId) { this.packageId = packageId; }
    public int getRescheduleCount() { return rescheduleCount; }
    public void setRescheduleCount(int rescheduleCount) { this.rescheduleCount = rescheduleCount; }
    public OffsetDateTime getProposedAt() { return proposedAt; }
    public void setProposedAt(OffsetDateTime proposedAt) { this.proposedAt = proposedAt; }
    public UUID getProposedBy() { return proposedBy; }
    public void setProposedBy(UUID proposedBy) { this.proposedBy = proposedBy; }
    public boolean hasPendingProposal() { return proposedAt != null; }
    public void clearProposal() { this.proposedAt = null; this.proposedBy = null; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
