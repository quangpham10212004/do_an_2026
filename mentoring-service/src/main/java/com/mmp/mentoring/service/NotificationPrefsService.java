package com.mmp.mentoring.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Tuỳ chọn thông báo của người dùng (GET/PUT /api/notifications/preferences).
 * Nhóm: session | request | payment | blog | message. Loại thông báo không thuộc nhóm nào (tài khoản, bảo mật,
 * kết quả xác thực...) luôn được gửi, đúng yêu cầu "bảo mật và thanh toán quan trọng luôn gửi email".
 */
@Service
public class NotificationPrefsService {

    public record Channel(boolean inApp, boolean email) {}

    public record Reminders(boolean d1, boolean h1, boolean m30) {}

    public record Prefs(Map<String, Channel> channels, Reminders reminders) {}

    static final List<String> CATEGORIES = List.of("session", "request", "payment", "blog", "message");

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public NotificationPrefsService(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    public static Prefs defaults() {
        Map<String, Channel> channels = new LinkedHashMap<>();
        channels.put("session", new Channel(true, true));
        channels.put("request", new Channel(true, true));
        channels.put("payment", new Channel(true, true));
        channels.put("blog", new Channel(true, false));
        channels.put("message", new Channel(true, false));
        return new Prefs(channels, new Reminders(true, true, true));
    }

    /** Nhóm của một loại thông báo; null = không thuộc nhóm nào (luôn gửi). */
    public static String categoryOf(String type) {
        if (type == null) return null;
        if (type.startsWith("REQUEST_")) return "request";
        if (type.startsWith("SESSION_") || type.startsWith("RESCHEDULE_") || type.startsWith("ATTENDANCE_")
                || type.startsWith("MOCK_")) return "session";
        if (type.startsWith("MESSAGE_")) return "message";
        if (type.startsWith("BLOG_")) return "blog";
        if (type.startsWith("PAYOUT_") || type.startsWith("WALLET_") || type.startsWith("PAYMENT_")) return "payment";
        return null;
    }

    public Prefs get(UUID userId) {
        List<String> rows = jdbc.queryForList("SELECT prefs::text FROM notification_prefs WHERE user_id = ?", String.class, userId);
        Prefs base = defaults();
        if (rows.isEmpty()) return base;
        try {
            Prefs saved = mapper.readValue(rows.get(0), Prefs.class);
            Map<String, Channel> merged = new LinkedHashMap<>(base.channels());
            if (saved.channels() != null) {
                saved.channels().forEach((k, v) -> { if (CATEGORIES.contains(k) && v != null) merged.put(k, v); });
            }
            return new Prefs(merged, saved.reminders() == null ? base.reminders() : saved.reminders());
        } catch (JsonProcessingException e) {
            return base;
        }
    }

    public Prefs save(UUID userId, Prefs input) {
        Map<String, Channel> channels = new LinkedHashMap<>(defaults().channels());
        if (input.channels() != null) {
            input.channels().forEach((k, v) -> { if (CATEGORIES.contains(k) && v != null) channels.put(k, v); });
        }
        Prefs clean = new Prefs(channels, input.reminders() == null ? defaults().reminders() : input.reminders());
        try {
            jdbc.update("""
                    INSERT INTO notification_prefs (user_id, prefs, updated_at) VALUES (?, ?::jsonb, now())
                    ON CONFLICT (user_id) DO UPDATE SET prefs = EXCLUDED.prefs, updated_at = now()
                    """, userId, mapper.writeValueAsString(clean));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
        return clean;
    }

    /** Lưu thông báo trong ứng dụng? Nhắc lịch 24 giờ theo cờ d1, nhắc 15 phút theo cờ m30. */
    public boolean wantsInApp(UUID userId, String type) {
        if (userId == null) return true;
        Prefs p = get(userId);
        if (!reminderAllowed(p, type)) return false;
        String category = categoryOf(type);
        return category == null || p.channels().get(category).inApp();
    }

    public boolean wantsEmail(UUID userId, String type) {
        if (userId == null) return true;
        Prefs p = get(userId);
        if (!reminderAllowed(p, type)) return false;
        String category = categoryOf(type);
        return category == null || p.channels().get(category).email();
    }

    private static boolean reminderAllowed(Prefs p, String type) {
        if ("SESSION_REMINDER_24H".equals(type)) return p.reminders().d1();
        if ("SESSION_REMINDER_15M".equals(type)) return p.reminders().m30();
        return true;
    }
}
