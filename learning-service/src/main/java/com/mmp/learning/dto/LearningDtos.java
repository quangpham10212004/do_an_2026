package com.mmp.learning.dto;

import jakarta.validation.constraints.*;

import java.util.List;
import java.util.UUID;

public final class LearningDtos {

    private LearningDtos() {
    }

    public record CourseSummary(UUID id, String title, String description, String domain, String level,
                                List<String> skills, String coverUrl, String instructor, long materialCount,
                                int durationMinutes, boolean enrolled, float percentComplete) {
    }

    public record MaterialView(UUID id, String title, String type, String url, String content, int orderIndex,
                               int durationMinutes, boolean completed) {
    }

    public record CourseDetail(UUID id, String title, String description, String domain, String level,
                               List<String> skills, String coverUrl, String instructor, List<String> outcomes,
                               int durationMinutes, boolean enrolled, float percentComplete, long enrollmentCount,
                               UUID nextMaterialId, List<MaterialView> materials) {
    }

    /** Giữ nguyên schema Progress trong contracts/learning-service.yaml */
    public record Progress(UUID courseId, UUID userId, float percentComplete) {
    }

    public record RoadmapSummary(UUID id, String title, String track, String description, String coverUrl,
                                 String level, Integer estimatedWeeks, int itemCount, float percentComplete) {
    }

    /** completed = đánh dấu tay HOẶC khoá học gắn kèm đã đạt 100%; coursePercent chỉ có khi mục gắn khoá học. */
    public record RoadmapItemView(UUID id, String title, String description, int orderIndex, String stage,
                                  Integer estimatedHours, UUID courseId, String courseTitle, String courseCoverUrl,
                                  Float coursePercent, boolean completed) {
    }

    public record RoadmapDetail(UUID id, String title, String track, String description, String coverUrl,
                                String level, Integer estimatedWeeks, float percentComplete, UUID nextItemId,
                                List<RoadmapItemView> items) {
    }

    // ---- Admin input ----

    public record CourseInput(
            @NotBlank @Size(max = 200) String title,
            @Size(max = 3000) String description,
            @NotBlank @Size(max = 50) String domain,
            @Pattern(regexp = "BEGINNER|INTERMEDIATE|ADVANCED") String level,
            @Size(max = 20) List<@NotBlank @Size(max = 50) String> skills,
            @Size(max = 500) String coverUrl,
            @Size(max = 100) String instructor,
            @Size(max = 10) List<@NotBlank @Size(max = 200) String> outcomes) {
    }

    public record MaterialInput(
            @NotBlank @Size(max = 200) String title,
            @Pattern(regexp = "ARTICLE|VIDEO|DOCUMENT|EXERCISE") String type,
            @Size(max = 500) String url,
            @Size(max = 30000) String content,
            @Min(0) Integer orderIndex,
            @Min(1) @Max(600) Integer durationMinutes) {
    }

    public record RoadmapInput(
            @NotBlank @Size(max = 200) String title,
            @NotBlank @Size(max = 50) String track,
            @Size(max = 3000) String description,
            @Size(max = 500) String coverUrl,
            @Pattern(regexp = "BEGINNER|INTERMEDIATE|ADVANCED") String level,
            @Min(1) @Max(104) Integer estimatedWeeks) {
    }

    public record RoadmapItemInput(
            @NotBlank @Size(max = 200) String title,
            @Size(max = 3000) String description,
            @Min(0) Integer orderIndex,
            @Size(max = 100) String stage,
            @Min(1) @Max(1000) Integer estimatedHours,
            UUID courseId) {
    }
}
