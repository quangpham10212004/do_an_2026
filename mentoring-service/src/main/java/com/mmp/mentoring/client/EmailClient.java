package com.mmp.mentoring.client;

import com.mmp.mentoring.security.JwtAuthenticationFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/**
 * US-38 (PRD-NOTI-2) — chuyển các thông báo có ✉ trong danh mục sự kiện sang auth-service
 * (POST /internal/notifications/email), nơi áp tuỳ chọn email + giờ yên tĩnh và gửi. Bắn-rồi-quên trên luồng nền
 * (giống AuditClient): lỗi chỉ ghi log, không làm hỏng nghiệp vụ hay thông báo trong ứng dụng.
 */
@Component
public class EmailClient {

    private static final Logger log = LoggerFactory.getLogger(EmailClient.class);

    /** Loại thông báo → nhóm email (PRD-NOTI-1/2). Loại không có ở đây chỉ có thông báo trong ứng dụng. */
    public static final Map<String, String> CATEGORIES = Map.ofEntries(
            Map.entry("REQUEST_RECEIVED", "REQUESTS"),
            Map.entry("REQUEST_ACCEPTED", "REQUESTS"),
            Map.entry("REQUEST_EXPIRED", "REQUESTS"),
            Map.entry("SESSION_CONFIRMED", "SESSIONS"),
            Map.entry("SESSION_CANCELLED", "SESSIONS"),
            Map.entry("RESCHEDULE_PROPOSED", "SESSIONS"),
            Map.entry("SESSION_REMINDER_24H", "SESSIONS"),
            Map.entry("SESSION_REMINDER_1H", "SESSIONS"),
            Map.entry("ATTENDANCE_REQUIRED", "SESSIONS"),
            Map.entry("MESSAGE_DIGEST", "MESSAGES"),
            // Kết quả AI Interview (ai-service gửi qua /internal/notifications) — luôn gửi
            Map.entry("MENTOR_APPROVED", "ACCOUNT"),
            Map.entry("MENTOR_REJECTED", "ACCOUNT"),
            Map.entry("INTERVIEW_RETAKE_REQUESTED", "ACCOUNT"),
            // US-42 — payment-service gửi qua /internal/notifications khi admin đã chuyển tiền rút
            Map.entry("PAYOUT_PAID", "ACCOUNT"));

    private final RestClient restClient;
    private final ThreadPoolExecutor executor = new ThreadPoolExecutor(1, 2, 30, TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(1000), r -> {
        Thread t = new Thread(r, "email-client");
        t.setDaemon(true);
        return t;
    }, new ThreadPoolExecutor.DiscardPolicy());

    public EmailClient(@Value("${app.services.auth-url:http://localhost:8081}") String authUrl,
                       @Value("${app.security.internal-api-key}") String internalApiKey) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(2000);
        factory.setReadTimeout(5000);
        this.restClient = RestClient.builder().baseUrl(authUrl).requestFactory(factory)
                .defaultHeader(JwtAuthenticationFilter.INTERNAL_HEADER, internalApiKey).build();
    }

    public static boolean emailable(String type) {
        return type != null && CATEGORIES.containsKey(type);
    }

    /** Gửi nếu loại thông báo có email; sessionStart chỉ cho nhắc lịch (ngoại lệ giờ yên tĩnh). */
    public void maybeSend(UUID userId, String type, String title, String message, String link, OffsetDateTime sessionStart) {
        if (userId == null || !emailable(type)) return;
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("userId", userId.toString());
        body.put("category", CATEGORIES.get(type));
        body.put("type", type);
        body.put("title", title);
        body.put("message", message);
        body.put("link", link);
        body.put("sessionStartAt", sessionStart == null ? null : sessionStart.toString());
        body.put("dedupeKey", dedupeKey(userId, type, title, message, link));
        try {
            executor.execute(() -> send(body));
        } catch (RuntimeException e) {
            log.debug("Email {} dropped: {}", type, e.getMessage());
        }
    }

    private void send(Map<String, Object> body) {
        try {
            restClient.post().uri("/internal/notifications/email").body(body).retrieve().toBodilessEntity();
        } catch (RuntimeException e) {
            log.warn("Email {} not queued: {}", body.get("type"), e.getMessage());
        }
    }

    /** Cùng một sự kiện (người nhận + nội dung) chỉ gửi email 1 lần kể cả khi bị thông báo lặp. */
    static String dedupeKey(UUID userId, String type, String title, String message, String link) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            md.update((userId + "|" + type + "|" + title + "|" + message + "|" + link).getBytes(StandardCharsets.UTF_8));
            return type + ":" + HexFormat.of().formatHex(md.digest()).substring(0, 32);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
