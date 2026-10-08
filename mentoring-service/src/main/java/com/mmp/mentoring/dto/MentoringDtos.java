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

    /** ACCEPT: nhận ngay; INTRO: đồng ý buổi làm quen trước; REJECT: từ chối. */
    public record RespondRequestInput(@NotNull @Pattern(regexp = "ACCEPT|INTRO|REJECT") String decision, @Size(max = 1000) String note) {
    }

    /** Buổi làm quen của một yêu cầu. {@code decisionOpen} = buổi đã kết thúc, hai bên có thể chọn tiếp tục hay không. */
    public record IntroView(UUID sessionId, OffsetDateTime scheduledAt, OffsetDateTime endsAt, String status, boolean decisionOpen) {
    }

    public record RequestView(UUID id, UUID menteeId, String menteeName, UUID mentorId, String mentorName, String message,
                              String status, String responseNote, String menteeDecision, String mentorDecision,
                              IntroView intro, int introDurationMinutes, OffsetDateTime createdAt, OffsetDateTime respondedAt) {
    }

    public record IntroSessionInput(@NotNull @Future OffsetDateTime scheduledAt) {
    }

    public record DecisionInput(@NotNull @Pattern(regexp = "CONTINUE|DECLINE") String decision) {
    }

    // ---------- Sessions ----------

    public record BookSessionInput(
            @NotNull UUID menteeId,
            @NotNull UUID mentorId,
            @NotNull @Future OffsetDateTime scheduledAt,
            @Min(30) @Max(180) Integer durationMinutes,
            @Size(max = 300) String topic,
            /** Dùng 1 buổi trong gói đã mua thay vì trả tiền buổi lẻ. */
            UUID packageId) {
    }

    public record SlotView(OffsetDateTime startAt, OffsetDateTime endAt) {
    }

    public record AvailableSlotsView(String timezone, int durationMinutes, BigDecimal price, List<SlotView> slots) {
    }

    public record CancelSessionInput(@Size(max = 300) String reason) {
    }

    /** Đề xuất (hoặc thực hiện, nếu đủ điều kiện tự áp dụng) dời phiên sang thời điểm mới. */
    public record RescheduleInput(@NotNull @Future OffsetDateTime scheduledAt) {
    }

    public record RescheduleResponseInput(@NotNull Boolean accept) {
    }

    /**
     * {@code type}: INTRO hoặc REGULAR. {@code proposedAt}/{@code proposedBy}: đề xuất đổi lịch đang chờ bên kia.
     * {@code rescheduleLimit}, {@code freeRescheduleHours}: quy tắc để giao diện báo trước cho người dùng.
     */
    public record SessionView(UUID id, UUID requestId, UUID menteeId, String menteeName, UUID mentorId, String mentorName,
                              OffsetDateTime scheduledAt, int durationMinutes, BigDecimal price, String topic,
                              String status, boolean reviewed, Integer reviewRating, OffsetDateTime createdAt,
                              String type, UUID packageId, int rescheduleCount, int rescheduleLimit, long freeRescheduleHours,
                              OffsetDateTime proposedAt, UUID proposedBy) {
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

    // ---------- Gói buổi ----------

    /** Một mức gói mentee có thể mua. {@code savings}: tiết kiệm so với mua lẻ cùng số buổi. */
    public record PackageOption(int sessions, int discountPercent, BigDecimal unitPrice, BigDecimal totalPrice,
                                BigDecimal savings, long validityDays) {
    }

    public record PackageOptionsView(UUID mentorId, int durationMinutes, BigDecimal singlePrice, List<PackageOption> options) {
    }

    public record PurchasePackageInput(@NotNull UUID mentorId, @NotNull @Min(2) @Max(50) Integer sessions,
                                       @Min(30) @Max(180) Integer durationMinutes) {
    }

    public record PackageView(UUID id, UUID menteeId, String menteeName, UUID mentorId, String mentorName,
                              int sessionsTotal, int sessionsRemaining, int durationMinutes, int discountPercent,
                              BigDecimal unitPrice, BigDecimal totalPrice, String status, OffsetDateTime expiresAt,
                              boolean refundPending, BigDecimal refundDue, BigDecimal refundedAmount, OffsetDateTime createdAt) {
    }

    /** Dạng rút gọn cho payment-service gọi nội bộ. */
    public record PackageInternalView(UUID id, UUID menteeId, UUID mentorId, BigDecimal totalPrice, String status) {
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
}
