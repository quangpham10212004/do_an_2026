package com.mmp.profile.controller;

import com.mmp.profile.client.MentoringClient;
import com.mmp.profile.exception.ApiException;
import com.mmp.profile.security.AuthUser;
import com.mmp.profile.security.CurrentUser;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Dữ liệu bổ sung cho trang cá nhân: số liệu từ mentoring-service ghép với tên/hồ sơ ở đây
 * (frontend: features/profilex).
 */
@RestController
@RequestMapping("/api/profile")
public class ProfileExtrasController {

    private final JdbcTemplate jdbc;
    private final MentoringClient mentoring;

    public ProfileExtrasController(JdbcTemplate jdbc, MentoringClient mentoring) {
        this.jdbc = jdbc;
        this.mentoring = mentoring;
    }

    /** Tên hiển thị (chỉ tên) của tối đa 3 mentee đã học với mentor, kèm tổng số mentee. */
    @GetMapping("/mentors/{mentorId}/classmates")
    public Map<String, Object> classmates(@PathVariable UUID mentorId) {
        Map<String, Object> data = mentoring.classmates(mentorId);
        List<String> names = new ArrayList<>();
        long total = 0;
        if (data != null) {
            total = ((Number) data.getOrDefault("total", 0)).longValue();
            for (Object id : (List<?>) data.getOrDefault("menteeIds", List.of())) {
                String name = displayName("mentee_profiles", UUID.fromString(id.toString()));
                if (name != null) names.add(name);
            }
        }
        return Map.of("names", names, "total", total);
    }

    @GetMapping("/mentee/{menteeId}/extras")
    public Map<String, Object> menteeExtras(@PathVariable UUID menteeId) {
        AuthUser user = CurrentUser.get();
        if ("MENTEE".equals(user.role()) && !user.userId().equals(menteeId)) {
            throw ApiException.forbidden("Bạn không có quyền xem hồ sơ này");
        }
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT created_at, skills FROM mentee_profiles WHERE user_id = ?", menteeId);
        if (rows.isEmpty()) throw ApiException.notFound("PROFILE_NOT_FOUND", "Không tìm thấy hồ sơ mentee");
        Map<String, Object> profile = rows.get(0);
        Map<String, Object> summary = mentoring.menteeSummary(menteeId);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("joinedAt", String.valueOf(profile.get("created_at") instanceof java.sql.Timestamp t
                ? t.toInstant() : profile.get("created_at")));
        out.put("sessionsCompleted", summary == null ? 0 : ((Number) summary.getOrDefault("sessionsCompleted", 0)).longValue());
        out.put("onTimeRate", summary == null ? null : summary.get("onTimeRate"));
        out.put("wantedSkills", skills(profile.get("skills")));
        out.put("wantedSessionTypes", List.of());

        Map<UUID, String[]> mentorInfo = new HashMap<>();
        List<Map<String, Object>> mentors = new ArrayList<>();
        List<Map<String, Object>> feedbacks = new ArrayList<>();
        if (summary != null) {
            for (Object o : (List<?>) summary.getOrDefault("mentors", List.of())) {
                Map<?, ?> m = (Map<?, ?>) o;
                UUID mentorId = UUID.fromString(m.get("mentorId").toString());
                String[] info = mentorInfo.computeIfAbsent(mentorId, this::mentorInfo);
                Map<String, Object> link = new LinkedHashMap<>();
                link.put("mentorId", mentorId);
                link.put("name", info[0]);
                link.put("headline", info[1]);
                link.put("sessions", ((Number) m.get("sessions")).longValue());
                mentors.add(link);
            }
            for (Object o : (List<?>) summary.getOrDefault("feedbacks", List.of())) {
                Map<?, ?> f = (Map<?, ?>) o;
                UUID mentorId = UUID.fromString(f.get("mentorId").toString());
                String[] info = mentorInfo.computeIfAbsent(mentorId, this::mentorInfo);
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", f.get("id"));
                item.put("mentorId", mentorId);
                item.put("mentorName", info[0]);
                item.put("rating", ((Number) f.get("rating")).doubleValue());
                item.put("period", period(String.valueOf(f.get("createdAt"))));
                item.put("sessionType", f.get("sessionType") == null ? "CAREER_ADVICE" : f.get("sessionType"));
                item.put("comment", f.get("comment") == null ? "" : f.get("comment"));
                feedbacks.add(item);
            }
        }
        out.put("mentors", mentors);
        out.put("feedbacks", feedbacks);
        return out;
    }

    private String displayName(String table, UUID id) {
        List<String> rows = jdbc.queryForList("SELECT display_name FROM " + table + " WHERE user_id = ?", String.class, id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private String[] mentorInfo(UUID id) {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT display_name, headline FROM mentor_profiles WHERE user_id = ?", id);
        if (rows.isEmpty()) return new String[]{"Mentor", ""};
        Object name = rows.get(0).get("display_name"), headline = rows.get(0).get("headline");
        return new String[]{name == null ? "Mentor" : name.toString(), headline == null ? "" : headline.toString()};
    }

    private static List<String> skills(Object value) {
        if (value instanceof java.sql.Array array) {
            try {
                return Arrays.stream((Object[]) array.getArray()).map(Object::toString).toList();
            } catch (java.sql.SQLException e) {
                return List.of();
            }
        }
        return List.of();
    }

    private static String period(String iso) {
        try {
            OffsetDateTime at = OffsetDateTime.parse(iso);
            return "Tháng " + at.getMonthValue() + "/" + at.getYear();
        } catch (RuntimeException e) {
            return "";
        }
    }
}
