package com.mmp.learning.entity;

import jakarta.persistence.*;

import java.util.UUID;

@Entity
@Table(name = "roadmap_items")
public class RoadmapItem {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "roadmap_id", nullable = false)
    private UUID roadmapId;

    @Column(nullable = false)
    private String title;

    private String description;

    @Column(name = "order_index", nullable = false)
    private int orderIndex;

    @Column(name = "course_id")
    private UUID courseId;

    public UUID getId() { return id; }
    public UUID getRoadmapId() { return roadmapId; }
    public void setRoadmapId(UUID roadmapId) { this.roadmapId = roadmapId; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public int getOrderIndex() { return orderIndex; }
    public void setOrderIndex(int orderIndex) { this.orderIndex = orderIndex; }
    public UUID getCourseId() { return courseId; }
    public void setCourseId(UUID courseId) { this.courseId = courseId; }
}
