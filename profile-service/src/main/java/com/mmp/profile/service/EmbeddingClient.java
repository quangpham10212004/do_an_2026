package com.mmp.profile.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

/**
 * Gọi sang matching-service (POST /internal/embed) để sinh embedding vector
 * từ 1 đoạn text đã chuẩn hóa. Xem contracts/matching-service.yaml.
 *
 * Lưu ý: nếu matching-service không phản hồi, KHÔNG được chặn việc lưu
 * profile — bắt lỗi và log lại để retry sau (TODO: hàng đợi retry, hiện
 * tại skeleton chỉ log warning).
 */
@Component
public class EmbeddingClient {

    private final RestClient restClient;

    public EmbeddingClient(@Value("${matching.service.url:http://localhost:8090}") String matchingServiceUrl) {
        this.restClient = RestClient.builder().baseUrl(matchingServiceUrl).build();
    }

    @SuppressWarnings("unchecked")
    public List<Double> embed(String normalizedText) {
        try {
            Map<String, Object> response = restClient.post()
                    .uri("/internal/embed")
                    .body(Map.of("text", normalizedText))
                    .retrieve()
                    .body(Map.class);
            return (List<Double>) response.get("embedding");
        } catch (Exception e) {
            // TODO: đẩy vào retry queue thay vì chỉ log — tránh mất embedding
            // nếu matching-service tạm thời down.
            System.err.println("[EmbeddingClient] Failed to get embedding: " + e.getMessage());
            return null;
        }
    }
}
