package com.mmp.mentoring.controller;

import com.mmp.mentoring.dto.MentoringDtos.NotificationInput;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.service.NotificationService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Endpoint nội bộ để service khác tạo thông báo trong ứng dụng.
 * mentoring-service sở hữu bảng notifications; ai-service dùng endpoint này để báo
 * kết quả AI Interview cho admin/mentor và báo hồ sơ đã được làm giàu cho mentee.
 */
@RestController
@RequestMapping("/internal/notifications")
public class InternalNotificationController {

    private final NotificationService notifications;

    public InternalNotificationController(NotificationService notifications) {
        this.notifications = notifications;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void create(@Valid @RequestBody NotificationInput in) {
        if (in.recipientId() != null) {
            notifications.notifyUser(in.recipientId(), in.type(), in.title(), in.message(), in.link());
        } else if (in.recipientRole() != null && !in.recipientRole().isBlank()) {
            notifications.notifyRole(in.recipientRole(), in.type(), in.title(), in.message(), in.link());
        } else {
            throw ApiException.badRequest("RECIPIENT_REQUIRED", "Cần recipientId hoặc recipientRole");
        }
    }
}
