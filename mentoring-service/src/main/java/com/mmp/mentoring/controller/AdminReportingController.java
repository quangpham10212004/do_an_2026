package com.mmp.mentoring.controller;

import com.mmp.mentoring.exception.ApiException;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/mentoring/admin/reporting")
@PreAuthorize("hasRole('ADMIN')")
public class AdminReportingController {
    private final NamedParameterJdbcTemplate jdbc;

    public AdminReportingController(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record UserActivity(long sessions, long contactViolations) {}
    public record CompletedSessions(long total, long previous) {}

    @GetMapping("/users")
    public Map<UUID, UserActivity> users(@RequestParam List<UUID> ids) {
        if (ids.size() > 100) throw ApiException.badRequest("TOO_MANY_USERS", "Tối đa 100 người dùng");
        if (ids.isEmpty()) return Map.of();
        var params = Map.of("ids", ids);
        Map<UUID, Long> sessions = jdbc.query("""
                SELECT user_id, count(*) AS total
                  FROM (
                    SELECT mentee_id AS user_id FROM sessions WHERE status = 'COMPLETED' AND mentee_id IN (:ids)
                    UNION ALL
                    SELECT mentor_id AS user_id FROM sessions WHERE status = 'COMPLETED' AND mentor_id IN (:ids)
                  ) participation
                 GROUP BY user_id
                """, params, rs -> {
            Map<UUID, Long> counts = new java.util.HashMap<>();
            while (rs.next()) counts.put(rs.getObject("user_id", UUID.class), rs.getLong("total"));
            return counts;
        });
        Map<UUID, Long> violations = jdbc.query("""
                SELECT user_id, count(*) AS total FROM contact_violations WHERE user_id IN (:ids) GROUP BY user_id
                """, params, rs -> {
            Map<UUID, Long> counts = new java.util.HashMap<>();
            while (rs.next()) counts.put(rs.getObject("user_id", UUID.class), rs.getLong("total"));
            return counts;
        });
        return ids.stream().distinct().collect(Collectors.toMap(id -> id,
                id -> new UserActivity(sessions.getOrDefault(id, 0L), violations.getOrDefault(id, 0L))));
    }

    @GetMapping("/completed-sessions")
    public CompletedSessions completed(@RequestParam int days,
                                       @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime asOf) {
        if (days != 30 && days != 60 && days != 90) {
            throw ApiException.badRequest("INVALID_REPORT_PERIOD", "Kỳ báo cáo không hợp lệ");
        }
        var bounds = Map.of("current", asOf.minusDays(days), "previous", asOf.minusDays(2L * days), "now", asOf);
        return jdbc.queryForObject("""
                SELECT count(*) FILTER (WHERE updated_at >= :current) AS total,
                       count(*) FILTER (WHERE updated_at < :current) AS previous
                  FROM sessions
                 WHERE status = 'COMPLETED' AND updated_at >= :previous AND updated_at < :now
                """, bounds, (rs, row) -> new CompletedSessions(rs.getLong("total"), rs.getLong("previous")));
    }
}
