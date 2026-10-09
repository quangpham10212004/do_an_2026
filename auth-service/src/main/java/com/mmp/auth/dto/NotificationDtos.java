package com.mmp.auth.dto;

import com.mmp.auth.entity.EmailOutbox;
import com.mmp.auth.entity.NotificationPreferences;
import com.mmp.auth.service.EmailRules;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;
import java.util.UUID;

/** US-38 (PRD-AUTH-2, PRD-NOTI-1..4) — tuỳ chọn email và hàng đợi email thông báo. */
public final class NotificationDtos {

    private NotificationDtos() {
    }

    public record PreferencesView(boolean requests, boolean sessions, boolean messages, boolean reviews, boolean marketing,
                                  boolean quietHours, String quietStart, String quietEnd) {

        public static PreferencesView from(NotificationPreferences p) {
            return new PreferencesView(p.isRequests(), p.isSessions(), p.isMessages(), p.isReviews(), p.isMarketing(),
                    p.isQuietHours(), EmailRules.QUIET_START.toString(), EmailRules.QUIET_END.toString());
        }
    }

    public record PreferencesInput(@NotNull Boolean requests, @NotNull Boolean sessions, @NotNull Boolean messages,
                                   @NotNull Boolean reviews, @NotNull Boolean marketing, @NotNull Boolean quietHours) {
    }

    /**
     * Nội bộ (mentoring-service, ai-service): yêu cầu gửi email cho một thông báo. sessionStartAt chỉ cho nhắc lịch
     * (ngoại lệ giờ yên tĩnh). dedupeKey (tuỳ chọn) chống gửi trùng một sự kiện.
     */
    public record EmailRequest(@NotNull UUID userId, @NotNull EmailRules.Category category,
                               @NotBlank @Size(max = 64) String type, @NotBlank @Size(max = 200) String title,
                               @Size(max = 4000) String message, @Size(max = 500) String link,
                               OffsetDateTime sessionStartAt, @Size(max = 200) String dedupeKey) {
    }

    /** status: PENDING (chờ gửi, có thể hoãn tới hết giờ yên tĩnh) | SKIPPED (người dùng tắt nhóm) | DUPLICATE. */
    public record EmailQueued(UUID id, String status, OffsetDateTime sendAfter, String skipReason) {

        public static EmailQueued from(EmailOutbox e) {
            return new EmailQueued(e.getId(), e.getStatus().name(), e.getSendAfter(), e.getSkipReason());
        }
    }

    /** Dev/e2e — dòng hàng đợi kèm tiêu đề. */
    public record OutboxRow(UUID id, String category, String type, String subject, String status, String skipReason,
                            OffsetDateTime sendAfter, OffsetDateTime sentAt, OffsetDateTime createdAt) {

        public static OutboxRow from(EmailOutbox e) {
            return new OutboxRow(e.getId(), e.getCategory(), e.getType(), e.getSubject(), e.getStatus().name(),
                    e.getSkipReason(), e.getSendAfter(), e.getSentAt(), e.getCreatedAt());
        }
    }
}
