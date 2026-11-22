package com.mmp.learning.dto;

import jakarta.validation.constraints.NotBlank;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** DTO của module blog — khớp schema Blog* trong contracts/learning-service.yaml. */
public final class BlogDtos {

    private BlogDtos() {
    }

    public record BlogPostSummary(UUID id, String slug, String title, String summary, String coverUrl, List<String> tags,
                                  UUID authorId, String authorName, String authorRole, String status, int readingMinutes,
                                  int likeCount, int commentCount, OffsetDateTime publishedAt, boolean liked,
                                  boolean bookmarked) {
    }

    /** Như BlogPostSummary kèm nội dung Markdown (JSON phẳng, khớp allOf trong contract). */
    public record BlogPostDetail(UUID id, String slug, String title, String summary, String coverUrl, List<String> tags,
                                 UUID authorId, String authorName, String authorRole, String status, int readingMinutes,
                                 int likeCount, int commentCount, OffsetDateTime publishedAt, boolean liked,
                                 boolean bookmarked, String contentMd, String unpublishReason, boolean followingAuthor) {
    }

    public record BlogPostPage(List<BlogPostSummary> items, int page, int size, long total) {
    }

    public record BlogPostInput(@NotBlank String title, String summary, @NotBlank String contentMd, String coverUrl,
                                List<String> tags, Visibility visibility) {
    }

    public enum Visibility { PUBLIC, UNLISTED }
    public record VisibilityView(Visibility visibility) {}

    public record CommentInput(@NotBlank String body, UUID parentId) {
    }

    public record ReasonInput(@NotBlank String reason) {
    }

    public record BlogComment(UUID id, UUID postId, UUID parentId, UUID authorId, String authorName, String body,
                              String status, OffsetDateTime createdAt) {
    }

    public record BlogTag(String name, String slug, int postCount) {
    }

    public record BlogAuthor(UUID authorId, String authorName, String authorRole, long postCount, long followerCount,
                             long followingCount, boolean following) {
    }

    public record LikeState(boolean liked, int likeCount) {
    }

    public record BlogReportView(UUID id, String targetType, UUID targetId, UUID postId, String postTitle, String excerpt,
                                 UUID reporterId, String reason, String status, OffsetDateTime createdAt) {
    }
}
