package com.mmp.mentoring.dto;

import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class MentoringDtos {

    private MentoringDtos() {
    }

    // ---------- Mentoring requests ----------

    public record CreateRequestInput(@NotNull UUID mentorId, @Size(max = 1000) String message) {
    }

    public record RespondRequestInput(@NotNull @Pattern(regexp = "ACCEPT|REJECT") String decision, @Size(max = 1000) String note) {
    }

    public record RequestView(UUID id, UUID menteeId, String menteeName, UUID mentorId, String mentorName, String message,
                              String status, String responseNote, OffsetDateTime createdAt, OffsetDateTime respondedAt) {
    }

    // ---------- Sessions ----------

    public record BookSessionInput(
            @NotNull UUID menteeId,
            @NotNull UUID mentorId,
            @NotNull @Future OffsetDateTime scheduledAt,
            @Min(30) @Max(180) Integer durationMinutes,
            @Size(max = 300) String topic) {
    }

    public record SlotView(OffsetDateTime startAt, OffsetDateTime endAt) {
    }

    public record AvailableSlotsView(String timezone, int durationMinutes, BigDecimal price, List<SlotView> slots) {
    }

    public record CancelSessionInput(@Size(max = 300) String reason) {
    }

    public record SessionView(UUID id, UUID requestId, UUID menteeId, String menteeName, UUID mentorId, String mentorName,
                              OffsetDateTime scheduledAt, int durationMinutes, BigDecimal price, String topic,
                              String status, boolean reviewed, Integer reviewRating, OffsetDateTime createdAt) {
    }

    /** Dạng rút gọn cho payment-service gọi nội bộ. */
    public record SessionInternalView(UUID id, UUID menteeId, UUID mentorId, OffsetDateTime scheduledAt,
                                      int durationMinutes, BigDecimal price, String status) {
    }

    public record PaymentSucceededInput(@NotNull UUID transactionId) {
    }

    public record ReviewInput(@NotNull @Min(1) @Max(5) Integer rating, @Size(max = 2000) String comment) {
    }

    public record ReviewView(UUID id, UUID sessionId, UUID menteeId, String menteeName, UUID mentorId, int rating,
                             String comment, OffsetDateTime createdAt) {
    }

    // ---------- Notifications ----------

    public record NotificationView(UUID id, String type, String title, String message, String link, boolean read,
                                   OffsetDateTime createdAt) {
    }

    public record NotificationList(long unreadCount, List<NotificationView> items) {
    }

    public record AdminStats(long pendingSessions, long confirmedSessions, long completedSessions,
                             long cancelledSessions) {
    }

    // ---------- Internal ----------

    /** Thông báo do service khác (ai-service) tạo qua /internal/notifications. */
    public record NotificationInput(UUID recipientId, String recipientRole, @NotBlank String type,
                                    @NotBlank @Size(max = 200) String title, @NotBlank @Size(max = 2000) String message,
                                    @Size(max = 500) String link) {
    }

    /** Kết quả /internal/relationships — related = có yêu cầu PENDING hoặc ACCEPTED. */
    public record RelationshipView(UUID mentorId, UUID menteeId, boolean related) {
    }
}
