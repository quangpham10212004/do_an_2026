package com.mmp.auth.client;

import com.mmp.auth.observability.RequestIds;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.time.DateTimeException;
import java.time.ZoneId;
import java.util.UUID;

/**
 * US-38 — múi giờ của người nhận email (PRD-PROF-6, hồ sơ ở profile-service) để áp giờ yên tĩnh. Lỗi / chưa có hồ sơ
 * → giờ Việt Nam.
 */
@Component
public class ProfileClient {

    private static final Logger log = LoggerFactory.getLogger(ProfileClient.class);
    public static final ZoneId DEFAULT_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private final RestClient restClient;

    record Summary(UUID userId, String displayName, String role, String domain, String timezone) {
    }

    public ProfileClient(@Value("${app.services.profile-url:http://localhost:8082}") String profileUrl,
                         @Value("${app.security.internal-api-key}") String internalApiKey) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(2000);
        factory.setReadTimeout(3000);
        this.restClient = RestClient.builder()
                .requestInterceptor(RequestIds.interceptor()).baseUrl(profileUrl).requestFactory(factory)
                .defaultHeader("X-Internal-Token", internalApiKey).build();
    }

    public ZoneId timezone(UUID userId) {
        try {
            Summary s = restClient.get().uri("/internal/profile-summary/{id}", userId).retrieve().body(Summary.class);
            return s == null || s.timezone() == null || s.timezone().isBlank() ? DEFAULT_ZONE : ZoneId.of(s.timezone());
        } catch (RestClientException | DateTimeException e) {
            log.debug("Timezone of {} unavailable: {}", userId, e.getMessage());
            return DEFAULT_ZONE;
        }
    }
}
