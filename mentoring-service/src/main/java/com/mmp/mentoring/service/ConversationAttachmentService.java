package com.mmp.mentoring.service;

import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.MentoringRequestRepository;
import com.mmp.mentoring.security.AuthUser;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
public class ConversationAttachmentService {
    private static final long MAX_BYTES = 10L * 1024 * 1024;
    private static final Pattern BLOCKED = Pattern.compile("\\.(exe|bat|cmd|msi|scr|js|vbs|sh|apk|dmg)$",
            Pattern.CASE_INSENSITIVE);
    private final MentoringRequestRepository requests;
    private final JdbcTemplate jdbc;

    public ConversationAttachmentService(MentoringRequestRepository requests, JdbcTemplate jdbc) {
        this.requests = requests;
        this.jdbc = jdbc;
    }

    public record Attachment(UUID id, UUID conversationId, String name, long size, String mime,
                             OffsetDateTime createdAt, String url, boolean mine) {}
    public record Download(String name, byte[] content) {}

    public List<Attachment> list(AuthUser user, UUID conversation) {
        requireParticipant(user, conversation);
        return jdbc.query("""
                SELECT id, name, size, mime, created_at, uploader_id
                FROM (SELECT id, name, size, mime, created_at, uploader_id FROM conversation_attachments
                      WHERE conversation_id = ? ORDER BY created_at DESC, id DESC LIMIT 200) recent
                ORDER BY created_at, id
                """, (rs, n) -> {
            UUID id = rs.getObject("id", UUID.class);
            return new Attachment(id, conversation, rs.getString("name"), rs.getLong("size"), rs.getString("mime"),
                    rs.getObject("created_at", OffsetDateTime.class), url(conversation, id),
                    user.userId().equals(rs.getObject("uploader_id", UUID.class)));
        }, conversation);
    }

    @Transactional(rollbackFor = IOException.class)
    public Attachment upload(AuthUser user, UUID conversation, MultipartFile file) throws IOException {
        var request = requireParticipant(user, conversation);
        MessageRules.requireWritable(MessagingService.status(request), MessagingService.closedAt(request), OffsetDateTime.now());
        if (!"ACCEPTED".equals(MessagingService.status(request))) {
            throw ApiException.conflict("ATTACHMENTS_REQUIRE_ACCEPTANCE", "Chỉ gửi tệp sau khi yêu cầu đã được chấp nhận.");
        }
        String raw = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().replace('\\', '/');
        String name = raw.substring(raw.lastIndexOf('/') + 1).replaceAll("[\\p{Cntrl}]", "").strip();
        if (name.isEmpty() || name.length() > 240 || BLOCKED.matcher(name).find()) {
            throw ApiException.badRequest("ATTACHMENT_NAME_INVALID", "Tên hoặc loại tệp không hợp lệ.");
        }
        if (file.isEmpty() || file.getSize() > MAX_BYTES) {
            throw ApiException.badRequest("ATTACHMENT_SIZE_INVALID", "Chọn tệp có dung lượng tối đa 10 MB.");
        }
        UUID owner = user.userId();
        jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtext(?::text))", Object.class, "attachment:" + owner);
        Long count = jdbc.queryForObject("SELECT COUNT(*) FROM conversation_attachments "
                + "WHERE uploader_id = ? AND created_at > now() - interval '1 hour'", Long.class, owner);
        if (count != null && count >= 15) {
            throw new ApiException(org.springframework.http.HttpStatus.TOO_MANY_REQUESTS, "ATTACHMENT_RATE_LIMIT",
                    "Bạn tải tệp quá nhanh, hãy thử lại sau.");
        }
        UUID id = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now();
        String mime = "application/octet-stream";
        jdbc.update("""
                INSERT INTO conversation_attachments (id, conversation_id, uploader_id, name, mime, size, content, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, id, conversation, owner, name, mime, file.getSize(), file.getBytes(), now);
        return new Attachment(id, conversation, name, file.getSize(), mime, now, url(conversation, id), true);
    }

    public Download download(AuthUser user, UUID conversation, UUID attachment) {
        requireParticipant(user, conversation);
        return jdbc.query("SELECT name, content FROM conversation_attachments WHERE conversation_id = ? AND id = ?",
                (rs, n) -> new Download(rs.getString(1), rs.getBytes(2)), conversation, attachment)
                .stream().findFirst().orElseThrow(() -> ApiException.notFound("ATTACHMENT_NOT_FOUND", "Không tìm thấy tệp."));
    }

    private com.mmp.mentoring.entity.MentoringRequest requireParticipant(AuthUser user, UUID conversation) {
        var request = requests.findById(conversation)
                .orElseThrow(() -> ApiException.notFound("CONVERSATION_NOT_FOUND", "Không tìm thấy cuộc trò chuyện"));
        MessagingService.requireParticipant(user, request);
        return request;
    }

    private static String url(UUID conversation, UUID attachment) {
        return "/api/mentoring/conversations/" + conversation + "/attachments/" + attachment;
    }
}
