package com.mmp.auth.entity;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

/** US-38 (PRD-NOTI-1, NOTI-4) — tuỳ chọn email theo nhóm + giờ yên tĩnh. */
@Entity
@Table(name = "notification_preferences")
public class NotificationPreferences {

    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Column(nullable = false)
    private boolean requests = true;

    @Column(nullable = false)
    private boolean sessions = true;

    @Column(nullable = false)
    private boolean messages = true;

    @Column(nullable = false)
    private boolean reviews = true;

    @Column(nullable = false)
    private boolean marketing = false;

    @Column(name = "quiet_hours", nullable = false)
    private boolean quietHours = true;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    protected NotificationPreferences() {
    }

    /** Giá trị mặc định cho người dùng chưa lưu tuỳ chọn. */
    public static NotificationPreferences defaults(UUID userId) {
        NotificationPreferences p = new NotificationPreferences();
        p.userId = userId;
        return p;
    }

    public void update(boolean requests, boolean sessions, boolean messages, boolean reviews, boolean marketing,
                       boolean quietHours, OffsetDateTime now) {
        this.requests = requests;
        this.sessions = sessions;
        this.messages = messages;
        this.reviews = reviews;
        this.marketing = marketing;
        this.quietHours = quietHours;
        this.updatedAt = now;
    }

    public UUID getUserId() { return userId; }
    public boolean isRequests() { return requests; }
    public boolean isSessions() { return sessions; }
    public boolean isMessages() { return messages; }
    public boolean isReviews() { return reviews; }
    public boolean isMarketing() { return marketing; }
    public boolean isQuietHours() { return quietHours; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
