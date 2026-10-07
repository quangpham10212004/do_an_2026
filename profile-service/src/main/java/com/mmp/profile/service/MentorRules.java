package com.mmp.profile.service;

import com.mmp.profile.entity.MentorAvailabilityException;
import com.mmp.profile.entity.MentorProfile.Status;
import com.mmp.profile.exception.ApiException;

import java.net.URI;
import java.net.URISyntaxException;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/**
 * Quy tắc nghiệp vụ thuần của hồ sơ mentor — không I/O để unit test độc lập (CONVENTIONS.md mục 5).
 */
public final class MentorRules {

    private MentorRules() {
    }

    public static final ZoneId DEFAULT_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    public static final DateTimeFormatter HH_MM = DateTimeFormatter.ofPattern("HH:mm");

    // ---------------- US-07: ngoại lệ lịch rảnh ----------------

    /** Số ngày tới (kể cả hôm nay) mà GET /internal/mentor/{id} trả về ngoại lệ cho mentoring-service. */
    public static final int EXCEPTION_HORIZON_DAYS = 60;
    /** Không cho khai báo ngoại lệ quá xa (1 năm). */
    public static final int EXCEPTION_MAX_AHEAD_DAYS = 365;
    /** Giới hạn số ngoại lệ chưa qua của một mentor. */
    public static final int MAX_UPCOMING_EXCEPTIONS = 100;

    /**
     * Kiểm tra một ngoại lệ (tạo mới hoặc sửa). {@code sameDay} = các ngoại lệ khác đã có trong cùng
     * ngày; {@code selfId} = id của ngoại lệ đang sửa (null khi tạo mới) để không tự so với chính nó.
     */
    public static void validateException(LocalDate date, LocalTime start, LocalTime end, LocalDate today,
                                         List<MentorAvailabilityException> sameDay, UUID selfId) {
        if (date.isBefore(today)) {
            throw ApiException.badRequest("INVALID_EXCEPTION", "Không thể khai báo ngoại lệ cho ngày đã qua");
        }
        if (date.isAfter(today.plusDays(EXCEPTION_MAX_AHEAD_DAYS))) {
            throw ApiException.badRequest("INVALID_EXCEPTION", "Chỉ khai báo ngoại lệ trong vòng 1 năm tới");
        }
        if ((start == null) != (end == null)) {
            throw ApiException.badRequest("INVALID_EXCEPTION",
                    "Cần nhập cả giờ bắt đầu và giờ kết thúc, hoặc bỏ trống cả hai để nghỉ cả ngày");
        }
        if (start != null && !end.isAfter(start)) {
            throw ApiException.badRequest("INVALID_SLOT", "Giờ kết thúc phải sau giờ bắt đầu");
        }
        for (MentorAvailabilityException other : sameDay) {
            if (selfId != null && selfId.equals(other.getId())) continue;
            if (overlaps(start, end, other.getStartTime(), other.getEndTime())) {
                throw ApiException.conflict("OVERLAPPING_EXCEPTION", "Ngoại lệ bị trùng với một ngoại lệ khác trong cùng ngày");
            }
        }
    }

    /** Hai khoảng trong cùng ngày giao nhau; null = cả ngày (giao với mọi khoảng). */
    static boolean overlaps(LocalTime s1, LocalTime e1, LocalTime s2, LocalTime e2) {
        if (s1 == null || s2 == null) return true;
        return s1.isBefore(e2) && s2.isBefore(e1);
    }

    public static String formatTime(LocalTime t) {
        return t == null ? null : t.format(HH_MM);
    }

    public static String trimToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    // ---------------- US-08: trạng thái mentor ----------------

    /** Nghỉ phép tối đa 1 năm. */
    public static final int MAX_LEAVE_DAYS = 365;

