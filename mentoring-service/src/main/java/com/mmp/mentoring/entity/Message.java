package com.mmp.mentoring.entity;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

/** US-33 (PRD-MSG-1) — một tin nhắn trong cuộc trò chuyện của yêu cầu mentoring (conversation_id = id yêu cầu). */
@Entity
@Table(name = "messages")
public class Message {

    public enum SenderRole { MENTEE, MENTOR }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "conversation_id", nullable = false, updatable = false)
    private UUID conversationId;

    @Column(name = "sender_id", nullable = false, updatable = false)
    private UUID senderId;

    @Enumerated(EnumType.STRING)
    @Column(name = "sender_role", nullable = false, updatable = false)
    private SenderRole senderRole;

    /** Nguyên văn người gửi nhập — việc che SĐT/email chỉ làm khi trả về API. */
    @Column(nullable = false, updatable = false)
    private String body;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    protected Message() {
    }

    public Message(UUID conversationId, UUID senderId, SenderRole senderRole, String body, OffsetDateTime now) {
        this.conversationId = conversationId;
        this.senderId = senderId;
        this.senderRole = senderRole;
        this.body = body;
        this.createdAt = now;
    }

    public UUID getId() { return id; }
    public UUID getConversationId() { return conversationId; }
    public UUID getSenderId() { return senderId; }
    public SenderRole getSenderRole() { return senderRole; }
    public String getBody() { return body; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
