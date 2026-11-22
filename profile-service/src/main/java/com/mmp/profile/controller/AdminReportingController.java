package com.mmp.profile.controller;

import com.mmp.profile.exception.ApiException;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/profile/admin/reporting")
@PreAuthorize("hasRole('ADMIN')")
public class AdminReportingController {
    private final NamedParameterJdbcTemplate jdbc;

    public AdminReportingController(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record MentorCounts(long accepting, long verified) {}
    public record MentorDisplay(String name, double rating) {}

    @GetMapping("/mentor-counts")
    public MentorCounts mentorCounts() {
        return jdbc.queryForObject("""
                SELECT count(*) FILTER (WHERE status = 'ACCEPTING' AND active_mentee_count < capacity) AS accepting,
                       count(*) AS verified
                  FROM mentor_profiles WHERE verification_status = 'APPROVED'
                """, Map.of(), (rs, row) -> new MentorCounts(rs.getLong("accepting"), rs.getLong("verified")));
    }

    @GetMapping("/mentor-names")
    public Map<UUID, MentorDisplay> mentorNames(@RequestParam List<UUID> ids) {
        if (ids.size() > 100) throw ApiException.badRequest("TOO_MANY_USERS", "Tối đa 100 người dùng");
        if (ids.isEmpty()) return Map.of();
        return jdbc.query("""
                SELECT user_id, display_name, rating FROM mentor_profiles WHERE user_id IN (:ids)
                """, Map.of("ids", ids), rs -> {
            Map<UUID, MentorDisplay> profiles = new HashMap<>();
            while (rs.next()) {
                profiles.put(rs.getObject("user_id", UUID.class), new MentorDisplay(rs.getString("display_name"), rs.getDouble("rating")));
            }
            return profiles;
        });
    }
}
