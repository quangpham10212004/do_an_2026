package com.mmp.mentoring.client;

import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.security.JwtAuthenticationFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.math.BigDecimal;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/** Gọi endpoint nội bộ/API của profile-service (header X-Internal-Token). */
@Component
public class ProfileClient {

    private static final Logger log = LoggerFactory.getLogger(ProfileClient.class);

    private final RestClient restClient;

    public ProfileClient(@Value("${app.services.profile-url}") String profileUrl,
                         @Value("${app.security.internal-api-key}") String internalApiKey) {
        this.restClient = RestClient.builder()
                .baseUrl(profileUrl)
                .defaultHeader(JwtAuthenticationFilter.INTERNAL_HEADER, internalApiKey)
                .build();
    }

    public record AvailabilitySlot(UUID id, int dayOfWeek, LocalTime startTime, LocalTime endTime) {
    }

    public record MentorInfo(UUID userId, String displayName, List<String> skills, String domain, String bio,
                             int yearsExperience, BigDecimal hourlyRate, int capacity, int activeMenteeCount,
                             boolean isAvailable, float rating, int ratingCount, String verificationStatus,
                             List<AvailabilitySlot> availability) {
    }

    public record MenteeInfo(UUID userId, String displayName, String goal, String domain, String currentLevel,
                             List<String> skills, String cvFileUrl) {
    }

    public record ProfileSummary(UUID userId, String displayName, String role, String domain) {
    }

    public Optional<MentorInfo> findMentor(UUID mentorId) {
        try {
            return Optional.ofNullable(restClient.get().uri("/internal/mentor/{id}", mentorId).retrieve().body(MentorInfo.class));
        } catch (HttpClientErrorException.NotFound e) {
            return Optional.empty();
        } catch (RestClientException e) {
            throw unavailable(e);
        }
    }

    public Optional<MenteeInfo> findMentee(UUID menteeId) {
        try {
            return Optional.ofNullable(restClient.get().uri("/api/profile/mentee/{id}", menteeId).retrieve().body(MenteeInfo.class));
        } catch (HttpClientErrorException.NotFound e) {
            return Optional.empty();
        } catch (RestClientException e) {
            throw unavailable(e);
        }
    }

    /** Tóm tắt hồ sơ (tên hiển thị) — lỗi trả về empty, không làm hỏng màn hình danh sách. */
    public Optional<ProfileSummary> summary(UUID userId) {
        try {
            return Optional.ofNullable(restClient.get().uri("/internal/profile-summary/{id}", userId).retrieve().body(ProfileSummary.class));
        } catch (RestClientException e) {
            return Optional.empty();
        }
    }

    /** Cache tên hiển thị trong phạm vi 1 lần dựng danh sách để tránh gọi lặp. */
    public Map<UUID, String> displayNames(java.util.Collection<UUID> ids) {
        Map<UUID, String> result = new ConcurrentHashMap<>();
        ids.stream().distinct().forEach(id -> result.put(id, summary(id).map(ProfileSummary::displayName).orElse("Người dùng")));
        return result;
    }

    public void updateVerification(UUID mentorId, String status) {
        try {
            restClient.put().uri("/internal/mentor/{id}/verification", mentorId)
                    .body(Map.of("status", status)).retrieve().toBodilessEntity();
        } catch (RestClientException e) {
            throw unavailable(e);
        }
    }

    public void updateRating(UUID mentorId, double rating, long count) {
        try {
            restClient.put().uri("/internal/mentor/{id}/rating", mentorId)
                    .body(Map.of("rating", (float) rating, "ratingCount", count)).retrieve().toBodilessEntity();
        } catch (RestClientException e) {
            log.warn("Could not sync rating for mentor {}: {}", mentorId, e.getMessage());
        }
    }

    public void updateActiveMentees(UUID mentorId, long count) {
        try {
            restClient.put().uri("/internal/mentor/{id}/active-mentees", mentorId)
                    .body(Map.of("activeMenteeCount", count)).retrieve().toBodilessEntity();
        } catch (RestClientException e) {
            log.warn("Could not sync active mentee count for mentor {}: {}", mentorId, e.getMessage());
        }
    }

    /** FR-8.5 — gửi goal đã làm rõ sang profile-service để cập nhật hồ sơ & sinh lại embedding. */
    public void applyEnrichment(UUID menteeId, String enrichedGoal, List<String> cvSkills, String cvFileUrl) {
        restClient.post().uri("/api/profile/mentee/{id}/enrichment-chat", menteeId)
                .body(Map.of("enrichedGoalText", enrichedGoal, "cvSkills", cvSkills, "cvFileUrl", cvFileUrl))
                .retrieve().toBodilessEntity();
    }

    private static ApiException unavailable(RestClientException e) {
        log.warn("profile-service call failed: {}", e.getMessage());
        return new ApiException(HttpStatus.BAD_GATEWAY, "PROFILE_SERVICE_UNAVAILABLE", "Không thể kết nối tới dịch vụ hồ sơ");
    }
}
