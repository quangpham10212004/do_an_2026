package com.mmp.mentoring.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Kiểm tra JWT_SECRET / INTERNAL_API_KEY còn dùng giá trị dev mặc định trong application.yml.
 * <ul>
 *   <li>NFR-9: khi profile {@code prod} đang bật → <b>chặn khởi động</b> (ném IllegalStateException
 *       ngay lúc tạo bean, Spring Boot dừng ứng dụng).</li>
 *   <li>Các profile khác (local dev, test, docker compose demo) → chỉ log WARN.</li>
 * </ul>
 */
@Component
public class DevSecretsWarning {

    private static final Logger log = LoggerFactory.getLogger(DevSecretsWarning.class);

    // Phải khớp với giá trị fallback trong application.yml.
    static final String DEV_JWT_SECRET = "dev-only-secret-change-me-0123456789-abcdefghijklmnopqrstuvwxyz";
    static final String DEV_INTERNAL_API_KEY = "dev-internal-key";

    private final String jwtSecret;
    private final String internalApiKey;

    public DevSecretsWarning(@Value("${app.security.jwt-secret}") String jwtSecret,
                             @Value("${app.security.internal-api-key}") String internalApiKey,
                             Environment environment) {
        this.jwtSecret = jwtSecret;
        this.internalApiKey = internalApiKey;
        failIfProdWithDevSecrets(environment.acceptsProfiles(Profiles.of("prod")), jwtSecret, internalApiKey);
    }

    /** NFR-9 — tách thành hàm tĩnh để unit test. */
    static void failIfProdWithDevSecrets(boolean prod, String jwtSecret, String internalApiKey) {
        if (!prod) return;
        List<String> offending = new ArrayList<>();
        if (jwtSecret == null || jwtSecret.isBlank() || DEV_JWT_SECRET.equals(jwtSecret)) offending.add("JWT_SECRET");
        if (internalApiKey == null || internalApiKey.isBlank() || DEV_INTERNAL_API_KEY.equals(internalApiKey)) offending.add("INTERNAL_API_KEY");
        if (!offending.isEmpty()) {
            throw new IllegalStateException("Profile prod đang bật nhưng " + String.join(", ", offending)
                    + " vẫn dùng giá trị dev mặc định — hãy đặt biến môi trường trước khi khởi động");
        }
    }

    @EventListener(ApplicationReadyEvent.class)
    public void warnIfDevDefaults() {
        if (DEV_JWT_SECRET.equals(jwtSecret)) {
            log.warn("!!! JWT_SECRET chưa được đặt — đang dùng khoá DEV mặc định, ai cũng có thể giả mạo token. "
                    + "KHÔNG dùng cấu hình này khi triển khai thật !!!");
        }
        if (DEV_INTERNAL_API_KEY.equals(internalApiKey)) {
            log.warn("!!! INTERNAL_API_KEY chưa được đặt — đang dùng khoá DEV mặc định cho /internal/**. "
                    + "KHÔNG dùng cấu hình này khi triển khai thật !!!");
        }
    }
}
