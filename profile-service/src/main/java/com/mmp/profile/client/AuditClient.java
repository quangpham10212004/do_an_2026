package com.mmp.profile.client;

import com.mmp.profile.security.JwtAuthenticationFilter;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/**
 * US-30 (interface dùng chung, auth-service do Team C cài) — ghi audit log cho mọi thao tác admin:
 * POST /internal/audit {actorId, actorRole, action, targetType, targetId, before, after} → 202.
 * Bắn rồi quên: chạy ngoài luồng request, lỗi chỉ log, KHÔNG bao giờ làm hỏng thao tác nghiệp vụ.
 */
@Component
public class AuditClient {

    private static final Logger log = LoggerFactory.getLogger(AuditClient.class);

    private final RestClient restClient;
    private final ExecutorService executor = new ThreadPoolExecutor(
            1, 2, 60L, TimeUnit.SECONDS, new LinkedBlockingQueue<>(500),
            r -> {
                Thread t = new Thread(r, "audit-log");
                t.setDaemon(true);
                return t;
            },
            new ThreadPoolExecutor.DiscardPolicy());

    public AuditClient(@Value("${app.services.auth-url}") String authUrl,
                       @Value("${app.security.internal-api-key}") String internalApiKey) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(3));
        factory.setReadTimeout(Duration.ofSeconds(10));
        this.restClient = RestClient.builder()
                .baseUrl(authUrl)
                .requestFactory(factory)
                .defaultHeader(JwtAuthenticationFilter.INTERNAL_HEADER, internalApiKey)
                .build();
    }

    /** Body của POST /internal/audit — hàm thuần để unit test. */
    public static Map<String, Object> body(UUID actorId, String actorRole, String action, String targetType,
                                           String targetId, Map<String, ?> before, Map<String, ?> after) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("actorId", actorId == null ? null : actorId.toString());
        body.put("actorRole", actorRole);
        body.put("action", action);
        body.put("targetType", targetType);
        body.put("targetId", targetId);
        body.put("before", before);
        body.put("after", after);
        return body;
    }

    public void recordAsync(UUID actorId, String actorRole, String action, String targetType, String targetId,
                            Map<String, ?> before, Map<String, ?> after) {
        Map<String, Object> body = body(actorId, actorRole, action, targetType, targetId, before, after);
        try {
            executor.execute(() -> send(body));
        } catch (RejectedExecutionException e) {
            log.warn("Bỏ audit {} {}: hàng đợi đầy", action, targetId);
        }
    }

    void send(Map<String, Object> body) {
        try {
            restClient.post().uri("/internal/audit").body(body).retrieve().toBodilessEntity();
        } catch (Exception e) {
            log.warn("Không ghi được audit {} cho {}: {}", body.get("action"), body.get("targetId"), e.getMessage());
        }
    }

    @PreDestroy
    void shutdown() {
        executor.shutdown();
    }
}
