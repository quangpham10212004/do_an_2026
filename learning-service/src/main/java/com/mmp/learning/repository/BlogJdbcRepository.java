package com.mmp.learning.repository;

import com.mmp.learning.dto.BlogDtos.BlogComment;
import com.mmp.learning.dto.BlogDtos.BlogReportView;
import com.mmp.learning.dto.BlogDtos.BlogTag;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Truy cập dữ liệu blog bằng JDBC (nhiều bảng quan hệ nhỏ + đếm sẵn nên SQL thuần gọn hơn entity).
 * Các thao tác ghi nhiều bảng phải được gọi trong một transaction ở BlogService.
 */
@Repository
public class BlogJdbcRepository {

    public record PostRow(UUID id, UUID authorId, String authorName, String authorRole, String title, String slug,
                          String summary, String contentMd, String coverUrl, String status, String unpublishReason,
                          int readingMinutes, int likeCount, int commentCount, OffsetDateTime publishedAt,
                          OffsetDateTime createdAt) {
    }

    public record PostPage(List<PostRow> rows, long total) {
    }

    public record CommentRow(UUID id, UUID postId, UUID parentId, UUID authorId, String authorName, String body, String status,
                             OffsetDateTime createdAt) {
        public BlogComment toView(boolean hideBody) {
            return new BlogComment(id, postId, parentId, authorId, authorName, hideBody ? "" : body, status, createdAt);
        }
    }

    private static final RowMapper<PostRow> POST = (rs, i) -> new PostRow(
            rs.getObject("id", UUID.class), rs.getObject("author_id", UUID.class), rs.getString("author_name"),
            rs.getString("author_role"), rs.getString("title"), rs.getString("slug"), rs.getString("summary"),
            rs.getString("content_md"), rs.getString("cover_url"), rs.getString("status"),
            rs.getString("unpublish_reason"), rs.getInt("reading_minutes"), rs.getInt("like_count"),
            rs.getInt("comment_count"), rs.getObject("published_at", OffsetDateTime.class),
            rs.getObject("created_at", OffsetDateTime.class));

    private static final RowMapper<CommentRow> COMMENT = (rs, i) -> new CommentRow(
            rs.getObject("id", UUID.class), rs.getObject("post_id", UUID.class), rs.getObject("parent_id", UUID.class),
            rs.getObject("author_id", UUID.class), rs.getString("author_name"), rs.getString("body"),
            rs.getString("status"), rs.getObject("created_at", OffsetDateTime.class));

    private static final String POST_COLUMNS = "p.id, p.author_id, p.author_name, p.author_role, p.title, p.slug, p.summary, "
            + "p.content_md, p.cover_url, p.status, p.unpublish_reason, p.reading_minutes, p.like_count, p.comment_count, "
            + "p.published_at, p.created_at";

    private final JdbcTemplate jdbc;

    public BlogJdbcRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ---------------- Bài viết ----------------

    public void insertPost(PostRow p) {
        jdbc.update("INSERT INTO blog_posts (id, author_id, author_name, author_role, title, slug, summary, content_md, cover_url, "
                        + "status, reading_minutes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                p.id(), p.authorId(), p.authorName(), p.authorRole(), p.title(), p.slug(), p.summary(), p.contentMd(),
                p.coverUrl(), p.status(), p.readingMinutes());
    }

    /** Sửa nội dung; slug giữ nguyên sau khi đã đăng nên không nằm trong câu lệnh này. */
    public void updatePost(UUID id, String authorName, String title, String summary, String contentMd, String coverUrl,
                           int readingMinutes) {
        jdbc.update("UPDATE blog_posts SET author_name = ?, title = ?, summary = ?, content_md = ?, cover_url = ?, "
                        + "reading_minutes = ?, updated_at = now() WHERE id = ?",
                authorName, title, summary, contentMd, coverUrl, readingMinutes, id);
    }

    public void updateSlug(UUID id, String slug) {
        jdbc.update("UPDATE blog_posts SET slug = ? WHERE id = ?", slug, id);
    }

    public void publish(UUID id) {
        jdbc.update("UPDATE blog_posts SET status = 'PUBLISHED', unpublish_reason = NULL, "
                + "published_at = COALESCE(published_at, now()), updated_at = now() WHERE id = ?", id);
    }

