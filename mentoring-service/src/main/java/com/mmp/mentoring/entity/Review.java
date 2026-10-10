package com.mmp.mentoring.entity;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "reviews")
public class Review {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "session_id", nullable = false, unique = true)
    private UUID sessionId;

    @Column(name = "mentee_id", nullable = false)
    private UUID menteeId;

    @Column(name = "mentor_id", nullable = false)
    private UUID mentorId;

    @Column(nullable = false)
    private int rating;

    private String comment;

    /** US-41 (PRD-REV-2) — điểm thành phần 1–5 (null ở đánh giá trước US-41). */
    private Integer knowledge;

    private Integer clarity;

    private Integer preparation;

    @Column(columnDefinition = "text[]", nullable = false)
    private String[] tags = new String[0];

    @Column(name = "updated_at")
    private OffsetDateTime updatedAt;

    /** PRD-REV-3 — 1 phản hồi công khai của mentor. */
    @Column(name = "mentor_reply")
    private String mentorReply;

    @Column(name = "mentor_replied_at")
    private OffsetDateTime mentorRepliedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    protected Review() {
    }

    public Review(UUID sessionId, UUID menteeId, UUID mentorId, int rating, String comment) {
        this.sessionId = sessionId;
        this.menteeId = menteeId;
        this.mentorId = mentorId;
        this.rating = rating;
        this.comment = comment;
    }

    /** Ghi / sửa nội dung đánh giá (PRD-REV-1/2). */
    public void write(int rating, Integer knowledge, Integer clarity, Integer preparation, String comment, String[] tags,
                      OffsetDateTime now, boolean edit) {
        this.rating = rating;
        this.knowledge = knowledge;
        this.clarity = clarity;
        this.preparation = preparation;
        this.comment = comment;
        this.tags = tags;
        if (edit) this.updatedAt = now;
    }

    public void reply(String text, OffsetDateTime now) {
        this.mentorReply = text;
        this.mentorRepliedAt = now;
    }

    public Integer getKnowledge() { return knowledge; }
    public Integer getClarity() { return clarity; }
    public Integer getPreparation() { return preparation; }
    public String[] getTags() { return tags; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
    public String getMentorReply() { return mentorReply; }
    public OffsetDateTime getMentorRepliedAt() { return mentorRepliedAt; }
    public UUID getId() { return id; }
    public UUID getSessionId() { return sessionId; }
    public UUID getMenteeId() { return menteeId; }
    public UUID getMentorId() { return mentorId; }
    public int getRating() { return rating; }
    public String getComment() { return comment; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
