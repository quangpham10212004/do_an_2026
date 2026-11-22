package com.mmp.learning.service;

import com.mmp.learning.client.ProfileClient;
import com.mmp.learning.dto.BlogDtos.*;
import com.mmp.learning.exception.ApiException;
import com.mmp.learning.repository.BlogJdbcRepository;
import com.mmp.learning.repository.BlogJdbcRepository.CommentRow;
import com.mmp.learning.repository.BlogJdbcRepository.PostPage;
import com.mmp.learning.repository.BlogJdbcRepository.PostRow;
import com.mmp.learning.security.AuthUser;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Blog của mentor / mentee: viết, đăng, tương tác (like, bookmark, bình luận, theo dõi) và kiểm duyệt sau đăng.
 * Quy tắc thuần nằm ở {@link BlogRules}. Không gọi mạng bên trong transaction: tên tác giả lấy từ profile-service
 * trước, rồi mới ghi DB bằng {@link TransactionTemplate}.
 */
@Service
public class BlogService {

    private static final int MAX_PAGE_SIZE = 50;

    private final BlogJdbcRepository repo;
    private final ProfileClient profiles;
    private final TransactionTemplate tx;
    private final int postsPerHour;
    private final int commentsPerHour;

    public BlogService(BlogJdbcRepository repo, ProfileClient profiles, TransactionTemplate tx,
                       @Value("${app.blog.posts-per-hour:10}") int postsPerHour,
                       @Value("${app.blog.comments-per-hour:30}") int commentsPerHour) {
        this.repo = repo;
        this.profiles = profiles;
        this.tx = tx;
        this.postsPerHour = postsPerHour;
        this.commentsPerHour = commentsPerHour;
    }

    // ---------------- Bài viết ----------------

    public BlogPostDetail createPost(AuthUser user, BlogPostInput in) {
        requireWriter(user);
        Map<String, String> tags = validate(in);
        if (repo.countPostsSince(user.userId(), OffsetDateTime.now().minusHours(1)) >= postsPerHour) {
            throw rateLimited("Bạn tạo bài quá nhanh, hãy thử lại sau");
        }
        String name = authorName(user);
        UUID id = UUID.randomUUID();
        String base = BlogRules.slugify(in.title());
        String summary = summaryOf(in);
        int minutes = BlogRules.readingMinutes(in.contentMd());
        String cover = blankToNull(in.coverUrl());
        for (int attempt = 0; ; attempt++) {
            String slug = (attempt == 0 && !repo.slugExists(base)) ? base : BlogRules.withSuffix(base, id);
            try {
                tx.executeWithoutResult(s -> {
                    repo.insertPost(new PostRow(id, user.userId(), name, user.role(), in.title().trim(), slug, summary,
                            in.contentMd(), cover, BlogRules.DRAFT, null, minutes, 0, 0, null, null));
                    if (in.visibility() != null) repo.setVisibility(id, in.visibility().name());
                    repo.replaceTags(id, tags);
                });
                break;
            } catch (DuplicateKeyException e) {
                if (attempt >= 1) throw ApiException.conflict("BLOG_SLUG_CONFLICT", "Không tạo được đường dẫn cho bài viết, hãy thử lại");
            }
        }
        return detail(requirePost(id), user);
    }

