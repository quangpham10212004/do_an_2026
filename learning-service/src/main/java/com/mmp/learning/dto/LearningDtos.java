package com.mmp.learning.dto;

import jakarta.validation.constraints.*;

import java.util.List;
import java.util.UUID;

public final class LearningDtos {

    private LearningDtos() {
    }

    public record CourseSummary(UUID id, String title, String description, String domain, String level,
                                List<String> skills, long materialCount, boolean enrolled, float percentComplete) {
    }

    public record MaterialView(UUID id, String title, String type, String url, String content, int orderIndex,
                               boolean completed) {
    }

    public record CourseDetail(UUID id, String title, String description, String domain, String level,
                               List<String> skills, boolean enrolled, float percentComplete, long enrollmentCount,
                               List<MaterialView> materials) {
    }

    /** Giữ nguyên schema Progress trong contracts/learning-service.yaml */
    public record Progress(UUID courseId, UUID userId, float percentComplete) {
    }

    public record RoadmapSummary(UUID id, String title, String track, String description, int itemCount) {
    }

    public record RoadmapItemView(UUID id, String title, String description, int orderIndex, UUID courseId,
                                  String courseTitle, boolean completed) {
    }

    public record RoadmapDetail(UUID id, String title, String track, String description, float percentComplete,
                                List<RoadmapItemView> items) {
    }

    // ---- Admin input ----

    public record CourseInput(
            @NotBlank @Size(max = 200) String title,
            @Size(max = 3000) String description,
            @NotBlank @Size(max = 50) String domain,
            @Pattern(regexp = "BEGINNER|INTERMEDIATE|ADVANCED") String level,
            @Size(max = 20) List<@NotBlank @Size(max = 50) String> skills) {
    }

    public record MaterialInput(
            @NotBlank @Size(max = 200) String title,
            @Pattern(regexp = "ARTICLE|VIDEO|DOCUMENT|EXERCISE") String type,
            @Size(max = 500) String url,
            @Size(max = 10000) String content,
            @Min(0) Integer orderIndex) {
    }

    public record RoadmapInput(
            @NotBlank @Size(max = 200) String title,
            @NotBlank @Size(max = 50) String track,
            @Size(max = 3000) String description) {
    }

    public record RoadmapItemInput(
            @NotBlank @Size(max = 200) String title,
            @Size(max = 3000) String description,
            @Min(0) Integer orderIndex,
            UUID courseId) {
    }
}
