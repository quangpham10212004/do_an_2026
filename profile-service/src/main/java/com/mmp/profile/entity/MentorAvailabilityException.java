package com.mmp.profile.entity;

import jakarta.persistence.*;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * US-07 — ngoại lệ lịch rảnh trong một ngày cụ thể: nghỉ cả ngày (startTime = endTime = null) hoặc
 * bận một khoảng giờ. Giờ theo múi giờ của mentor.
 */
@Entity
@Table(name = "mentor_availability_exceptions")
public class MentorAvailabilityException {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "mentor_id", nullable = false)
    private UUID mentorId;

    @Column(name = "date", nullable = false)
    private LocalDate date;

    @Column(name = "start_time")
    private LocalTime startTime;

    @Column(name = "end_time")
    private LocalTime endTime;

    private String reason;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    protected MentorAvailabilityException() {
    }

    public MentorAvailabilityException(UUID mentorId, LocalDate date, LocalTime startTime, LocalTime endTime, String reason) {
        this.mentorId = mentorId;
        update(date, startTime, endTime, reason);
    }

    @PrePersist
    void onCreate() {
        createdAt = OffsetDateTime.now();
    }

    public final void update(LocalDate date, LocalTime startTime, LocalTime endTime, String reason) {
        this.date = date;
        this.startTime = startTime;
        this.endTime = endTime;
        this.reason = reason;
    }

    public boolean isWholeDay() {
        return startTime == null;
    }

    public UUID getId() { return id; }
    public UUID getMentorId() { return mentorId; }
    public LocalDate getDate() { return date; }
    public LocalTime getStartTime() { return startTime; }
    public LocalTime getEndTime() { return endTime; }
    public String getReason() { return reason; }
}