    public void toDraft(UUID id) {
        jdbc.update("UPDATE blog_posts SET status = 'DRAFT', updated_at = now() WHERE id = ?", id);
    }

    public void takeDown(UUID id, String reason) {
        jdbc.update("UPDATE blog_posts SET status = 'UNPUBLISHED', unpublish_reason = ?, updated_at = now() WHERE id = ?",
                reason, id);
    }

    public void deletePost(UUID id) {
        jdbc.update("DELETE FROM blog_posts WHERE id = ?", id);
    }

    public Optional<PostRow> findById(UUID id) {
        return jdbc.query("SELECT " + POST_COLUMNS + " FROM blog_posts p WHERE p.id = ?", POST, id).stream().findFirst();
    }

    public Optional<PostRow> findBySlug(String slug) {
        return jdbc.query("SELECT " + POST_COLUMNS + " FROM blog_posts p WHERE p.slug = ?", POST, slug).stream().findFirst();
    }

    public boolean slugExists(String slug) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM blog_posts WHERE slug = ?", Integer.class, slug);
        return n != null && n > 0;
    }

    public String visibility(UUID id) {
        return jdbc.queryForObject("SELECT visibility FROM blog_posts WHERE id = ?", String.class, id);
    }

    public void setVisibility(UUID id, String visibility) {
        jdbc.update("UPDATE blog_posts SET visibility = ? WHERE id = ?", visibility, id);
    }

    public void recordView(UUID id, UUID viewerId) {
        jdbc.update("""
                INSERT INTO blog_post_views (post_id, viewer_id)
                SELECT id, ? FROM blog_posts WHERE id = ? AND status = 'PUBLISHED' AND author_id <> ?
                ON CONFLICT DO NOTHING
                """, viewerId, id, viewerId);
    }

    public Map<UUID, Long> viewCounts(List<UUID> ids, UUID userId) {
        if (ids.isEmpty()) return Map.of();
        String placeholders = String.join(",", java.util.Collections.nCopies(ids.size(), "?"));
        List<Object> args = new ArrayList<>(ids);
        args.add(userId);
        Map<UUID, Long> counts = new HashMap<>();
        jdbc.query("SELECT p.id, COUNT(v.viewer_id) FROM blog_posts p LEFT JOIN blog_post_views v ON v.post_id = p.id "
                        + "WHERE p.id IN (" + placeholders + ") AND (p.status = 'PUBLISHED' OR p.author_id = ?) GROUP BY p.id",
                rs -> { counts.put(rs.getObject(1, UUID.class), rs.getLong(2)); }, args.toArray());
        return counts;
    }

    /** Khoá dòng bài khi cần cập nhật bộ đếm an toàn. */
    public Optional<PostRow> lockById(UUID id) {
        return jdbc.query("SELECT " + POST_COLUMNS + " FROM blog_posts p WHERE p.id = ? FOR UPDATE", POST, id)
                .stream().findFirst();
    }

    /** Danh sách bài PUBLISHED, mới nhất trước. {@code followerId} khác null = chỉ bài của người đang theo dõi. */
    public PostPage listPublished(String tagSlug, String q, UUID authorId, UUID followerId, int page, int size) {
        StringBuilder where = new StringBuilder(" WHERE p.status = 'PUBLISHED' AND p.visibility = 'PUBLIC'");
        List<Object> args = new ArrayList<>();
        if (authorId != null) {
            where.append(" AND p.author_id = ?");
            args.add(authorId);
        }
        if (followerId != null) {
            where.append(" AND p.author_id IN (SELECT author_id FROM blog_follows WHERE follower_id = ?)");
            args.add(followerId);
        }
        if (tagSlug != null) {
            where.append(" AND EXISTS (SELECT 1 FROM blog_post_tags pt JOIN blog_tags t ON t.id = pt.tag_id "
                    + "WHERE pt.post_id = p.id AND t.slug = ?)");
            args.add(tagSlug);
        }
        if (q != null) {
            where.append(" AND (p.search_vec @@ plainto_tsquery('simple', ?) OR p.title ILIKE ?)");
            args.add(q);
            args.add("%" + escapeLike(q) + "%");
        }
        Long total = jdbc.queryForObject("SELECT COUNT(*) FROM blog_posts p" + where, Long.class, args.toArray());
        List<Object> pageArgs = new ArrayList<>(args);
        pageArgs.add(size);
        pageArgs.add((long) page * size);
        List<PostRow> rows = jdbc.query("SELECT " + POST_COLUMNS + " FROM blog_posts p" + where
                + " ORDER BY p.published_at DESC, p.id LIMIT ? OFFSET ?", POST, pageArgs.toArray());
        return new PostPage(rows, total == null ? 0 : total);
    }

    public List<PostRow> byAuthor(UUID authorId) {
        return jdbc.query("SELECT " + POST_COLUMNS + " FROM blog_posts p WHERE p.author_id = ? ORDER BY p.updated_at DESC",
                POST, authorId);
    }

    public List<PostRow> bookmarked(UUID userId) {
        return jdbc.query("SELECT " + POST_COLUMNS + " FROM blog_posts p JOIN blog_bookmarks b ON b.post_id = p.id "
                + "WHERE b.user_id = ? AND p.status = 'PUBLISHED' ORDER BY b.created_at DESC", POST, userId);
    }

    public long countPostsSince(UUID authorId, OffsetDateTime since) {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM blog_posts WHERE author_id = ? AND created_at >= ?",
                Long.class, authorId, since);
        return n == null ? 0 : n;
    }

    public long publishedCount(UUID authorId) {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM blog_posts WHERE author_id = ? AND status = 'PUBLISHED' AND visibility = 'PUBLIC'",
                Long.class, authorId);
        return n == null ? 0 : n;
    }

    // ---------------- Tag ----------------

    public Map<UUID, List<String>> tagNames(List<UUID> postIds) {
        Map<UUID, List<String>> result = new HashMap<>();
        if (postIds.isEmpty()) return result;
        String in = String.join(",", postIds.stream().map(x -> "?").toList());
        jdbc.query("SELECT pt.post_id, t.name FROM blog_post_tags pt JOIN blog_tags t ON t.id = pt.tag_id "
                        + "WHERE pt.post_id IN (" + in + ") ORDER BY t.name",
                rs -> {
                    result.computeIfAbsent(rs.getObject("post_id", UUID.class), k -> new ArrayList<>()).add(rs.getString("name"));
                }, postIds.toArray());
        return result;
    }

    /** Thay toàn bộ tag của bài; tag chưa có thì tạo (slug duy nhất, tên giữ theo lần tạo đầu). */
    public void replaceTags(UUID postId, Map<String, String> slugToName) {
        jdbc.update("DELETE FROM blog_post_tags WHERE post_id = ?", postId);
        for (Map.Entry<String, String> e : slugToName.entrySet()) {
            jdbc.update("INSERT INTO blog_tags (name, slug) VALUES (?, ?) ON CONFLICT (slug) DO NOTHING", e.getValue(), e.getKey());
            jdbc.update("INSERT INTO blog_post_tags (post_id, tag_id) SELECT ?, id FROM blog_tags WHERE slug = ? "
                    + "ON CONFLICT DO NOTHING", postId, e.getKey());
        }
    }

    /** Tag có bài đang đăng, nhiều bài trước. */
    public List<BlogTag> tagsWithCounts() {
        return jdbc.query("SELECT t.name, t.slug, COUNT(p.id) AS cnt FROM blog_tags t "
                        + "JOIN blog_post_tags pt ON pt.tag_id = t.id JOIN blog_posts p ON p.id = pt.post_id AND p.status = 'PUBLISHED' AND p.visibility = 'PUBLIC' "
                        + "GROUP BY t.id, t.name, t.slug ORDER BY cnt DESC, t.name",
                (rs, i) -> new BlogTag(rs.getString("name"), rs.getString("slug"), rs.getInt("cnt")));
    }

    // ---------------- Like / bookmark ----------------

    public Set<UUID> likedIds(UUID userId, List<UUID> postIds) {
        return idsIn("blog_likes", userId, postIds);
    }

    public Set<UUID> bookmarkedIds(UUID userId, List<UUID> postIds) {
        return idsIn("blog_bookmarks", userId, postIds);
    }

    private Set<UUID> idsIn(String table, UUID userId, List<UUID> postIds) {
        if (postIds.isEmpty()) return Set.of();
        String in = String.join(",", postIds.stream().map(x -> "?").toList());
        List<Object> args = new ArrayList<>();
        args.add(userId);
        args.addAll(postIds);
        return new HashSet<>(jdbc.queryForList("SELECT post_id FROM " + table + " WHERE user_id = ? AND post_id IN (" + in + ")",
                UUID.class, args.toArray()));
    }

    /** @return true nếu thật sự thêm mới (idempotent: lặp lại không tăng bộ đếm). */
    public boolean addLike(UUID postId, UUID userId) {
        int n = jdbc.update("INSERT INTO blog_likes (post_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING", postId, userId);
        if (n > 0) jdbc.update("UPDATE blog_posts SET like_count = like_count + 1 WHERE id = ?", postId);
        return n > 0;
    }

    public boolean removeLike(UUID postId, UUID userId) {
        int n = jdbc.update("DELETE FROM blog_likes WHERE post_id = ? AND user_id = ?", postId, userId);
        if (n > 0) jdbc.update("UPDATE blog_posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = ?", postId);
        return n > 0;
    }

    public int likeCount(UUID postId) {
        Integer n = jdbc.queryForObject("SELECT like_count FROM blog_posts WHERE id = ?", Integer.class, postId);
        return n == null ? 0 : n;
    }

    public void addBookmark(UUID postId, UUID userId) {
        jdbc.update("INSERT INTO blog_bookmarks (post_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING", postId, userId);
    }

    public void removeBookmark(UUID postId, UUID userId) {
        jdbc.update("DELETE FROM blog_bookmarks WHERE post_id = ? AND user_id = ?", postId, userId);
    }

    // ---------------- Follow ----------------

    public void follow(UUID followerId, UUID authorId) {
        jdbc.update("INSERT INTO blog_follows (follower_id, author_id) VALUES (?, ?) ON CONFLICT DO NOTHING", followerId, authorId);
    }

    public void unfollow(UUID followerId, UUID authorId) {
        jdbc.update("DELETE FROM blog_follows WHERE follower_id = ? AND author_id = ?", followerId, authorId);
    }

    public boolean isFollowing(UUID followerId, UUID authorId) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM blog_follows WHERE follower_id = ? AND author_id = ?",
                Integer.class, followerId, authorId);
        return n != null && n > 0;
    }

    public long followingCount(UUID userId) {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM blog_follows WHERE follower_id = ?", Long.class, userId);
        return n == null ? 0 : n;
    }

    /** Tác giả mà người dùng đang theo dõi, mới theo dõi trước. */
    public List<UUID> followedAuthorIds(UUID userId) {
        return jdbc.query("SELECT author_id FROM blog_follows WHERE follower_id = ? ORDER BY created_at DESC",
                (rs, i) -> rs.getObject(1, UUID.class), userId);
    }

    public long followerCount(UUID authorId) {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM blog_follows WHERE author_id = ?", Long.class, authorId);
        return n == null ? 0 : n;
    }

    /** Tên và vai trò gần nhất của tác giả từ bài viết của họ (không gọi profile-service). */
    public Optional<String[]> authorIdentity(UUID authorId) {
        return jdbc.query("SELECT author_name, author_role FROM blog_posts WHERE author_id = ? "
                        + "ORDER BY updated_at DESC LIMIT 1", (rs, i) -> new String[]{rs.getString(1), rs.getString(2)}, authorId)
                .stream().findFirst();
    }

    // ---------------- Bình luận ----------------

    public void insertComment(UUID id, UUID postId, UUID parentId, UUID authorId, String authorName, String body) {
        jdbc.update("INSERT INTO blog_comments (id, post_id, parent_id, author_id, author_name, body) VALUES (?, ?, ?, ?, ?, ?)",
                id, postId, parentId, authorId, authorName, body);
        jdbc.update("UPDATE blog_posts SET comment_count = comment_count + 1 WHERE id = ?", postId);
    }

    public Optional<CommentRow> findComment(UUID id) {
        return jdbc.query("SELECT id, post_id, parent_id, author_id, author_name, body, status, created_at "
                + "FROM blog_comments WHERE id = ?", COMMENT, id).stream().findFirst();
    }

    /** Bình luận gốc theo thời gian, mỗi gốc kèm câu trả lời của nó ngay sau. */
    public List<CommentRow> commentsOf(UUID postId) {
        List<CommentRow> all = jdbc.query("SELECT id, post_id, parent_id, author_id, author_name, body, status, created_at "
                + "FROM blog_comments WHERE post_id = ? ORDER BY created_at, id", COMMENT, postId);
        Map<UUID, List<CommentRow>> replies = new LinkedHashMap<>();
        List<CommentRow> roots = new ArrayList<>();
        for (CommentRow c : all) {
            if (c.parentId() == null) roots.add(c);
            else replies.computeIfAbsent(c.parentId(), k -> new ArrayList<>()).add(c);
        }
        List<CommentRow> ordered = new ArrayList<>();
        for (CommentRow root : roots) {
            ordered.add(root);
            ordered.addAll(replies.getOrDefault(root.id(), List.of()));
        }
        return ordered;
    }

    /** @return true nếu bình luận đang VISIBLE và vừa chuyển REMOVED (giảm bộ đếm đúng một lần). */
    public boolean removeComment(UUID id, UUID postId) {
        int n = jdbc.update("UPDATE blog_comments SET status = 'REMOVED' WHERE id = ? AND status = 'VISIBLE'", id);
        if (n > 0) jdbc.update("UPDATE blog_posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = ?", postId);
        return n > 0;
    }

    public long countCommentsSince(UUID authorId, OffsetDateTime since) {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM blog_comments WHERE author_id = ? AND created_at >= ?",
                Long.class, authorId, since);
        return n == null ? 0 : n;
    }

    // ---------------- Báo cáo ----------------

    /** @return false nếu người này đã có báo cáo mở cho đối tượng (unique index). */
    public boolean insertReport(String targetType, UUID targetId, UUID postId, UUID reporterId, String reason) {
        try {
            jdbc.update("INSERT INTO blog_reports (target_type, target_id, post_id, reporter_id, reason) VALUES (?, ?, ?, ?, ?)",
                    targetType, targetId, postId, reporterId, reason);
            return true;
        } catch (DuplicateKeyException e) {
            return false;
        }
    }

    public List<BlogReportView> reports(String status) {
        return jdbc.query("SELECT r.id, r.target_type, r.target_id, r.post_id, p.title, r.reporter_id, r.reason, r.status, "
                        + "r.created_at, c.body AS comment_body, p.summary AS post_summary FROM blog_reports r "
                        + "JOIN blog_posts p ON p.id = r.post_id LEFT JOIN blog_comments c ON c.id = r.target_id AND r.target_type = 'COMMENT' "
                        + "WHERE r.status = ? ORDER BY r.created_at, r.id",
                (rs, i) -> {
                    String body = "COMMENT".equals(rs.getString("target_type")) ? rs.getString("comment_body") : rs.getString("post_summary");
                    String excerpt = body == null ? "" : body.length() > 160 ? body.substring(0, 160) + "…" : body;
                    return new BlogReportView(rs.getObject("id", UUID.class), rs.getString("target_type"),
                            rs.getObject("target_id", UUID.class), rs.getObject("post_id", UUID.class), rs.getString("title"),
                            excerpt, rs.getObject("reporter_id", UUID.class), rs.getString("reason"), rs.getString("status"),
                            rs.getObject("created_at", OffsetDateTime.class));
                }, status);
    }

    public void resolveReport(UUID id) {
        jdbc.update("UPDATE blog_reports SET status = 'RESOLVED' WHERE id = ?", id);
    }

    public boolean reportExists(UUID id) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM blog_reports WHERE id = ?", Integer.class, id);
        return n != null && n > 0;
    }

    /** Đóng mọi báo cáo mở của một đối tượng sau khi admin đã xử lý nó. */
    public void resolveReportsOf(String targetType, UUID targetId) {
        jdbc.update("UPDATE blog_reports SET status = 'RESOLVED' WHERE target_type = ? AND target_id = ? AND status = 'OPEN'",
                targetType, targetId);
    }

    private static String escapeLike(String s) {
        return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
