package com.mmp.profile.service;

import com.mmp.profile.entity.MentorAvailabilityException;
import com.mmp.profile.exception.ApiException;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
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
}