    public BlogPostDetail updatePost(AuthUser user, UUID id, BlogPostInput in) {
        PostRow post = requireOwnPost(user, id);
        Map<String, String> tags = validate(in);
        if (BlogRules.PUBLISHED.equals(post.status()) && !BlogRules.longEnoughToPublish(in.contentMd())) {
            throw ApiException.badRequest("BLOG_CONTENT_TOO_SHORT",
                    "Bài đã đăng cần tối thiểu " + BlogRules.PUBLISH_MIN_CONTENT + " ký tự nội dung");
        }
        String name = authorName(user);
        String newSlug = null;
        // Chưa từng đăng thì slug còn đổi theo tiêu đề được; đã đăng thì giữ nguyên để link không gãy
        if (post.publishedAt() == null) {
            String base = BlogRules.slugify(in.title());
            if (!post.slug().equals(base) && !post.slug().startsWith(base + "-")) {
                newSlug = repo.slugExists(base) ? BlogRules.withSuffix(base, id) : base;
            }
        }
        String slug = newSlug;
        String summary = summaryOf(in);
        int minutes = BlogRules.readingMinutes(in.contentMd());
        String cover = blankToNull(in.coverUrl());
        try {
            tx.executeWithoutResult(s -> {
                repo.updatePost(id, name, in.title().trim(), summary, in.contentMd(), cover, minutes);
                if (in.visibility() != null) repo.setVisibility(id, in.visibility().name());
                if (slug != null) repo.updateSlug(id, slug);
                repo.replaceTags(id, tags);
            });
        } catch (DuplicateKeyException e) {
            throw ApiException.conflict("BLOG_SLUG_CONFLICT", "Đường dẫn bài viết bị trùng, hãy đổi tiêu đề một chút");
        }
        return detail(requirePost(id), user);
    }

    public BlogPostDetail publish(AuthUser user, UUID id) {
        PostRow post = requireOwnPost(user, id);
        if (BlogRules.PUBLISHED.equals(post.status())) return detail(post, user);
        if (!BlogRules.authorMayPublish(post.status())) {
            throw ApiException.conflict("BLOG_POST_TAKEN_DOWN",
                    "Bài đã bị quản trị viên gỡ" + (post.unpublishReason() == null ? "" : ": " + post.unpublishReason()));
        }
        if (!BlogRules.longEnoughToPublish(post.contentMd())) {
            throw ApiException.badRequest("BLOG_CONTENT_TOO_SHORT",
                    "Cần tối thiểu " + BlogRules.PUBLISH_MIN_CONTENT + " ký tự nội dung để đăng bài");
        }
        tx.executeWithoutResult(s -> repo.publish(id));
        return detail(requirePost(id), user);
    }

    /** Tác giả tự gỡ bài về nháp. */
    public BlogPostDetail unpublish(AuthUser user, UUID id) {
        PostRow post = requireOwnPost(user, id);
        if (BlogRules.PUBLISHED.equals(post.status())) {
            tx.executeWithoutResult(s -> repo.toDraft(id));
        }
        return detail(requirePost(id), user);
    }

    public void deletePost(AuthUser user, UUID id) {
        requireOwnPost(user, id);
        tx.executeWithoutResult(s -> repo.deletePost(id));
    }

    public BlogPostDetail bySlug(AuthUser user, String slug) {
        PostRow post = repo.findBySlug(slug).filter(p -> viewable(p, user))
                .orElseThrow(() -> ApiException.notFound("BLOG_POST_NOT_FOUND", "Không tìm thấy bài viết"));
        return detail(post, user);
    }

    public BlogPostDetail forEdit(AuthUser user, UUID id) {
        return detail(requireOwnPost(user, id), user);
    }

    public VisibilityView visibility(AuthUser user, UUID id) {
        requireOwnPost(user, id);
        return new VisibilityView(Visibility.valueOf(repo.visibility(id)));
    }

    public void recordView(AuthUser user, UUID id) {
        requirePublished(id);
        repo.recordView(id, user.userId());
    }

    public Map<UUID, Long> viewCounts(AuthUser user, List<UUID> ids) {
        if (ids.size() > 100) throw ApiException.badRequest("TOO_MANY_POSTS", "Chỉ được tra tối đa 100 bài viết mỗi lần");
        return repo.viewCounts(ids, user.userId());
    }

    public BlogPostPage list(AuthUser user, String tag, String q, UUID author, int page, int size) {
        int p = Math.max(0, page);
        int s = clampSize(size);
        PostPage result = repo.listPublished(blankToNull(tag), blankToNull(q), author, null, p, s);
        return new BlogPostPage(summaries(result.rows(), user), p, s, result.total());
    }

