package com.mmp.mentoring.entity;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "enrichment_conversations")
public class EnrichmentConversation {

    public enum Status { IN_PROGRESS, COMPLETED }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "mentee_id", nullable = false)
    private UUID menteeId;

    @Column(name = "cv_id", nullable = false)
    private UUID cvId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.IN_PROGRESS;

    @Column(name = "max_turns", nullable = false)
    private int maxTurns;

    @Column(name = "current_turn", nullable = false)
    private int currentTurn = 1;

    @Column(nullable = false)
    private String engine;

    @Column(name = "enriched_goal")
    private String enrichedGoal;

    @Column(name = "profile_synced", nullable = false)
    private boolean profileSynced;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(name = "completed_at")
    private OffsetDateTime completedAt;

    protected EnrichmentConversation() {
    }

    public EnrichmentConversation(UUID menteeId, UUID cvId, int maxTurns, String engine) {
        this.menteeId = menteeId;
        this.cvId = cvId;
        this.maxTurns = maxTurns;
        this.engine = engine;
    }

    public UUID getId() { return id; }
    public UUID getMenteeId() { return menteeId; }
    public UUID getCvId() { return cvId; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public int getMaxTurns() { return maxTurns; }
    public int getCurrentTurn() { return currentTurn; }
    public void setCurrentTurn(int currentTurn) { this.currentTurn = currentTurn; }
    public String getEngine() { return engine; }
    public String getEnrichedGoal() { return enrichedGoal; }
    public void setEnrichedGoal(String enrichedGoal) { this.enrichedGoal = enrichedGoal; }
    public boolean isProfileSynced() { return profileSynced; }
    public void setProfileSynced(boolean profileSynced) { this.profileSynced = profileSynced; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getCompletedAt() { return completedAt; }
    public void setCompletedAt(OffsetDateTime completedAt) { this.completedAt = completedAt; }
}
