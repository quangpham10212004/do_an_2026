package com.mmp.profile.entity;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

/** US-37 (PRD-PROF-3) — ảnh đại diện JPG/PNG ≤ 2 MB, 1 ảnh / người dùng (mentor hoặc mentee). */
@Entity
@Table(name = "profile_avatars")
public class ProfileAvatar {

    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "content_type", nullable = false)
    private String contentType;

    @Column(nullable = false)
    private byte[] data;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected ProfileAvatar() {
    }

    public ProfileAvatar(UUID userId, String contentType, byte[] data, OffsetDateTime now) {
        this.userId = userId;
        this.contentType = contentType;
        this.data = data;
        this.updatedAt = now;
    }

    public UUID getUserId() { return userId; }
    public String getContentType() { return contentType; }
    public byte[] getData() { return data; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
