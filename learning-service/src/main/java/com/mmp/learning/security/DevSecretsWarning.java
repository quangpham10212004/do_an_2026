package com.mmp.learning.security;

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
 * NFR-9 — kiểm tra JWT_SECRET / INTERNAL_API_KEY còn đúng giá trị dev mặc định trong application.yml:
 * - Spring profile {@code prod}: KHÔNG cho khởi động (ném lỗi ngay khi tạo bean).
 * - Profile khác (dev, test, demo docker compose): chỉ log WARN để local dev vẫn chạy được.
 */
@Component
public class DevSecretsWarning {

    private static final Logger log = LoggerFactory.getLogger(DevSecretsWarning.class);

    // Phải khớp với giá trị fallback trong application.yml.
    static final String DEV_JWT_SECRET = "dev-only-secret-change-me-0123456789-abcdefghijklmnopqrstuvwxyz";
    static final String DEV_INTERNAL_API_KEY = "dev-internal-key";

    private final List<String> problems;

    public DevSecretsWarning(@Value("${app.security.jwt-secret}") String jwtSecret,
                             @Value("${app.security.internal-api-key}") String internalApiKey,
                             Environment environment) {
        this.problems = devDefaultsInUse(jwtSecret, internalApiKey);
        enforce(environment.acceptsProfiles(Profiles.of("prod")), problems);
    }

    /** Tên biến đang dùng giá trị dev mặc định (rỗng = an toàn). */
    static List<String> devDefaultsInUse(String jwtSecret, String internalApiKey) {
        List<String> result = new ArrayList<>();
        if (DEV_JWT_SECRET.equals(jwtSecret)) {
            result.add("JWT_SECRET");
        }
        if (DEV_INTERNAL_API_KEY.equals(internalApiKey)) {
            result.add("INTERNAL_API_KEY");
        }
        return result;
    }

    /** Ở profile prod, còn bí mật dev nào thì chặn khởi động. */
    static void enforce(boolean prod, List<String> problems) {
        if (prod && !problems.isEmpty()) {
            throw new IllegalStateException("Profile prod: " + String.join(", ", problems)
                    + " đang dùng giá trị DEV mặc định — đặt biến môi trường thật trước khi khởi động");
        }
    }

    @EventListener(ApplicationReadyEvent.class)
    public void warnIfDevDefaults() {
        for (String name : problems) {
            log.warn("!!! {} chưa được đặt — đang dùng khoá DEV mặc định. KHÔNG dùng cấu hình này khi triển khai "
                    + "thật (profile prod sẽ từ chối khởi động) !!!", name);
        }
    }
}
