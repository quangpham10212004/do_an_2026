package com.mmp.mentoring.dto;

import com.mmp.mentoring.entity.MessageReport;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** US-33 (PRD-MSG-1..4) — DTO nhắn tin và hồ sơ kiểm duyệt tin nhắn. */
public final class MessagingDtos {

    private MessagingDtos() {
    }

    /** body đã che SĐT/email nếu cặp chưa có phiên trả phí đã xác nhận (người kiểm duyệt luôn thấy nguyên văn). */
    public record MessageView(UUID id, UUID senderId, String senderRole, String body, boolean mine, OffsetDateTime createdAt) {
    }

    /** Một dòng trong hộp thư: id = id yêu cầu mentoring. */
    public record ConversationSummary(UUID id, UUID counterpartId, String counterpartName, String counterpartRole,
                                      String requestStatus, String lastMessage, OffsetDateTime lastMessageAt,
                                      boolean lastFromMe, long unread, boolean writable) {
    }

    /**
     * Luồng tin nhắn (cũ → mới). contactsMasked = SĐT/email đang bị che; remainingBeforeAccept = số tin mentee còn gửi
     * được trước khi được chấp nhận (null khi không giới hạn); readOnlyAt = lúc cuộc trò chuyện chuyển chỉ đọc (null khi
     * yêu cầu còn mở).
     */
    public record ConversationView(ConversationSummary conversation, List<MessageView> messages, boolean contactsMasked,
                                   Integer remainingBeforeAccept, OffsetDateTime readOnlyAt, int pollIntervalSeconds) {
    }

    public record SendMessageInput(@NotNull @Size(max = 4000) String body) {
    }

    public record UnreadCount(long unread) {
    }

    public record ReportMessageInput(@NotNull MessageReport.Reason reason, @Size(max = 1000) String note) {
    }

    public record ResolveReportInput(@NotNull MessageReport.Outcome outcome, @Size(max = 1000) String note) {
    }

    /**
     * Hồ sơ kiểm duyệt. reportedMessage luôn có (nguyên văn); thread = toàn bộ cuộc trò chuyện, CHỈ trả khi hồ sơ còn OPEN
     * (PRD-MSG-4) — hồ sơ đã đóng trả null.
     */
    public record MessageReportView(UUID id, UUID conversationId, UUID reporterId, String reporterName, String reason,
                                    String note, String status, String outcome, String resolutionNote,
                                    OffsetDateTime createdAt, OffsetDateTime resolvedAt, MessageView reportedMessage,
                                    String senderName, List<MessageView> thread) {
    }
}
