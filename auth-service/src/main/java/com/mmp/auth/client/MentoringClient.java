package com.mmp.auth.client;

import com.mmp.auth.observability.RequestIds;
import com.mmp.auth.security.JwtAuthenticationFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Map;
import java.util.UUID;

/**
 * Bản chốt v2.0 §2.1 — báo mentoring-service khi admin khoá / mở khoá tài khoản: buổi chưa diễn ra bị huỷ + hoàn 100%, ví bị đóng
 * băng (khoá) hoặc mở (mở khoá). Best-effort: lỗi chỉ ghi log (không hoàn tác trạng thái tài khoản); admin gọi lại thao tác để thử lại.
 */
@Component
public class MentoringClient {

    private static final Logger log = LoggerFactory.getLogger(MentoringClient.class);

    private final RestClient restClient;

    public MentoringClient(@Value("${app.services.mentoring-url:http://localhost:8083}") String mentoringUrl,
                           @Value("${app.security.internal-api-key}") String internalApiKey) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(2000);
        factory.setReadTimeout(30000);   // huỷ nhiều buổi + hoàn tiền tuần tự
        this.restClient = RestClient.builder()
                .requestInterceptor(RequestIds.interceptor())
                .baseUrl(mentoringUrl)
                .requestFactory(factory)
                .defaultHeader(JwtAuthenticationFilter.INTERNAL_HEADER, internalApiKey)
                .build();
    }

    public void accountLockChanged(UUID userId, boolean locked, UUID actorId, String reason) {
        try {
            Map<String, Object> body = new java.util.HashMap<>();
            body.put("locked", locked);
            body.put("actorId", actorId == null ? null : actorId.toString());
            body.put("reason", reason);
            restClient.post().uri("/internal/accounts/{id}/lock", userId).body(body).retrieve().toBodilessEntity();
        } catch (Exception e) {
            log.warn("Could not notify mentoring-service that account {} was {}: {}", userId, locked ? "locked" : "unlocked", e.getMessage());
        }
    }
}