    /**
     * Trạng thái hiệu lực: ON_LEAVE tự về ACCEPTING khi đã qua hết ngày on_leave_until (theo giờ mentor).
     * MentorStatusJob ghi lại kết quả này vào DB định kỳ; đọc luôn đi qua hàm này nên không phụ thuộc job.
     */
    public static Status effectiveStatus(Status stored, LocalDate onLeaveUntil, LocalDate today) {
        if (stored == Status.ON_LEAVE && onLeaveUntil != null && today.isAfter(onLeaveUntil)) {
            return Status.ACCEPTING;
        }
        return stored;
    }

    /** Mentor (hoặc admin qua cùng endpoint) đổi trạng thái — SUSPENDED chỉ đặt/gỡ qua luồng đình chỉ. */
    public static void validateSelfStatusChange(Status current, Status requested, LocalDate onLeaveUntil, LocalDate today) {
        if (current == Status.SUSPENDED) {
            throw ApiException.conflict("MENTOR_SUSPENDED",
                    "Tài khoản mentor đang bị đình chỉ — chỉ quản trị viên mới gỡ được");
        }
        if (requested == Status.SUSPENDED) {
            throw ApiException.forbidden("Chỉ quản trị viên mới đình chỉ được mentor");
        }
        if (requested == Status.ON_LEAVE) {
            if (onLeaveUntil == null) {
                throw ApiException.badRequest("INVALID_STATUS", "Cần chọn ngày kết thúc nghỉ phép");
            }
            if (onLeaveUntil.isBefore(today)) {
                throw ApiException.badRequest("INVALID_STATUS", "Ngày kết thúc nghỉ phép phải từ hôm nay trở đi");
            }
            if (onLeaveUntil.isAfter(today.plusDays(MAX_LEAVE_DAYS))) {
                throw ApiException.badRequest("INVALID_STATUS", "Chỉ nghỉ phép tối đa 1 năm");
            }
        }
    }

    /**
     * Cờ isAvailable cũ trong PUT hồ sơ (tương thích seed/e2e): true → ACCEPTING, false → PAUSED. Trả về
     * null (không đổi) nếu cờ trùng với trạng thái hiệu lực hiện tại hoặc mentor đang bị đình chỉ.
     */
    public static Status statusFromLegacyFlag(Boolean isAvailable, Status effective) {
        if (isAvailable == null || effective == Status.SUSPENDED) return null;
        if (isAvailable == (effective == Status.ACCEPTING)) return null;
        return isAvailable ? Status.ACCEPTING : Status.PAUSED;
    }

    // ---------------- US-27: admin đình chỉ mentor ----------------

    public static final int SUSPEND_REASON_MIN = 10;
    public static final int SUSPEND_REASON_MAX = 500;

    /** Lý do đình chỉ bắt buộc 10–500 ký tự (sau khi trim). Trả về lý do đã trim. */
    public static String validateSuspendReason(String reason) {
        String r = trimToNull(reason);
        if (r == null || r.length() < SUSPEND_REASON_MIN || r.length() > SUSPEND_REASON_MAX) {
            throw ApiException.badRequest("INVALID_SUSPEND_REASON",
                    "Lý do tạm ngưng phải từ " + SUSPEND_REASON_MIN + " đến " + SUSPEND_REASON_MAX + " ký tự");
        }
        return r;
    }

    /** Chỉ đình chỉ mentor chưa bị đình chỉ. */
    public static void requireSuspendable(Status current) {
        if (current == Status.SUSPENDED) {
            throw ApiException.conflict("MENTOR_ALREADY_SUSPENDED", "Mentor này đang bị tạm ngưng");
        }
    }

    /** Chỉ gỡ đình chỉ khi mentor đang bị đình chỉ. */
    public static void requireUnsuspendable(Status current) {
        if (current != Status.SUSPENDED) {
            throw ApiException.conflict("MENTOR_NOT_SUSPENDED", "Mentor này không bị tạm ngưng");
        }
    }

    // ---------------- US-04: cài đặt đặt lịch ----------------

    public static final Set<Integer> BUFFER_OPTIONS = Set.of(0, 15, 30);
    public static final int MIN_NOTICE_MIN = 1;
    public static final int MIN_NOTICE_MAX = 72;
    public static final List<String> LANGUAGES = List.of("vi", "en");
    public static final List<String> SESSION_TYPES = List.of("CAREER_ADVICE", "CODE_REVIEW", "MOCK_INTERVIEW", "PROJECT_GUIDANCE");
    private static final Set<String> MEETING_HOSTS = Set.of("meet.google.com", "zoom.us", "teams.microsoft.com");

