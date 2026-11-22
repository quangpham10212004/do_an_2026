package com.mmp.mentoring.controller;

import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.security.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/mentoring")
public class ReviewActionsController {
    private final JdbcTemplate jdbc;

    public ReviewActionsController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record Reaction(long helpfulCount, boolean marked) {}
    public record ReportInput(@NotBlank @Size(max = 300) String reason) {}
    public record ReviewReport(UUID id, UUID reviewId, UUID reporterId, String reason, OffsetDateTime createdAt) {}

    @GetMapping("/reviews/{id}/helpful")
    public Reaction helpful(@PathVariable UUID id) {
        requireReview(id);
        return reaction(id, CurrentUser.get().userId());
    }

    @PostMapping("/reviews/{id}/helpful")
    public Reaction mark(@PathVariable UUID id) {
        requireReview(id);
        UUID user = CurrentUser.get().userId();
        jdbc.update("INSERT INTO review_helpful (review_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING", id, user);
        return reaction(id, user);
    }

    @DeleteMapping("/reviews/{id}/helpful")
    public Reaction unmark(@PathVariable UUID id) {
        requireReview(id);
        UUID user = CurrentUser.get().userId();
        jdbc.update("DELETE FROM review_helpful WHERE review_id = ? AND user_id = ?", id, user);
        return reaction(id, user);
    }

    @PostMapping("/reviews/{id}/report")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void report(@PathVariable UUID id, @Valid @RequestBody ReportInput input) {
        requireReview(id);
        jdbc.update("INSERT INTO review_reports (id, review_id, user_id, reason) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING",
                UUID.randomUUID(), id, CurrentUser.get().userId(), input.reason().strip());
    }

    @GetMapping("/admin/review-reports")
    @PreAuthorize("hasRole('ADMIN')")
    public List<ReviewReport> reports() {
        return jdbc.query("""
                SELECT id, review_id, user_id, reason, created_at FROM review_reports
                WHERE resolved_at IS NULL ORDER BY created_at, id LIMIT 200
                """, (rs, n) -> new ReviewReport(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class),
                rs.getObject(3, UUID.class), rs.getString(4), rs.getObject(5, OffsetDateTime.class)));
    }

    @PostMapping("/admin/review-reports/{id}/resolve")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void resolve(@PathVariable UUID id) {
        if (jdbc.update("UPDATE review_reports SET resolved_at = COALESCE(resolved_at, now()) WHERE id = ?", id) == 0) {
            throw ApiException.notFound("REVIEW_REPORT_NOT_FOUND", "Không tìm thấy báo cáo");
        }
    }

    private void requireReview(UUID id) {
        if (!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM reviews WHERE id = ?)",
                Boolean.class, id))) throw ApiException.notFound("REVIEW_NOT_FOUND", "Không tìm thấy đánh giá");
    }

    private Reaction reaction(UUID id, UUID user) {
        return jdbc.queryForObject("SELECT COUNT(*), COUNT(*) FILTER (WHERE user_id = ?) > 0 "
                        + "FROM review_helpful WHERE review_id = ?",
                (rs, n) -> new Reaction(rs.getLong(1), rs.getBoolean(2)), user, id);
    }
}
