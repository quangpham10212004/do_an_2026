package com.mmp.learning.controller;

import com.mmp.learning.exception.ApiException;
import com.mmp.learning.security.CurrentUser;
import com.mmp.learning.storage.ObjectStorage;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/learning/blog")
public class BlogCoverController {
    private static final int MAX_BYTES = 5 * 1024 * 1024;
    private final JdbcTemplate jdbc;
    private final ObjectStorage storage;

    public BlogCoverController(JdbcTemplate jdbc, ObjectStorage storage) {
        this.jdbc = jdbc;
        this.storage = storage;
    }

    public record CoverUrl(String url) {}
    private record Image(String mediaType, byte[] content, String storageKey) {}

    @PostMapping("/uploads/cover")
    @PreAuthorize("hasAnyRole('MENTOR', 'MENTEE')")
    @Transactional
    public CoverUrl upload(@RequestParam MultipartFile file) throws IOException {
        if (file.isEmpty() || file.getSize() > MAX_BYTES) {
            throw ApiException.badRequest("BLOG_COVER_SIZE", "Ảnh bìa tối đa 5 MB.");
        }
        byte[] bytes = file.getBytes();
        MediaType type = imageType(bytes);
        UUID owner = CurrentUser.get().userId();
        jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtext(?::text))", Object.class, "blog-cover:" + owner);
        Long recent = jdbc.queryForObject("SELECT COUNT(*) FROM blog_cover_images "
                + "WHERE owner_id = ? AND created_at > now() - interval '1 hour'", Long.class, owner);
        if (recent != null && recent >= 20) {
            throw new ApiException(org.springframework.http.HttpStatus.TOO_MANY_REQUESTS, "BLOG_COVER_LIMIT",
                    "Bạn tải ảnh bìa quá nhanh, hãy thử lại sau.");
        }
        UUID id = UUID.randomUUID();
        if (storage.enabled()) {
            // Lưu file trước khi ghi hàng: giao dịch lỗi chỉ để lại một file mồ côi, không có hàng trỏ vào file không tồn tại.
            String key = "blog-covers/" + id;
            storage.put(key, bytes, type.toString());
            jdbc.update("INSERT INTO blog_cover_images (id, owner_id, media_type, storage_key) VALUES (?, ?, ?, ?)",
                    id, owner, type.toString(), key);
        } else {
            jdbc.update("INSERT INTO blog_cover_images (id, owner_id, media_type, content) VALUES (?, ?, ?, ?)",
                    id, owner, type.toString(), bytes);
        }
        return new CoverUrl("/api/learning/blog/covers/" + id);
    }

    @GetMapping("/covers/{id}")
    public ResponseEntity<byte[]> cover(@PathVariable UUID id) {
        Image image = jdbc.query("SELECT media_type, content, storage_key FROM blog_cover_images WHERE id = ?",
                (rs, n) -> new Image(rs.getString(1), rs.getBytes(2), rs.getString(3)), id).stream().findFirst()
                .orElseThrow(() -> ApiException.notFound("BLOG_COVER_NOT_FOUND", "Không tìm thấy ảnh bìa."));
        byte[] content = image.storageKey() == null ? image.content() : storage.get(image.storageKey());
        if (content == null) throw ApiException.notFound("BLOG_COVER_NOT_FOUND", "Không tìm thấy ảnh bìa.");
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(image.mediaType()))
                .header("X-Content-Type-Options", "nosniff")
                .cacheControl(CacheControl.maxAge(1, TimeUnit.DAYS).cachePublic()).body(content);
    }

    private static MediaType imageType(byte[] image) {
        String header = new String(image, 0, Math.min(image.length, 12), StandardCharsets.ISO_8859_1);
        if (header.startsWith("\u0089PNG\r\n\u001a\n")) return MediaType.IMAGE_PNG;
        if (header.startsWith("\u00ff\u00d8\u00ff")) return MediaType.IMAGE_JPEG;
        if (header.startsWith("GIF87a") || header.startsWith("GIF89a")) return MediaType.IMAGE_GIF;
        if (header.startsWith("RIFF") && header.endsWith("WEBP")) return MediaType.parseMediaType("image/webp");
        throw ApiException.badRequest("BLOG_COVER_TYPE", "Chỉ nhận ảnh PNG, JPG, WebP hoặc GIF.");
    }
}