    public BlogPostPage feed(AuthUser user, int page, int size) {
        int p = Math.max(0, page);
        int s = clampSize(size);
        PostPage result = repo.listPublished(null, null, null, user.userId(), p, s);
        return new BlogPostPage(summaries(result.rows(), user), p, s, result.total());
    }

    public List<BlogPostSummary> myPosts(AuthUser user) {
        return summaries(repo.byAuthor(user.userId()), user);
    }

    public List<BlogPostSummary> myBookmarks(AuthUser user) {
        return summaries(repo.bookmarked(user.userId()), user);
    }

    public List<BlogTag> tags() {
        return repo.tagsWithCounts();
    }

    // ---------------- Like / bookmark ----------------

    public LikeState like(AuthUser user, UUID postId, boolean liked) {
        requirePublished(postId);
        tx.executeWithoutResult(s -> {
            if (liked) repo.addLike(postId, user.userId());
            else repo.removeLike(postId, user.userId());
        });
        return new LikeState(liked, repo.likeCount(postId));
    }

    public void bookmark(AuthUser user, UUID postId, boolean on) {
        if (on) requirePublished(postId);
        tx.executeWithoutResult(s -> {
            if (on) repo.addBookmark(postId, user.userId());
            else repo.removeBookmark(postId, user.userId());
        });
    }

    // ---------------- Bình luận ----------------

    public List<BlogComment> comments(AuthUser user, UUID postId) {
        PostRow post = requirePost(postId);
        if (!viewable(post, user)) throw postNotFound();
        return repo.commentsOf(postId).stream().map(c -> c.toView("REMOVED".equals(c.status()))).toList();
    }

    public BlogComment addComment(AuthUser user, UUID postId, CommentInput in) {
        requireWriter(user);
        requirePublished(postId);
        BlogRules.validateComment(in.body()).ifPresent(m -> {
            throw ApiException.badRequest("BLOG_INVALID", m);
        });
        if (in.parentId() != null) {
            CommentRow parent = repo.findComment(in.parentId()).filter(c -> c.postId().equals(postId))
                    .orElseThrow(() -> ApiException.notFound("BLOG_COMMENT_NOT_FOUND", "Không tìm thấy bình luận để trả lời"));
            if (parent.parentId() != null || !"VISIBLE".equals(parent.status())) {
                throw ApiException.badRequest("BLOG_INVALID", "Chỉ trả lời được bình luận gốc đang hiển thị");
            }
        }
        if (repo.countCommentsSince(user.userId(), OffsetDateTime.now().minusHours(1)) >= commentsPerHour) {
            throw rateLimited("Bạn bình luận quá nhanh, hãy thử lại sau");
        }
        String name = authorName(user);
        UUID id = UUID.randomUUID();
        tx.executeWithoutResult(s -> repo.insertComment(id, postId, in.parentId(), user.userId(), name, in.body().trim()));
        return repo.findComment(id).orElseThrow().toView(false);
    }

    /** Người viết, tác giả bài hoặc admin gỡ được bình luận. */
    public void removeComment(AuthUser user, UUID commentId) {
        CommentRow comment = repo.findComment(commentId)
                .orElseThrow(() -> ApiException.notFound("BLOG_COMMENT_NOT_FOUND", "Không tìm thấy bình luận"));
        PostRow post = requirePost(comment.postId());
        boolean allowed = user.isAdmin() || user.userId().equals(comment.authorId()) || user.userId().equals(post.authorId());
        if (!allowed) throw ApiException.forbidden("Bạn không có quyền gỡ bình luận này");
        tx.executeWithoutResult(s -> repo.removeComment(commentId, comment.postId()));
    }

    // ---------------- Theo dõi tác giả ----------------

    public BlogAuthor author(AuthUser user, UUID authorId) {
        String[] identity = repo.authorIdentity(authorId)
                .orElseThrow(() -> ApiException.notFound("BLOG_AUTHOR_NOT_FOUND", "Không tìm thấy tác giả"));
        return new BlogAuthor(authorId, identity[0], identity[1], repo.publishedCount(authorId),
                repo.followerCount(authorId), repo.followingCount(authorId), repo.isFollowing(user.userId(), authorId));
    }

