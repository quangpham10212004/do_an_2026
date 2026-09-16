package com.mmp.learning.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Các bảng quan hệ nhiều-nhiều đơn giản (enrollment, completion) được thao tác
 * bằng JDBC thay vì tạo entity riêng — ngắn gọn và idempotent nhờ ON CONFLICT.
 */
@Repository
public class ProgressJdbcRepository {

    private final JdbcTemplate jdbc;

    public ProgressJdbcRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void enroll(UUID courseId, UUID userId) {
        jdbc.update("INSERT INTO course_enrollments (course_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING", courseId, userId);
    }

    public void unenroll(UUID courseId, UUID userId) {
        jdbc.update("DELETE FROM course_enrollments WHERE course_id = ? AND user_id = ?", courseId, userId);
    }

    public boolean isEnrolled(UUID courseId, UUID userId) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM course_enrollments WHERE course_id = ? AND user_id = ?",
                Integer.class, courseId, userId);
        return n != null && n > 0;
    }

    public Set<UUID> enrolledCourseIds(UUID userId) {
        return new HashSet<>(jdbc.queryForList("SELECT course_id FROM course_enrollments WHERE user_id = ?", UUID.class, userId));
    }

    public void completeMaterial(UUID materialId, UUID userId) {
        jdbc.update("INSERT INTO material_completions (material_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING", materialId, userId);
    }

    public void uncompleteMaterial(UUID materialId, UUID userId) {
        jdbc.update("DELETE FROM material_completions WHERE material_id = ? AND user_id = ?", materialId, userId);
    }

    public Set<UUID> completedMaterialIds(UUID courseId, UUID userId) {
        List<UUID> ids = jdbc.queryForList("""
                SELECT mc.material_id FROM material_completions mc
                JOIN course_materials m ON m.id = mc.material_id
                WHERE m.course_id = ? AND mc.user_id = ?
                """, UUID.class, courseId, userId);
        return new HashSet<>(ids);
    }

    public void completeRoadmapItem(UUID itemId, UUID userId) {
        jdbc.update("INSERT INTO roadmap_item_progress (item_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING", itemId, userId);
    }

    public void uncompleteRoadmapItem(UUID itemId, UUID userId) {
        jdbc.update("DELETE FROM roadmap_item_progress WHERE item_id = ? AND user_id = ?", itemId, userId);
    }

    public Set<UUID> completedRoadmapItemIds(UUID roadmapId, UUID userId) {
        return new HashSet<>(jdbc.queryForList("""
                SELECT p.item_id FROM roadmap_item_progress p
                JOIN roadmap_items i ON i.id = p.item_id
                WHERE i.roadmap_id = ? AND p.user_id = ?
                """, UUID.class, roadmapId, userId));
    }

    public long enrollmentCount(UUID courseId) {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM course_enrollments WHERE course_id = ?", Long.class, courseId);
        return n == null ? 0 : n;
    }
}
