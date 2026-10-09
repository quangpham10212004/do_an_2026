package com.mmp.mentoring.service;

import com.mmp.mentoring.client.EmailClient;
import com.mmp.mentoring.dto.MentoringDtos.NotificationList;
import com.mmp.mentoring.dto.MentoringDtos.NotificationView;
import com.mmp.mentoring.entity.Notification;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.NotificationRepository;
import com.mmp.mentoring.security.AuthUser;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.UUID;

/** Thông báo trong ứng dụng (FR-5.5 và các sự kiện nghiệp vụ khác). */
@Service
public class NotificationService {

    private final NotificationRepository repository;
    private final EmailClient emailClient;

    public NotificationService(NotificationRepository repository, EmailClient emailClient) {
        this.repository = repository;
        this.emailClient = emailClient;
    }

    /** Thông báo trong ứng dụng; loại có ✉ (US-38, EmailClient.CATEGORIES) còn được chuyển sang auth-service gửi email. */
    @Transactional
    public void notifyUser(UUID userId, String type, String title, String message, String link) {
        notifyUser(userId, type, title, message, link, null);
    }

    /** sessionStart — nhắc lịch (US-34): email nhắc phiên nằm trong giờ yên tĩnh vẫn được gửi ngay. */
    @Transactional
    public void notifyUser(UUID userId, String type, String title, String message, String link, OffsetDateTime sessionStart) {
        repository.save(new Notification(userId, null, type, title, message, link));
        emailClient.maybeSend(userId, type, title, message, link, sessionStart);
    }

    /** PRD-NOTI-3 — giữ thông báo 90 ngày; job mỗi ngày 03:45 xoá thông báo cũ hơn. */
    @org.springframework.scheduling.annotation.Scheduled(cron = "${app.notifications.retention-cron:0 45 3 * * *}",
            zone = "${app.timezone}")
    @Transactional
    public void purgeOld() {
        int n = repository.deleteOlderThan(OffsetDateTime.now().minusDays(RETENTION_DAYS));
        if (n > 0) org.slf4j.LoggerFactory.getLogger(NotificationService.class).info("Purged {} notifications older than {} days", n, RETENTION_DAYS);
    }

    public static final int RETENTION_DAYS = 90;

    @Transactional
    public void notifyRole(String role, String type, String title, String message, String link) {
        repository.save(new Notification(null, role, type, title, message, link));
    }

    @Transactional(readOnly = true)
    public NotificationList list(AuthUser user, int limit) {
        var items = repository.findForUser(user.userId(), user.role(), PageRequest.of(0, Math.min(Math.max(limit, 1), 100)))
                .stream().map(n -> new NotificationView(n.getId(), n.getType(), n.getTitle(), n.getMessage(), n.getLink(),
                        n.isRead(), n.getCreatedAt())).toList();
        return new NotificationList(repository.countUnread(user.userId(), user.role()), items);
    }

    @Transactional
    public void markRead(AuthUser user, UUID id) {
        Notification n = repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("NOTIFICATION_NOT_FOUND", "Không tìm thấy thông báo"));
        boolean mine = user.userId().equals(n.getRecipientId())
                || (n.getRecipientId() == null && user.role().equals(n.getRecipientRole()));
        if (!mine) {
            throw ApiException.forbidden("Không thể thao tác thông báo của người khác");
        }
        n.setRead(true);
    }

    @Transactional
    public int markAllRead(AuthUser user) {
        return repository.markAllRead(user.userId(), user.role());
    }
}
