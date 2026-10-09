package com.mmp.profile.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Hồ sơ mentor — toàn bộ dữ liệu mà profile-service sở hữu. Embedding của hồ sơ
 * này nằm ở matching_db (bảng mentor_embeddings) do matching-service quản lý;
 * profile-service không lưu và không đọc vector.
 */
@Entity
@Table(name = "mentor_profiles")
public class MentorProfile {

    public enum VerificationStatus { PENDING_INTERVIEW, PENDING_REVIEW, APPROVED, REJECTED }

    /** US-08 — trạng thái nhận mentee (thay cho cờ is_available cũ, nay là cột sinh tự động). */
    public enum Status { ACCEPTING, PAUSED, ON_LEAVE, SUSPENDED }

    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    @Column(columnDefinition = "text[]", nullable = false)
    private String[] skills = new String[0];

    @Column(nullable = false)
    private String domain;

    private String bio;

    @Column(name = "years_experience", nullable = false)
    private int yearsExperience;

    @Column(name = "cv_file_url")
    private String cvFileUrl;

    @Column(name = "portfolio_links", columnDefinition = "text[]", nullable = false)
    private String[] portfolioLinks = new String[0];

    @Column(name = "hourly_rate", nullable = false)
    private BigDecimal hourlyRate = BigDecimal.ZERO;

    @Column(nullable = false)
    private int capacity = 3;

    @Column(name = "active_mentee_count", nullable = false)
    private int activeMenteeCount;

    // is_available là cột GENERATED (status = 'ACCEPTING') — không map để Hibernate không ghi vào.
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.ACCEPTING;

    @Column(name = "on_leave_until")
    private LocalDate onLeaveUntil;

    @Column(name = "status_reason")
    private String statusReason;

    @Column(name = "status_changed_at")
    private OffsetDateTime statusChangedAt;

    // US-27 — đình chỉ bởi admin (hoặc hệ thống, suspended_by NULL)
    @Column(name = "suspended_reason")
    private String suspendedReason;

    @Column(name = "suspended_at")
    private OffsetDateTime suspendedAt;

    @Column(name = "suspended_by")
    private UUID suspendedBy;

    // US-04 — cài đặt đặt lịch
    @Column(name = "meeting_link")
    private String meetingLink;

    @Column(name = "buffer_minutes", nullable = false)
    private int bufferMinutes = 15;

    @Column(name = "min_notice_hours", nullable = false)
    private int minNoticeHours = 12;

    @Column(columnDefinition = "text[]", nullable = false)
    private String[] languages = {"vi"};

    @Column(name = "session_types", columnDefinition = "text[]", nullable = false)
    private String[] sessionTypes = {"CAREER_ADVICE", "CODE_REVIEW", "MOCK_INTERVIEW", "PROJECT_GUIDANCE"};

    @Column(nullable = false)
    private String timezone = "Asia/Ho_Chi_Minh";

    /** US-37 (PRD-PROF-3) — câu giới thiệu ngắn ≤ 80 ký tự. */
    private String headline;

    /** US-35 — trung vị thời gian phản hồi yêu cầu (giờ), mentoring-service đồng bộ; null = chưa có dữ liệu. */
    @Column(name = "median_response_hours")
    private java.math.BigDecimal medianResponseHours;

    @Column(name = "response_sample_size", nullable = false)
    private int responseSampleSize;

    @Column(nullable = false)
    private float rating;

    @Column(name = "rating_count", nullable = false)
    private int ratingCount;

