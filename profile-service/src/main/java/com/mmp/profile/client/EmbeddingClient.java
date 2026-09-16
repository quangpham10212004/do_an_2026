package com.mmp.profile.client;

import com.mmp.profile.security.JwtAuthenticationFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Gọi sang matching-service (POST /internal/embed) để sinh embedding vector từ
 * 1 đoạn text đã chuẩn hóa. Xem contracts/matching-service.yaml.
 *
 * Nếu matching-service không phản hồi, KHÔNG chặn việc lưu profile — trả về
 * Optional.empty() để EmbeddingService đánh dấu profile cần retry.
 */
@Component
public class EmbeddingClient {

    private static final Logger log = LoggerFactory.getLogger(EmbeddingClient.class);

    private final RestClient restClient;

    public EmbeddingClient(@Value("${app.services.matching-url}") String matchingServiceUrl,
                           @Value("${app.security.internal-api-key}") String internalApiKey) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(3));
        factory.setReadTimeout(Duration.ofSeconds(20));
        this.restClient = RestClient.builder()
                .baseUrl(matchingServiceUrl)
                .requestFactory(factory)
                .defaultHeader(JwtAuthenticationFilter.INTERNAL_HEADER, internalApiKey)
                .build();
    }

    record EmbedResponse(List<Double> embedding) {
    }

    public Optional<List<Double>> embed(String normalizedText) {
        try {
            EmbedResponse response = restClient.post()
                    .uri("/internal/embed")
                    .body(Map.of("text", normalizedText))
                    .retrieve()
                    .body(EmbedResponse.class);
            return Optional.ofNullable(response).map(EmbedResponse::embedding).filter(v -> !v.isEmpty());
        } catch (Exception e) {
            log.warn("Failed to get embedding from matching-service: {}", e.getMessage());
            return Optional.empty();
        }
    }
}