    /** Danh sách tác giả người dùng đang theo dõi (bỏ tác giả chưa còn bài nào để lấy tên). */
    public List<BlogAuthor> following(AuthUser user) {
        return repo.followedAuthorIds(user.userId()).stream()
                .filter(id -> repo.authorIdentity(id).isPresent())
                .map(id -> author(user, id)).toList();
    }

    public void follow(AuthUser user, UUID authorId, boolean on) {
        if (on) {
            if (user.userId().equals(authorId)) {
                throw ApiException.badRequest("BLOG_SELF_FOLLOW", "Bạn không thể tự theo dõi chính mình");
            }
            if (repo.authorIdentity(authorId).isEmpty()) {
                throw ApiException.notFound("BLOG_AUTHOR_NOT_FOUND", "Không tìm thấy tác giả");
            }
        }
        tx.executeWithoutResult(s -> {
            if (on) repo.follow(user.userId(), authorId);
            else repo.unfollow(user.userId(), authorId);
        });
    }

    // ---------------- Báo cáo & kiểm duyệt ----------------

    public void reportPost(AuthUser user, UUID postId, String reason) {
        requirePublished(postId);
        report("POST", postId, postId, user, reason);
    }

    public void reportComment(AuthUser user, UUID commentId, String reason) {
        CommentRow comment = repo.findComment(commentId).filter(c -> "VISIBLE".equals(c.status()))
                .orElseThrow(() -> ApiException.notFound("BLOG_COMMENT_NOT_FOUND", "Không tìm thấy bình luận"));
        requirePublished(comment.postId());
        report("COMMENT", commentId, comment.postId(), user, reason);
    }

    public List<BlogReportView> reports(String status) {
        return repo.reports("RESOLVED".equals(status) ? "RESOLVED" : "OPEN");
    }

    public BlogPostDetail adminUnpublish(AuthUser admin, UUID postId, String reason) {
        checkReason(reason);
        PostRow post = requirePost(postId);
        if (!BlogRules.UNPUBLISHED.equals(post.status())) {
            tx.executeWithoutResult(s -> {
                repo.takeDown(postId, reason.trim());
                repo.resolveReportsOf("POST", postId);
            });
        }
        return detail(requirePost(postId), admin);
    }

    public void adminRemoveComment(UUID commentId) {
        CommentRow comment = repo.findComment(commentId)
                .orElseThrow(() -> ApiException.notFound("BLOG_COMMENT_NOT_FOUND", "Không tìm thấy bình luận"));
        tx.executeWithoutResult(s -> {
            repo.removeComment(commentId, comment.postId());
            repo.resolveReportsOf("COMMENT", commentId);
        });
    }

    public void resolveReport(UUID reportId) {
        if (!repo.reportExists(reportId)) {
            throw ApiException.notFound("BLOG_REPORT_NOT_FOUND", "Không tìm thấy báo cáo");
        }
        tx.executeWithoutResult(s -> repo.resolveReport(reportId));
    }

    // ---------------- Hỗ trợ ----------------

    private void report(String type, UUID targetId, UUID postId, AuthUser user, String reason) {
        checkReason(reason);
        boolean created = Boolean.TRUE.equals(tx.execute(s -> repo.insertReport(type, targetId, postId, user.userId(), reason.trim())));
        if (!created) throw ApiException.conflict("BLOG_ALREADY_REPORTED", "Bạn đã báo cáo nội dung này và đang chờ xử lý");
    }

    private static void checkReason(String reason) {
        BlogRules.validateReason(reason).ifPresent(m -> {
            throw ApiException.badRequest("BLOG_INVALID", m);
        });
    }

