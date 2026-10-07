package com.mmp.payment.entity;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * US-25 — lịch giải phóng thu nhập của 1 giao dịch: trạng thái cuối của phiên (do mentoring-service báo) và thời điểm
 * được giải phóng (release_at = ended_at + 48 giờ, hoặc ngay khi tranh chấp được giải quyết). settled_at = job đã xử lý
 * (đã ghi EARNING_AVAILABLE hoặc không còn gì để giải phóng).
 */
@Entity
@Table(name = "earning_schedules")
public class EarningSchedule {

    @Id
    @Column(name = "transaction_id")
    private UUID transactionId;

    @Column(name = "session_id", nullable = false)
    private UUID sessionId;

    @Column(name = "mentor_id", nullable = false)
    private UUID mentorId;

    @Column(name = "final_state", nullable = false)
    private String finalState;

    @Column(name = "ended_at", nullable = false)
    private OffsetDateTime endedAt;

    @Column(name = "release_at", nullable = false)
    private OffsetDateTime releaseAt;

    @Column(name = "settled_at")
    private OffsetDateTime settledAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    protected EarningSchedule() {
    }

    public EarningSchedule(Transaction t) {
        this.transactionId = t.getId();
        this.sessionId = t.getSessionId();
        this.mentorId = t.getMentorId();
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = OffsetDateTime.now();
    }

    /** Ghi (lại) trạng thái cuối; lịch được mở lại để job xử lý. */
    public void schedule(String finalState, OffsetDateTime endedAt, OffsetDateTime releaseAt) {
        this.finalState = finalState;
        this.endedAt = endedAt;
        this.releaseAt = releaseAt;
        this.settledAt = null;
    }

    public void settle(OffsetDateTime at) {
        this.settledAt = at;
    }

    /** Chỉ dùng cho endpoint dev (e2e) — đưa thời điểm giải phóng về quá khứ. */
    public void moveReleaseAt(OffsetDateTime releaseAt) {
        this.releaseAt = releaseAt;
    }

    public UUID getTransactionId() { return transactionId; }
    public UUID getSessionId() { return sessionId; }
    public UUID getMentorId() { return mentorId; }
    public String getFinalState() { return finalState; }
    public OffsetDateTime getEndedAt() { return endedAt; }
    public OffsetDateTime getReleaseAt() { return releaseAt; }
    public OffsetDateTime getSettledAt() { return settledAt; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
