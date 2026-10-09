package com.mmp.mentoring.controller;

import com.mmp.mentoring.dto.MessagingDtos.*;
import com.mmp.mentoring.security.CurrentUser;
import com.mmp.mentoring.service.MessagingService;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * US-33 (PRD-MSG-1..4) — nhắn tin trong yêu cầu / quan hệ mentoring (cuộc trò chuyện id = id yêu cầu) và hàng đợi
 * kiểm duyệt tin nhắn bị báo cáo.
 */
@RestController
@RequestMapping("/api/mentoring")
public class MessagingController {

    private final MessagingService messaging;

    public MessagingController(MessagingService messaging) {
        this.messaging = messaging;
    }

    @GetMapping("/conversations")
    public List<ConversationSummary> conversations() {
        return messaging.list(CurrentUser.get());
    }

    /** Badge "tin chưa đọc" trên thanh điều hướng. Khai báo trước /conversations/{id} để không bị hiểu là id. */
    @GetMapping("/conversations/unread-count")
    public UnreadCount unreadCount() {
        return messaging.unread(CurrentUser.get());
    }

    /** {@code after} (ISO-8601) = chỉ lấy tin mới hơn mốc này (polling mỗi 10 giây). Mở luồng = đánh dấu đã đọc. */
    @GetMapping("/conversations/{id}")
    public ConversationView conversation(@PathVariable UUID id,
                                         @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime after) {
        return messaging.get(CurrentUser.get(), id, after);
    }

    @PostMapping("/conversations/{id}/messages")
    @ResponseStatus(HttpStatus.CREATED)
    public MessageView send(@PathVariable UUID id, @Valid @RequestBody SendMessageInput in) {
        return messaging.send(CurrentUser.get(), id, in);
    }

    @PostMapping("/messages/{messageId}/report")
    @ResponseStatus(HttpStatus.CREATED)
    public MessageReportView report(@PathVariable UUID messageId, @Valid @RequestBody ReportMessageInput in) {
        return messaging.report(CurrentUser.get(), messageId, in);
    }

    // ---------------------------------------------------------------- ADMIN (người kiểm duyệt)

    @GetMapping("/admin/message-reports")
    @PreAuthorize("hasRole('ADMIN')")
    public List<MessageReportView> reports(@RequestParam(required = false) String status) {
        return messaging.adminList(status);
    }

    @GetMapping("/admin/message-reports/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public MessageReportView reportDetail(@PathVariable UUID id) {
        return messaging.adminGet(CurrentUser.get(), id);
    }

    @PostMapping("/admin/message-reports/{id}/resolve")
    @PreAuthorize("hasRole('ADMIN')")
    public MessageReportView resolve(@PathVariable UUID id, @Valid @RequestBody ResolveReportInput in) {
        return messaging.resolve(CurrentUser.get(), id, in);
    }
}
