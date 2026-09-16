package com.mmp.mentoring.service;

import com.mmp.mentoring.dto.MentoringDtos.NotificationList;
import com.mmp.mentoring.dto.MentoringDtos.NotificationView;
import com.mmp.mentoring.entity.Notification;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.NotificationRepository;
import com.mmp.mentoring.security.AuthUser;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/** Thông báo trong ứng dụng (FR-5.5 và các sự kiện nghiệp vụ khác). */
@Service
public class NotificationService {

    private final NotificationRepository repository;

    public NotificationService(NotificationRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public void notifyUser(UUID userId, String type, String title, String message, String link) {
        repository.save(new Notification(userId, null, type, title, message, link));
    }

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
