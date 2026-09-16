package com.mmp.learning.entity;

import jakarta.persistence.*;

import java.io.Serializable;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "course_progress")
@IdClass(CourseProgress.Key.class)
public class CourseProgress {

    public record Key(UUID courseId, UUID userId) implements Serializable {
        public Key() {
            this(null, null);
        }
    }

    @Id
    @Column(name = "course_id")
    private UUID courseId;

    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "percent_complete", nullable = false)
    private float percentComplete;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    protected CourseProgress() {
    }

    public CourseProgress(UUID courseId, UUID userId) {
        this.courseId = courseId;
        this.userId = userId;
    }

    public UUID getCourseId() { return courseId; }
    public UUID getUserId() { return userId; }
    public float getPercentComplete() { return percentComplete; }

    public void setPercentComplete(float percentComplete) {
        this.percentComplete = percentComplete;
        this.updatedAt = OffsetDateTime.now();
    }

    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
