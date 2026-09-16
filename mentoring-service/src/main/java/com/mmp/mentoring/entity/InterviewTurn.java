package com.mmp.mentoring.entity;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "interview_turns")
public class InterviewTurn {

    /** OPENING: câu mở đầu; DEEPEN: đào sâu cùng chủ đề; PIVOT: chuyển sang chủ đề liên quan */
    public enum Strategy { OPENING, DEEPEN, PIVOT }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "interview_id", nullable = false)
    private UUID interviewId;

    @Column(name = "turn_no", nullable = false)
    private int turnNo;

    @Column(nullable = false)
    private String topic;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Strategy strategy;

    @Column(nullable = false)
    private String question;

    private String answer;
    private Float score;
    private String feedback;

    @Column(name = "asked_at", nullable = false, updatable = false)
    private OffsetDateTime askedAt = OffsetDateTime.now();

    @Column(name = "answered_at")
    private OffsetDateTime answeredAt;

    protected InterviewTurn() {
    }

    public InterviewTurn(UUID interviewId, int turnNo, String topic, Strategy strategy, String question) {
        this.interviewId = interviewId;
        this.turnNo = turnNo;
        this.topic = topic;
        this.strategy = strategy;
        this.question = question;
    }

    public UUID getId() { return id; }
    public UUID getInterviewId() { return interviewId; }
    public int getTurnNo() { return turnNo; }
    public String getTopic() { return topic; }
    public Strategy getStrategy() { return strategy; }
    public String getQuestion() { return question; }
    public String getAnswer() { return answer; }
    public void setAnswer(String answer) { this.answer = answer; }
    public Float getScore() { return score; }
    public void setScore(Float score) { this.score = score; }
    public String getFeedback() { return feedback; }
    public void setFeedback(String feedback) { this.feedback = feedback; }
    public OffsetDateTime getAskedAt() { return askedAt; }
    public OffsetDateTime getAnsweredAt() { return answeredAt; }
    public void setAnsweredAt(OffsetDateTime answeredAt) { this.answeredAt = answeredAt; }
}
