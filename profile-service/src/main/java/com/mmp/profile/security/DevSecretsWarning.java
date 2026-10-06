package com.mmp.profile.security;

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
 *   <li>Dev/test: chỉ log cảnh báo lớn để local dev và test vẫn chạy được.</li>
 *   <li>NFR-9 — Spring profile {@code prod}: <b>chặn khởi động</b> (ném lỗi ngay khi tạo bean),
 *       vì ai cũng có thể giả mạo token/lời gọi nội bộ bằng khoá dev công khai trong mã nguồn.</li>
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
        boolean prod = environment.acceptsProfiles(Profiles.of("prod"));
        List<String> problems = devDefaultsInUse(jwtSecret, internalApiKey);
        if (prod && !problems.isEmpty()) {
            throw new IllegalStateException("NFR-9: profile prod không được dùng khoá dev mặc định: "
                    + String.join(", ", problems) + ". Hãy đặt biến môi trường tương ứng.");
        }
    }

    /** Tên các biến còn dùng giá trị dev mặc định (rỗng = an toàn). */
    static List<String> devDefaultsInUse(String jwtSecret, String internalApiKey) {
        List<String> problems = new ArrayList<>();
        if (DEV_JWT_SECRET.equals(jwtSecret)) problems.add("JWT_SECRET");
        if (DEV_INTERNAL_API_KEY.equals(internalApiKey)) problems.add("INTERNAL_API_KEY");
        return problems;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void warnIfDevDefaults() {
        if (DEV_JWT_SECRET.equals(jwtSecret)) {
            log.warn("!!! JWT_SECRET chưa được đặt — đang dùng khoá DEV mặc định, ai cũng có thể giả mạo token. "
                    + "KHÔNG dùng cấu hình này khi triển khai thật (profile prod sẽ từ chối khởi động) !!!");
        }
        if (DEV_INTERNAL_API_KEY.equals(internalApiKey)) {
            log.warn("!!! INTERNAL_API_KEY chưa được đặt — đang dùng khoá DEV mặc định cho /internal/**. "
                    + "KHÔNG dùng cấu hình này khi triển khai thật (profile prod sẽ từ chối khởi động) !!!");
        }
    }
}
