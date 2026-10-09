package com.mmp.mentoring.entity;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

/** US-28 — một mục tiêu trong không gian mentoring (relationship_id = id yêu cầu mentoring đã chấp nhận). */
@Entity
@Table(name = "relationship_goals")
public class RelationshipGoal {

    public enum Status { TODO, IN_PROGRESS, DONE }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "relationship_id", nullable = false, updatable = false)
    private UUID relationshipId;

    @Column(nullable = false)
    private String text;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.TODO;

    @Column(nullable = false)
    private int position;

    /** null = hệ thống (mục tiêu tạo tự động từ yêu cầu). */
    @Column(name = "created_by", updatable = false)
    private UUID createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected RelationshipGoal() {
    }

    public RelationshipGoal(UUID relationshipId, String text, int position, UUID createdBy, OffsetDateTime now) {
        this.relationshipId = relationshipId;
        this.text = text;
        this.position = position;
        this.createdBy = createdBy;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public UUID getId() { return id; }
    public UUID getRelationshipId() { return relationshipId; }
    public String getText() { return text; }
    public Status getStatus() { return status; }
    public int getPosition() { return position; }
    public UUID getCreatedBy() { return createdBy; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }

    public void edit(String text, Status status, OffsetDateTime now) {
        if (text != null) this.text = text;
        if (status != null) this.status = status;
        this.updatedAt = now;
    }

    public void moveTo(int position, OffsetDateTime now) {
        if (this.position != position) {
            this.position = position;
            this.updatedAt = now;
        }
    }
}
