package com.mmp.auth.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Cảnh báo lớn khi JWT_SECRET / INTERNAL_API_KEY đang dùng giá trị dev mặc định
 * trong application.yml. Không chặn khởi động để local dev và test vẫn chạy được,
 * nhưng khi triển khai thật bắt buộc phải đặt hai biến này (xem .env.example).
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
                             @Value("${app.security.internal-api-key}") String internalApiKey) {
        this.jwtSecret = jwtSecret;
        this.internalApiKey = internalApiKey;
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
