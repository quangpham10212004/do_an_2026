package com.mmp.profile.entity;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "mentee_profiles")
public class MenteeProfile {

    public enum Level { BEGINNER, INTERMEDIATE, ADVANCED }

    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    private String goal;

    @Column(nullable = false)
    private String domain;

    @Enumerated(EnumType.STRING)
    @Column(name = "current_level", nullable = false)
    private Level currentLevel = Level.BEGINNER;

    @Column(columnDefinition = "text[]", nullable = false)
    private String[] skills = new String[0];

    @Column(name = "portfolio_links", columnDefinition = "text[]", nullable = false)
    private String[] portfolioLinks = new String[0];

    @Column(name = "cv_file_url")
    private String cvFileUrl;

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
    public String getGoal() { return goal; }
    public void setGoal(String goal) { this.goal = goal; }
    public String getDomain() { return domain; }
    public void setDomain(String domain) { this.domain = domain; }
    public Level getCurrentLevel() { return currentLevel; }
    public void setCurrentLevel(Level currentLevel) { this.currentLevel = currentLevel; }
    public String[] getSkills() { return skills; }
    public void setSkills(String[] skills) { this.skills = skills; }
    public String[] getPortfolioLinks() { return portfolioLinks; }
    public void setPortfolioLinks(String[] portfolioLinks) { this.portfolioLinks = portfolioLinks; }
    public String getCvFileUrl() { return cvFileUrl; }
    public void setCvFileUrl(String cvFileUrl) { this.cvFileUrl = cvFileUrl; }
    public OffsetDateTime getEmbeddingUpdatedAt() { return embeddingUpdatedAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
