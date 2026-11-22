package com.mmp.learning.controller;

import com.mmp.learning.dto.BlogDtos.*;
import com.mmp.learning.security.CurrentUser;
import com.mmp.learning.service.BlogService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Blog của mentor / mentee — khớp /api/learning/blog/** trong contracts/learning-service.yaml. */
@RestController
@RequestMapping("/api/learning/blog")
public class BlogController {

    private final BlogService blog;

    public BlogController(BlogService blog) {
        this.blog = blog;
    }

    // ---- Bài viết ----

    @GetMapping("/posts")
    public BlogPostPage posts(@RequestParam(required = false) String tag, @RequestParam(required = false) String q,
                              @RequestParam(required = false) UUID author, @RequestParam(defaultValue = "0") int page,
                              @RequestParam(defaultValue = "10") int size) {
        return blog.list(CurrentUser.get(), tag, q, author, page, size);
    }

    @PostMapping("/posts")
    @ResponseStatus(HttpStatus.CREATED)
    public BlogPostDetail create(@Valid @RequestBody BlogPostInput in) {
        return blog.createPost(CurrentUser.get(), in);
    }

    @GetMapping("/posts/{slug}")
    public BlogPostDetail bySlug(@PathVariable String slug) {
        return blog.bySlug(CurrentUser.get(), slug);
    }

    @GetMapping("/posts/{id}/edit")
    public BlogPostDetail forEdit(@PathVariable UUID id) {
        return blog.forEdit(CurrentUser.get(), id);
    }

    @GetMapping("/posts/{id}/visibility")
    public VisibilityView visibility(@PathVariable UUID id) {
        return blog.visibility(CurrentUser.get(), id);
    }

    @GetMapping("/posts/views")
    public Map<UUID, Long> views(@RequestParam List<UUID> ids) {
        return blog.viewCounts(CurrentUser.get(), ids);
    }

    @PostMapping("/posts/{id}/view")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void recordView(@PathVariable UUID id) {
        blog.recordView(CurrentUser.get(), id);
    }

    @PutMapping("/posts/{id}")
    public BlogPostDetail update(@PathVariable UUID id, @Valid @RequestBody BlogPostInput in) {
        return blog.updatePost(CurrentUser.get(), id, in);
    }

    @DeleteMapping("/posts/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        blog.deletePost(CurrentUser.get(), id);
    }

    @PostMapping("/posts/{id}/publish")
    public BlogPostDetail publish(@PathVariable UUID id) {
        return blog.publish(CurrentUser.get(), id);
    }

    @PostMapping("/posts/{id}/unpublish")
    public BlogPostDetail unpublish(@PathVariable UUID id) {
        return blog.unpublish(CurrentUser.get(), id);
    }

    @GetMapping("/me/posts")
    public List<BlogPostSummary> myPosts() {
        return blog.myPosts(CurrentUser.get());
    }

    @GetMapping("/me/bookmarks")
    public List<BlogPostSummary> myBookmarks() {
        return blog.myBookmarks(CurrentUser.get());
    }

    @GetMapping("/tags")
    public List<BlogTag> tags() {
        return blog.tags();
    }

    // ---- Like / bookmark ----

    @PutMapping("/posts/{id}/like")
    public LikeState like(@PathVariable UUID id) {
        return blog.like(CurrentUser.get(), id, true);
    }

    @DeleteMapping("/posts/{id}/like")
    public LikeState unlike(@PathVariable UUID id) {
        return blog.like(CurrentUser.get(), id, false);
    }

    @PutMapping("/posts/{id}/bookmark")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void bookmark(@PathVariable UUID id) {
        blog.bookmark(CurrentUser.get(), id, true);
    }

    @DeleteMapping("/posts/{id}/bookmark")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unbookmark(@PathVariable UUID id) {
        blog.bookmark(CurrentUser.get(), id, false);
    }

    // ---- Bình luận ----

    @GetMapping("/posts/{id}/comments")
    public List<BlogComment> comments(@PathVariable UUID id) {
        return blog.comments(CurrentUser.get(), id);
    }

    @PostMapping("/posts/{id}/comments")
    @ResponseStatus(HttpStatus.CREATED)
    public BlogComment comment(@PathVariable UUID id, @Valid @RequestBody CommentInput in) {
        return blog.addComment(CurrentUser.get(), id, in);
    }

    @DeleteMapping("/comments/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeComment(@PathVariable UUID id) {
        blog.removeComment(CurrentUser.get(), id);
    }

    // ---- Tác giả, theo dõi, feed ----

    @GetMapping("/authors/{id}")
    public BlogAuthor author(@PathVariable UUID id) {
        return blog.author(CurrentUser.get(), id);
    }

    @GetMapping("/me/following")
    public List<BlogAuthor> following() {
        return blog.following(CurrentUser.get());
    }

    @PutMapping("/authors/{id}/follow")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void follow(@PathVariable UUID id) {
        blog.follow(CurrentUser.get(), id, true);
    }

    @DeleteMapping("/authors/{id}/follow")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unfollow(@PathVariable UUID id) {
        blog.follow(CurrentUser.get(), id, false);
    }

    @GetMapping("/feed")
    public BlogPostPage feed(@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "10") int size) {
        return blog.feed(CurrentUser.get(), page, size);
    }

    // ---- Báo cáo ----

    @PostMapping("/posts/{id}/report")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void reportPost(@PathVariable UUID id, @Valid @RequestBody ReasonInput in) {
        blog.reportPost(CurrentUser.get(), id, in.reason());
    }

    @PostMapping("/comments/{id}/report")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void reportComment(@PathVariable UUID id, @Valid @RequestBody ReasonInput in) {
        blog.reportComment(CurrentUser.get(), id, in.reason());
    }
}
