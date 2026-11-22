package com.mmp.mentoring.controller;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Số liệu cho trang cá nhân do profile-service ghép với dữ liệu hồ sơ (GET /api/profile/mentee/{id}/extras,
 * /api/profile/mentors/{id}/classmates). Chỉ trả id và số liệu; tên hiển thị do profile-service tra.
 */
@RestController
@RequestMapping("/internal")
public class InternalProfileStatsController {

    private final JdbcTemplate jdbc;

    public InternalProfileStatsController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record MentorLink(UUID mentorId, long sessions) {}

    public record FeedbackRow(UUID id, UUID mentorId, double rating, OffsetDateTime createdAt, String sessionType, String comment) {}

    public record MenteeSummary(long sessionsCompleted, Integer onTimeRate, List<MentorLink> mentors, List<FeedbackRow> feedbacks) {}

    public record Classmates(List<UUID> menteeIds, long total) {}

    @GetMapping("/mentees/{menteeId}/summary")
    public MenteeSummary mentee(@PathVariable UUID menteeId) {
        long completed = count("SELECT count(*) FROM sessions WHERE mentee_id = ? AND status = 'COMPLETED'", menteeId);
        long noShows = count("SELECT count(*) FROM sessions WHERE mentee_id = ? AND status = 'NO_SHOW_MENTEE'", menteeId);
        // Đúng giờ = tỉ lệ phiên có mặt trên tổng phiên đã kết luận; cần ≥ 3 phiên mới đủ dữ liệu.
        Integer onTime = completed + noShows >= 3 ? (int) Math.round(100.0 * completed / (completed + noShows)) : null;
        List<MentorLink> mentors = jdbc.query("""
                SELECT mentor_id, count(*) AS n FROM sessions WHERE mentee_id = ? AND status = 'COMPLETED'
                GROUP BY mentor_id ORDER BY n DESC, max(scheduled_at) DESC LIMIT 10
                """, (rs, i) -> new MentorLink(rs.getObject("mentor_id", UUID.class), rs.getLong("n")), menteeId);
        List<FeedbackRow> feedbacks = jdbc.query("""
                SELECT f.session_id, f.mentor_id, (f.preparation + f.engagement) / 2.0 AS rating, f.created_at,
                       s.session_type, f.comment
                FROM mentee_feedback f JOIN sessions s ON s.id = f.session_id
                WHERE f.mentee_id = ? ORDER BY f.created_at DESC LIMIT 20
                """, (rs, i) -> new FeedbackRow(rs.getObject("session_id", UUID.class), rs.getObject("mentor_id", UUID.class),
                rs.getDouble("rating"), rs.getObject("created_at", OffsetDateTime.class), rs.getString("session_type"),
                rs.getString("comment")), menteeId);
        return new MenteeSummary(completed, onTime, mentors, feedbacks);
    }

    @GetMapping("/mentors/{mentorId}/classmates")
    public Classmates classmates(@PathVariable UUID mentorId) {
        long total = count("SELECT count(DISTINCT mentee_id) FROM sessions WHERE mentor_id = ? AND status = 'COMPLETED'", mentorId);
        List<UUID> ids = jdbc.query("""
                SELECT mentee_id FROM sessions WHERE mentor_id = ? AND status = 'COMPLETED'
                GROUP BY mentee_id ORDER BY max(scheduled_at) DESC LIMIT 3
                """, (rs, i) -> rs.getObject("mentee_id", UUID.class), mentorId);
        return new Classmates(ids, total);
    }

    private long count(String sql, UUID id) {
        Long n = jdbc.queryForObject(sql, Long.class, id);
        return n == null ? 0 : n;
    }
}