    /** Múi giờ IANA của mentor; giá trị lạ/rỗng (dữ liệu cũ) quay về Asia/Ho_Chi_Minh. */
    public static ZoneId zoneOf(String timezone) {
        try {
            return timezone == null ? DEFAULT_ZONE : ZoneId.of(timezone);
        } catch (RuntimeException e) {
            return DEFAULT_ZONE;
        }
    }

    /**
     * Link họp: rỗng => null; ngược lại bắt buộc https, không kèm user:password, host là meet.google.com,
     * zoom.us, *.zoom.us hoặc teams.microsoft.com (không phân biệt hoa thường).
     */
    public static String normalizeMeetingLink(String link) {
        String value = trimToNull(link);
        if (value == null) return null;
        if (value.length() > 500) {
            throw ApiException.badRequest("INVALID_MEETING_LINK", "Link họp quá dài (tối đa 500 ký tự)");
        }
        URI uri;
        try {
            uri = new URI(value);
        } catch (URISyntaxException e) {
            throw ApiException.badRequest("INVALID_MEETING_LINK", "Link họp không hợp lệ");
        }
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        boolean allowedHost = MEETING_HOSTS.contains(host) || host.endsWith(".zoom.us");
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getRawUserInfo() != null || !allowedHost) {
            throw ApiException.badRequest("INVALID_MEETING_LINK",
                    "Link họp phải là https trên Google Meet, Zoom hoặc Microsoft Teams");
        }
        return value;
    }

    public static void validateBufferAndNotice(Integer bufferMinutes, Integer minNoticeHours) {
        if (bufferMinutes == null || !BUFFER_OPTIONS.contains(bufferMinutes)) {
            throw ApiException.badRequest("INVALID_BOOKING_SETTINGS", "Thời gian nghỉ giữa các phiên chỉ được 0, 15 hoặc 30 phút");
        }
        if (minNoticeHours == null || minNoticeHours < MIN_NOTICE_MIN || minNoticeHours > MIN_NOTICE_MAX) {
            throw ApiException.badRequest("INVALID_BOOKING_SETTINGS", "Thời gian báo trước phải từ 1 đến 72 giờ");
        }
    }

    /** Chuẩn hoá danh sách mã (bỏ trùng, giữ thứ tự) và bắt buộc ít nhất 1 giá trị hợp lệ. */
    public static String[] normalizeCodes(List<String> values, List<String> allowed, boolean upper, String label) {
        LinkedHashSet<String> out = new LinkedHashSet<>();
        if (values != null) {
            for (String v : values) {
                if (v == null || v.isBlank()) continue;
                String code = upper ? v.trim().toUpperCase(Locale.ROOT) : v.trim().toLowerCase(Locale.ROOT);
                if (!allowed.contains(code)) {
                    throw ApiException.badRequest("INVALID_BOOKING_SETTINGS", label + " không hợp lệ: " + v.trim());
                }
                out.add(code);
            }
        }
        if (out.isEmpty()) {
            throw ApiException.badRequest("INVALID_BOOKING_SETTINGS", "Cần chọn ít nhất một " + label.toLowerCase(Locale.ROOT));
        }
        return out.toArray(String[]::new);
    }

    /** Null/rỗng => Asia/Ho_Chi_Minh; phải là múi giờ IANA dạng vùng (vd. Asia/Tokyo), không nhận offset "+07:00". */
    public static String normalizeTimezone(String timezone) {
        String tz = trimToNull(timezone);
        if (tz == null) return DEFAULT_ZONE.getId();
        if (!ZoneId.getAvailableZoneIds().contains(tz)) {
            throw ApiException.badRequest("INVALID_TIMEZONE", "Múi giờ không hợp lệ: " + tz);
        }
        return tz;
    }
}
