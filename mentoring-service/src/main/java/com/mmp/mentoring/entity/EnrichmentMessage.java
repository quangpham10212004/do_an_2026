package com.mmp.mentoring.entity;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "enrichment_messages")
public class EnrichmentMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "conversation_id", nullable = false)
    private UUID conversationId;

    @Column(name = "turn_no", nullable = false)
    private int turnNo;

    @Column(nullable = false)
    private String slot;

    @Column(nullable = false)
    private String question;

    private String answer;

    @Column(name = "asked_at", nullable = false, updatable = false)
    private OffsetDateTime askedAt = OffsetDateTime.now();

    @Column(name = "answered_at")
    private OffsetDateTime answeredAt;

    protected EnrichmentMessage() {
    }

    public EnrichmentMessage(UUID conversationId, int turnNo, String slot, String question) {
        this.conversationId = conversationId;
        this.turnNo = turnNo;
        this.slot = slot;
        this.question = question;
    }

    public UUID getId() { return id; }
    public UUID getConversationId() { return conversationId; }
    public int getTurnNo() { return turnNo; }
    public String getSlot() { return slot; }
    public String getQuestion() { return question; }
    public String getAnswer() { return answer; }
    public void setAnswer(String answer) { this.answer = answer; }
    public OffsetDateTime getAskedAt() { return askedAt; }
    public OffsetDateTime getAnsweredAt() { return answeredAt; }
    public void setAnsweredAt(OffsetDateTime answeredAt) { this.answeredAt = answeredAt; }
}
