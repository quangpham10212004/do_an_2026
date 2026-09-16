package com.mmp.profile.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Hồ sơ mentor. Cột embedding (VECTOR(384)) không được map vào entity — nó được
 * ghi bằng JDBC trong EmbeddingService để tránh phụ thuộc kiểu pgvector trong JPA,
 * và không bao giờ được trả ra API (chỉ matching-service đọc trực tiếp).
 */
@Entity
@Table(name = "mentor_profiles")
public class MentorProfile {

    public enum VerificationStatus { PENDING_INTERVIEW, PENDING_REVIEW, APPROVED, REJECTED }

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

    @Column(name = "is_available", nullable = false)
    private boolean available = true;

    @Column(nullable = false)
    private float rating;

    @Column(name = "rating_count", nullable = false)
    private int ratingCount;

    @Enumerated(EnumType.STRING)
    @Column(name = "verification_status", nullable = false)
    private VerificationStatus verificationStatus = VerificationStatus.PENDING_INTERVIEW;

    @Column(name = "embedding_updated_at", insertable = false, updatable = false)
    private OffsetDateTime embeddingUpdatedAt;

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
    public boolean isAvailable() { return available; }
    public void setAvailable(boolean available) { this.available = available; }
    public float getRating() { return rating; }
    public void setRating(float rating) { this.rating = rating; }
    public int getRatingCount() { return ratingCount; }
    public void setRatingCount(int ratingCount) { this.ratingCount = ratingCount; }
    public VerificationStatus getVerificationStatus() { return verificationStatus; }
    public void setVerificationStatus(VerificationStatus s) { this.verificationStatus = s; }
    public OffsetDateTime getEmbeddingUpdatedAt() { return embeddingUpdatedAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
