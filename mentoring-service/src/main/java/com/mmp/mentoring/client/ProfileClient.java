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

    private static ApiException unavailable(RestClientException e) {
        log.warn("profile-service call failed: {}", e.getMessage());
        return new ApiException(HttpStatus.BAD_GATEWAY, "PROFILE_SERVICE_UNAVAILABLE", "Không thể kết nối tới dịch vụ hồ sơ");
    }
}
