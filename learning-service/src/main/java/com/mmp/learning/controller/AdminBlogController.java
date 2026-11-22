package com.mmp.learning.controller;

import com.mmp.learning.dto.BlogDtos.BlogPostDetail;
import com.mmp.learning.dto.BlogDtos.BlogReportView;
import com.mmp.learning.dto.BlogDtos.ReasonInput;
import com.mmp.learning.security.CurrentUser;
import com.mmp.learning.service.BlogService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import org.springframework.jdbc.core.JdbcTemplate;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** Admin kiểm duyệt blog sau đăng: xem báo cáo, gỡ bài / bình luận vi phạm. */
@RestController
@RequestMapping("/api/learning/admin/blog")
@PreAuthorize("hasRole('ADMIN')")
public class AdminBlogController {

    private final BlogService blog;
    private final JdbcTemplate jdbc;

    public AdminBlogController(BlogService blog, JdbcTemplate jdbc) {
        this.blog = blog;
        this.jdbc = jdbc;
    }

    @GetMapping("/reports")
    public List<BlogReportView> reports(@RequestParam(defaultValue = "OPEN") String status) {
        return blog.reports(status);
    }

    @PostMapping("/posts/{id}/unpublish")
    public BlogPostDetail unpublish(@PathVariable UUID id, @Valid @RequestBody ReasonInput in) {
        return blog.adminUnpublish(CurrentUser.get(), id, in.reason());
    }

    @PostMapping("/comments/{id}/remove")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeComment(@PathVariable UUID id) {
        blog.adminRemoveComment(id);
    }

    @PostMapping("/reports/{id}/resolve")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void resolve(@PathVariable UUID id) {
        blog.resolveReport(id);
    }

    /** Bài đã bị admin gỡ (mới nhất trước), kèm lý do và lượt xem. GET /api/learning/admin/blog/removed */
    public record RemovedPost(UUID id, String slug, String title, UUID authorId, String authorName,
                              OffsetDateTime publishedAt, long views, String unpublishReason, OffsetDateTime unpublishedAt) {
    }

    @GetMapping("/removed")
    public List<RemovedPost> removed() {
        return jdbc.query("""
                SELECT p.id, p.slug, p.title, p.author_id, p.author_name, p.published_at, p.unpublish_reason, p.updated_at,
                       (SELECT count(*) FROM blog_post_views v WHERE v.post_id = p.id) AS views
                FROM blog_posts p WHERE p.status = 'UNPUBLISHED' AND p.unpublish_reason IS NOT NULL
                ORDER BY p.updated_at DESC LIMIT 100
                """, (rs, i) -> new RemovedPost(rs.getObject("id", UUID.class), rs.getString("slug"), rs.getString("title"),
                rs.getObject("author_id", UUID.class), rs.getString("author_name"), rs.getObject("published_at", OffsetDateTime.class),
                rs.getLong("views"), rs.getString("unpublish_reason"), rs.getObject("updated_at", OffsetDateTime.class)));
    }
}
