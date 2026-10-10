package com.mmp.payment.client;

import com.mmp.payment.security.JwtAuthenticationFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.UUID;

/** US-42 — tên hiển thị trên biên lai (profile-service GET /internal/profile-summary/{id}); lỗi → "Người dùng". */
@Component
public class ProfileClient {

    private final RestClient restClient;

    record Summary(UUID userId, String displayName) {
    }

    public ProfileClient(@Value("${app.services.profile-url:http://localhost:8082}") String profileUrl,
                         @Value("${app.security.internal-api-key}") String internalApiKey) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(2000);
        factory.setReadTimeout(3000);
        this.restClient = RestClient.builder().baseUrl(profileUrl).requestFactory(factory)
                .defaultHeader(JwtAuthenticationFilter.INTERNAL_HEADER, internalApiKey).build();
    }

    public String displayName(UUID userId) {
        try {
            Summary s = restClient.get().uri("/internal/profile-summary/{id}", userId).retrieve().body(Summary.class);
            return s == null || s.displayName() == null ? "Người dùng" : s.displayName();
        } catch (RestClientException e) {
            return "Người dùng";
        }
    }
}
