package com.mmp.profile.dto;

import com.mmp.profile.entity.MenteeProfile;
import com.mmp.profile.entity.MentorAvailability;
import com.mmp.profile.entity.MentorProfile;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

public final class ProfileDtos {

    private ProfileDtos() {
    }

    public record MentorProfileInput(
            @NotBlank @Size(max = 100) String displayName,
            @NotNull @Size(min = 1, max = 30, message = "cần khai báo 1-30 kỹ năng") List<@NotBlank @Size(max = 50) String> skills,
            @NotBlank @Size(max = 50) String domain,
            @NotBlank @Size(max = 3000) String bio,
            @Min(0) @Max(60) Integer yearsExperience,
            @Size(max = 500) String cvFileUrl,
            @Size(max = 10) List<@Size(max = 300) String> portfolioLinks,
            @DecimalMin("0") @DecimalMax("100000000") BigDecimal hourlyRate,
            @Min(1) @Max(50) Integer capacity,
            Boolean isAvailable) {
    }

    public record MentorProfileResponse(
            UUID userId,
            String displayName,
            List<String> skills,
            String domain,
            String bio,
            int yearsExperience,
            String cvFileUrl,
            List<String> portfolioLinks,
            BigDecimal hourlyRate,
            int capacity,
            int activeMenteeCount,
            boolean isAvailable,
            float rating,
            int ratingCount,
            String verificationStatus,
            OffsetDateTime embeddingUpdatedAt,
            String embeddingStatus,
            List<AvailabilitySlot> availability) {

        public static MentorProfileResponse from(MentorProfile p, List<AvailabilitySlot> slots, String embeddingStatus) {
            return new MentorProfileResponse(p.getUserId(), p.getDisplayName(), Arrays.asList(p.getSkills()),
                    p.getDomain(), p.getBio(), p.getYearsExperience(), p.getCvFileUrl(),
                    Arrays.asList(p.getPortfolioLinks()), p.getHourlyRate(), p.getCapacity(),
                    p.getActiveMenteeCount(), p.isAvailable(), p.getRating(), p.getRatingCount(),
                    p.getVerificationStatus().name(), p.getEmbeddingUpdatedAt(), embeddingStatus,
                    slots);
        }
    }

    public record MenteeProfileInput(
            @NotBlank @Size(max = 100) String displayName,
            @NotBlank @Size(max = 3000) String goal,
            @NotBlank @Size(max = 50) String domain,
            @Pattern(regexp = "BEGINNER|INTERMEDIATE|ADVANCED") String currentLevel,
            @Size(max = 30) List<@NotBlank @Size(max = 50) String> skills,
            @Size(max = 10) List<@Size(max = 300) String> portfolioLinks,
            @Size(max = 500) String cvFileUrl) {
    }

    public record MenteeProfileResponse(
            UUID userId,
            String displayName,
            String goal,
            String domain,
            String currentLevel,
            List<String> skills,
            List<String> portfolioLinks,
            String cvFileUrl,
            OffsetDateTime embeddingUpdatedAt,
            String embeddingStatus) {

        public static MenteeProfileResponse from(MenteeProfile p, String embeddingStatus) {
            return new MenteeProfileResponse(p.getUserId(), p.getDisplayName(), p.getGoal(), p.getDomain(),
                    p.getCurrentLevel().name(), Arrays.asList(p.getSkills()), Arrays.asList(p.getPortfolioLinks()),
                    p.getCvFileUrl(), p.getEmbeddingUpdatedAt(), embeddingStatus);
        }
    }

    public record AvailabilitySlot(
            UUID id,
            @NotNull @Min(1) @Max(7) Integer dayOfWeek,
            @NotNull LocalTime startTime,
            @NotNull LocalTime endTime) {

        public static AvailabilitySlot from(MentorAvailability a) {
            return new AvailabilitySlot(a.getId(), a.getDayOfWeek(), a.getStartTime(), a.getEndTime());
        }
    }

    public record AvailabilityInput(@NotNull @Size(max = 50) List<@Valid AvailabilitySlot> slots) {
    }

    public record EnrichmentInput(
            @NotBlank @Size(max = 3000) String enrichedGoalText,
            @Size(max = 30) List<@Size(max = 50) String> cvSkills,
            @Size(max = 500) String cvFileUrl) {
    }

    public record ProfileSummary(UUID userId, String displayName, String role, String domain) {
    }

    public record MentorCard(
            UUID userId,
            String displayName,
            String domain,
            List<String> skills,
            int yearsExperience,
            float rating,
            int ratingCount,
            BigDecimal hourlyRate,
            boolean isAvailable,
            boolean hasCapacity,
            String verificationStatus) {

        public static MentorCard from(MentorProfile p) {
            return new MentorCard(p.getUserId(), p.getDisplayName(), p.getDomain(), Arrays.asList(p.getSkills()),
                    p.getYearsExperience(), p.getRating(), p.getRatingCount(), p.getHourlyRate(), p.isAvailable(),
                    p.getActiveMenteeCount() < p.getCapacity(), p.getVerificationStatus().name());
        }
    }

    public record PageResponse<T>(List<T> items, int page, int size, long totalItems, int totalPages) {
    }

    public record VerificationUpdate(@NotNull @Pattern(regexp = "PENDING_INTERVIEW|PENDING_REVIEW|APPROVED|REJECTED") String status) {
    }

    public record RatingUpdate(@NotNull @DecimalMin("0") @DecimalMax("5") Float rating, @NotNull @Min(0) Integer ratingCount) {
    }

    public record ActiveMenteeUpdate(@NotNull @Min(0) Integer activeMenteeCount) {
    }
}