    @Enumerated(EnumType.STRING)
    @Column(name = "verification_status", nullable = false)
    private VerificationStatus verificationStatus = VerificationStatus.PENDING_INTERVIEW;

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

    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }
    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }
    public String[] getSkills() { return skills; }
    public void setSkills(String[] skills) { this.skills = skills; }
    public String getDomain() { return domain; }
    public void setDomain(String domain) { this.domain = domain; }
    public String getBio() { return bio; }
    public void setBio(String bio) { this.bio = bio; }
    public int getYearsExperience() { return yearsExperience; }
    public void setYearsExperience(int yearsExperience) { this.yearsExperience = yearsExperience; }
    public String getCvFileUrl() { return cvFileUrl; }
    public void setCvFileUrl(String cvFileUrl) { this.cvFileUrl = cvFileUrl; }
    public String[] getPortfolioLinks() { return portfolioLinks; }
    public void setPortfolioLinks(String[] portfolioLinks) { this.portfolioLinks = portfolioLinks; }
    public BigDecimal getHourlyRate() { return hourlyRate; }
    public void setHourlyRate(BigDecimal hourlyRate) { this.hourlyRate = hourlyRate; }
    public int getCapacity() { return capacity; }
    public void setCapacity(int capacity) { this.capacity = capacity; }
    public int getActiveMenteeCount() { return activeMenteeCount; }
    public void setActiveMenteeCount(int activeMenteeCount) { this.activeMenteeCount = activeMenteeCount; }
    /** Trạng thái đã lưu (chưa áp dụng nghỉ phép hết hạn — dùng MentorRules.effectiveStatus). */
    public Status getStatus() { return status; }
    public LocalDate getOnLeaveUntil() { return onLeaveUntil; }
    public String getStatusReason() { return statusReason; }
    public OffsetDateTime getStatusChangedAt() { return statusChangedAt; }

    public String getMeetingLink() { return meetingLink; }
    public int getBufferMinutes() { return bufferMinutes; }
    public int getMinNoticeHours() { return minNoticeHours; }
    public String[] getLanguages() { return languages; }
    public String[] getSessionTypes() { return sessionTypes; }
    public String getTimezone() { return timezone; }
    public void setTimezone(String timezone) { this.timezone = timezone; }
    public String getHeadline() { return headline; }
    public java.math.BigDecimal getMedianResponseHours() { return medianResponseHours; }
    public int getResponseSampleSize() { return responseSampleSize; }

    public void updateResponseTime(java.math.BigDecimal medianHours, int sampleSize) {
        this.medianResponseHours = medianHours;
        this.responseSampleSize = sampleSize;
    }
    public void setHeadline(String headline) { this.headline = headline; }

    public void updateBookingSettings(String meetingLink, int bufferMinutes, int minNoticeHours,
                                      String[] languages, String[] sessionTypes, String timezone) {
        this.meetingLink = meetingLink;
        this.bufferMinutes = bufferMinutes;
        this.minNoticeHours = minNoticeHours;
        this.languages = languages;
        this.sessionTypes = sessionTypes;
        this.timezone = timezone;
    }

    public void changeStatus(Status status, LocalDate onLeaveUntil, String reason) {
        boolean wasSuspended = this.status == Status.SUSPENDED;
        this.status = status;
        this.onLeaveUntil = status == Status.ON_LEAVE ? onLeaveUntil : null;
        this.statusReason = reason;
        this.statusChangedAt = OffsetDateTime.now();
        if (status == Status.SUSPENDED) {
            // Interface 2 (tranh chấp): hệ thống đình chỉ, không có admin thực hiện.
            if (!wasSuspended) {
                this.suspendedAt = this.statusChangedAt;
                this.suspendedBy = null;
            }
            this.suspendedReason = reason;
        } else {
            clearSuspension();
        }
    }

    /** US-27 — admin đình chỉ mentor (tài khoản vẫn đăng nhập được, chỉ ngừng nhận mentee). */
    public void suspend(String reason, UUID adminId, OffsetDateTime at) {
        this.status = Status.SUSPENDED;
        this.onLeaveUntil = null;
        this.statusReason = reason;
        this.statusChangedAt = at;
        this.suspendedReason = reason;
        this.suspendedAt = at;
        this.suspendedBy = adminId;
    }

    /** US-27 — admin gỡ đình chỉ: về ACCEPTING. */
    public void unsuspend(OffsetDateTime at) {
        this.status = Status.ACCEPTING;
        this.onLeaveUntil = null;
        this.statusReason = null;
        this.statusChangedAt = at;
        clearSuspension();
    }

    private void clearSuspension() {
        this.suspendedReason = null;
        this.suspendedAt = null;
        this.suspendedBy = null;
    }

    public String getSuspendedReason() { return suspendedReason; }
    public OffsetDateTime getSuspendedAt() { return suspendedAt; }
    public UUID getSuspendedBy() { return suspendedBy; }
    public float getRating() { return rating; }
    public void setRating(float rating) { this.rating = rating; }
    public int getRatingCount() { return ratingCount; }
    public void setRatingCount(int ratingCount) { this.ratingCount = ratingCount; }
    public VerificationStatus getVerificationStatus() { return verificationStatus; }
    public void setVerificationStatus(VerificationStatus s) { this.verificationStatus = s; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
