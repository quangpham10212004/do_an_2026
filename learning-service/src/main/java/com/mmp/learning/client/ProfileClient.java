package com.mmp.learning.client;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.Optional;
import java.util.UUID;

/** Gọi profile-service (GET /internal/profile-summary/{id}) để lấy tên hiển thị tác giả blog. */
@Component
public class ProfileClient {

    private static final Logger log = LoggerFactory.getLogger(ProfileClient.class);

    public record ProfileSummary(UUID userId, String displayName, String role) {
    }

    private final RestClient restClient;

    public ProfileClient(@Value("${app.profile-service.url:http://localhost:8082}") String baseUrl,
                         @Value("${app.security.internal-api-key}") String internalKey) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(2));
        factory.setReadTimeout(Duration.ofSeconds(3));
        this.restClient = RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(factory)
                .defaultHeader("X-Internal-Token", internalKey)
                .build();
    }

    /** Tên hiển thị; empty khi profile-service lỗi hoặc người dùng chưa có hồ sơ (không chặn luồng đăng bài). */
    public Optional<String> displayName(UUID userId) {
        try {
            ProfileSummary summary = restClient.get().uri("/internal/profile-summary/{id}", userId)
                    .retrieve().body(ProfileSummary.class);
            if (summary == null || summary.displayName() == null || summary.displayName().isBlank()) return Optional.empty();
            return Optional.of(summary.displayName().trim());
        } catch (Exception e) {
            log.warn("Không lấy được tên hiển thị của {}: {}", userId, e.getMessage());
            return Optional.empty();
        }
    }
}
