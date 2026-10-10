package com.mmp.payment.client;

import com.mmp.payment.observability.RequestIds;
import com.mmp.payment.security.JwtAuthenticationFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/**
 * US-30 (Team C, auth-service) — nhật ký kiểm toán. Gọi {@code POST /internal/audit} kiểu bắn-rồi-quên trên luồng nền:
 * lỗi / auth-service chưa có endpoint chỉ ghi log, không bao giờ làm hỏng nghiệp vụ. payment-service ghi mọi biến động
 * tiền: CHARGE_SUCCEEDED, REFUND_CREATED, PAYMENT_HELD, PAYMENT_RELEASED, EARNING_PENDING, EARNING_RELEASED,
 * EARNING_REVERSED.
 */
@Component
public class AuditClient {

    private static final Logger log = LoggerFactory.getLogger(AuditClient.class);

    private final RestClient restClient;
    private final ThreadPoolExecutor executor = new ThreadPoolExecutor(1, 2, 30, TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(1000), r -> {
        Thread t = new Thread(r, "audit-client");
        t.setDaemon(true);
        return t;
    }, new ThreadPoolExecutor.DiscardPolicy());

    public AuditClient(@Value("${app.services.auth-url:http://localhost:8081}") String authUrl,
                       @Value("${app.security.internal-api-key}") String internalApiKey) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(2000);
        factory.setReadTimeout(3000);
        this.restClient = RestClient.builder()
                .requestInterceptor(RequestIds.interceptor())
                .baseUrl(authUrl)
                .requestFactory(factory)
                .defaultHeader(JwtAuthenticationFilter.INTERNAL_HEADER, internalApiKey)
                .build();
    }

    /** actorRole: ADMIN | MENTOR | MENTEE | SYSTEM. before/after có thể null. */
    public void record(UUID actorId, String actorRole, String action, String targetType, String targetId,
                       Map<String, ?> before, Map<String, ?> after) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("actorId", actorId == null ? null : actorId.toString());
        body.put("actorRole", actorRole == null ? "SYSTEM" : actorRole);
        body.put("action", action);
        body.put("targetType", targetType);
        body.put("targetId", targetId);
        body.put("before", before);
        body.put("after", after);
        try {
            executor.execute(RequestIds.wrap(() -> send(body)));
        } catch (RuntimeException e) {
            log.debug("Audit {} dropped: {}", action, e.getMessage());
        }
    }

    public void system(String action, String targetType, Object targetId, Map<String, ?> after) {
        record(null, "SYSTEM", action, targetType, String.valueOf(targetId), null, after);
    }

    private void send(Map<String, Object> body) {
        try {
            restClient.post().uri("/internal/audit").body(body).retrieve().toBodilessEntity();
        } catch (RuntimeException e) {
            log.debug("Audit {} not recorded: {}", body.get("action"), e.getMessage());
        }
    }

    /** Map cho phép giá trị null (Map.of không cho). */
    public static Map<String, Object> fields(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) {
            Object v = kv[i + 1];
            m.put(String.valueOf(kv[i]), v instanceof UUID || v instanceof Enum<?> ? v.toString() : v);
        }
        return m;
    }
}