    private Map<String, String> validate(BlogPostInput in) {
        BlogRules.validateDraft(in.title(), in.summary(), in.contentMd(), in.coverUrl()).ifPresent(m -> {
            throw ApiException.badRequest("BLOG_INVALID", m);
        });
        Map<String, String> bySlug = new LinkedHashMap<>();
        try {
            for (String name : BlogRules.normalizeTags(in.tags())) bySlug.put(BlogRules.tagSlug(name), name);
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("BLOG_INVALID", e.getMessage());
        }
        return bySlug;
    }

    private String summaryOf(BlogPostInput in) {
        String given = in.summary() == null ? "" : in.summary().trim();
        return given.isEmpty() ? BlogRules.autoSummary(in.contentMd()) : given;
    }

    private void requireWriter(AuthUser user) {
        if (!BlogRules.canWrite(user.role())) throw ApiException.forbidden("Tài khoản của bạn không được viết blog");
    }

    private PostRow requirePost(UUID id) {
        return repo.findById(id).orElseThrow(BlogService::postNotFound);
    }

    private PostRow requirePublished(UUID id) {
        PostRow post = requirePost(id);
        if (!BlogRules.PUBLISHED.equals(post.status())) throw postNotFound();
        return post;
    }

    /** Bài của chính người gọi; người khác (kể cả admin) thấy 404 để không lộ bài nháp. */
    private PostRow requireOwnPost(AuthUser user, UUID id) {
        PostRow post = requirePost(id);
        if (!post.authorId().equals(user.userId())) throw postNotFound();
        return post;
    }

    private boolean viewable(PostRow post, AuthUser user) {
        return BlogRules.canView(post.status(), post.authorId(), user.userId(), user.isAdmin());
    }

    private static ApiException postNotFound() {
        return ApiException.notFound("BLOG_POST_NOT_FOUND", "Không tìm thấy bài viết");
    }

    private static ApiException rateLimited(String message) {
        return new ApiException(HttpStatus.TOO_MANY_REQUESTS, "BLOG_RATE_LIMITED", message);
    }

    private String authorName(AuthUser user) {
        Optional<String> name = profiles.displayName(user.userId());
        if (name.isPresent()) return name.get();
        String email = user.email();
        return email == null || email.isBlank() ? "Người dùng" : email.substring(0, email.indexOf('@') > 0 ? email.indexOf('@') : email.length());
    }

    private BlogPostDetail detail(PostRow p, AuthUser viewer) {
        List<UUID> ids = List.of(p.id());
        List<String> tags = repo.tagNames(ids).getOrDefault(p.id(), List.of());
        boolean following = !viewer.userId().equals(p.authorId()) && repo.isFollowing(viewer.userId(), p.authorId());
        return new BlogPostDetail(p.id(), p.slug(), p.title(), p.summary(), p.coverUrl(), tags, p.authorId(), p.authorName(),
                p.authorRole(), p.status(), p.readingMinutes(), p.likeCount(), p.commentCount(), p.publishedAt(),
                repo.likedIds(viewer.userId(), ids).contains(p.id()), repo.bookmarkedIds(viewer.userId(), ids).contains(p.id()),
                p.contentMd(), p.unpublishReason(), following);
    }

    private List<BlogPostSummary> summaries(List<PostRow> rows, AuthUser viewer) {
        List<UUID> ids = rows.stream().map(PostRow::id).toList();
        Map<UUID, List<String>> tags = repo.tagNames(ids);
        Set<UUID> liked = repo.likedIds(viewer.userId(), ids);
        Set<UUID> saved = repo.bookmarkedIds(viewer.userId(), ids);
        return rows.stream().map(p -> new BlogPostSummary(p.id(), p.slug(), p.title(), p.summary(), p.coverUrl(),
                tags.getOrDefault(p.id(), List.of()), p.authorId(), p.authorName(), p.authorRole(), p.status(),
                p.readingMinutes(), p.likeCount(), p.commentCount(), p.publishedAt(), liked.contains(p.id()),
                saved.contains(p.id()))).toList();
    }

    private static int clampSize(int size) {
        return size < 1 ? 10 : Math.min(size, MAX_PAGE_SIZE);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
