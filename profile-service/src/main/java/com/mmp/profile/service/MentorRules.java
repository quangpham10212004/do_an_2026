package com.mmp.profile.service;

import com.mmp.profile.entity.MentorAvailabilityException;
import com.mmp.profile.entity.MentorProfile.Status;
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
}
