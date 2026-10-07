package com.mmp.mentoring.service;

import com.mmp.mentoring.entity.MentoringSession;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.Set;

/**
 * US-04 (PRD-SES-3) — link phòng họp của phiên. Chỉ chấp nhận https trên các nền tảng họp trực tuyến
 * đã biết, và chỉ lộ link cho người tham gia khi phiên đã CONFIRMED (hoặc trạng thái sau đó).
 */
public final class MeetingLinks {

    private static final Set<String> EXACT_HOSTS = Set.of("meet.google.com", "zoom.us", "teams.microsoft.com");

    /** Trạng thái được trả link trong API: CONFIRMED và các trạng thái sau CONFIRMED (không gồm huỷ/hết hạn). */
    private static final Set<MentoringSession.Status> VISIBLE = Set.of(
            MentoringSession.Status.CONFIRMED, MentoringSession.Status.COMPLETED);

    private MeetingLinks() {
    }

    /** https://meet.google.com/…, https://zoom.us/…, https://*.zoom.us/…, https://teams.microsoft.com/… */
    public static boolean isAllowed(String url) {
        if (url == null || url.isBlank() || url.length() > 500) return false;
        try {
            URI uri = new URI(url.trim());
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getRawUserInfo() != null) return false;
            if (uri.getPort() != -1 && uri.getPort() != 443) return false;
            String host = uri.getHost();
            if (host == null) return false;
            host = host.toLowerCase(Locale.ROOT);
            return EXACT_HOSTS.contains(host) || (host.endsWith(".zoom.us") && host.length() > ".zoom.us".length());
        } catch (URISyntaxException e) {
            return false;
        }
    }

    /** Link được sao chép từ hồ sơ mentor lúc đặt lịch — link không hợp lệ bị bỏ qua (mentor đặt lại sau). */
    public static String sanitize(String url) {
        return isAllowed(url) ? url.trim() : null;
    }

    public static boolean visibleFor(MentoringSession.Status status) {
        return VISIBLE.contains(status);
    }
}
