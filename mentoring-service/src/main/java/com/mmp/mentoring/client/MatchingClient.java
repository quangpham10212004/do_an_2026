package com.mmp.mentoring.client;

import com.mmp.mentoring.observability.RequestIds;
import com.mmp.mentoring.security.JwtAuthenticationFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

/**
 * Gọi matching-service (Team B). US-15: gợi ý mentor tương tự khi yêu cầu hết hạn —
 * GET /internal/matching/similar-mentors?menteeId=&excludeMentorId=&limit= (X-Internal-Token) trả
 * {@code {mentors:[{mentorId, fullName, score}]}}. Best-effort, timeout ngắn: lỗi / 404 → danh sách rỗng.
 */
@Component
public class MatchingClient {

    private static final Logger log = LoggerFactory.getLogger(MatchingClient.class);

    private final RestClient restClient;

    public MatchingClient(@Value("${app.services.matching-url}") String matchingUrl,
                          @Value("${app.security.internal-api-key}") String internalApiKey,
                          @Value("${app.services.matching-timeout:PT3S}") Duration timeout) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) timeout.toMillis());
        factory.setReadTimeout((int) timeout.toMillis());
        this.restClient = RestClient.builder()
                .requestInterceptor(RequestIds.interceptor())
                .baseUrl(matchingUrl)
                .requestFactory(factory)
                .defaultHeader(JwtAuthenticationFilter.INTERNAL_HEADER, internalApiKey)
                .build();
    }

    public record SimilarMentor(UUID mentorId, String fullName, Double score) {
    }

    public record SimilarMentors(List<SimilarMentor> mentors) {
    }

    public List<SimilarMentor> similarMentors(UUID menteeId, UUID excludeMentorId, int limit) {
        try {
            SimilarMentors res = restClient.get()
                    .uri(b -> b.path("/internal/matching/similar-mentors")
                            .queryParam("menteeId", menteeId)
                            .queryParam("excludeMentorId", excludeMentorId)
                            .queryParam("limit", limit)
                            .build())
                    .retrieve()
                    .body(SimilarMentors.class);
            if (res == null || res.mentors() == null) return List.of();
            return res.mentors().stream()
                    .filter(m -> m != null && m.mentorId() != null && !m.mentorId().equals(excludeMentorId))
                    .limit(limit)
                    .toList();
        } catch (RuntimeException e) {
            log.info("similar-mentors unavailable for mentee {} (sending notification without suggestions): {}", menteeId, e.getMessage());
            return List.of();
        }
    }
}
