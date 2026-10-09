package com.mmp.mentoring.service;

import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.security.AuthUser;

import java.time.LocalDate;
import java.util.Set;
import java.util.UUID;

/** US-40 (PRD-SES-10..12) — quy tắc thuần của ghi chú phiên (không I/O để unit test). */
public final class SessionNoteRules {

    private SessionNoteRules() {
    }

    public static final int NOTES_MAX = 20000;
    public static final int PRIVATE_MAX = 10000;
    public static final int ITEM_MIN = 2;
    public static final int ITEM_MAX = 300;
    /** Số action item tối đa tạo trong một phiên. */
    public static final int MAX_ITEMS_PER_SESSION = 20;

    /** Phiên bị huỷ / hết hạn thanh toán không diễn ra — ghi chú chỉ còn để xem. */
    private static final Set<String> CLOSED = Set.of("CANCELLED", "EXPIRED");

    public static boolean isEditable(String sessionStatus) {
        return !CLOSED.contains(sessionStatus);
    }

    /** Chỉ mentor và mentee của phiên — ADMIN cũng không đọc ghi chú. */
    public static void requireParticipant(AuthUser user, UUID mentorId, UUID menteeId) {
        if (!GoalRules.isParticipant(user, mentorId, menteeId)) {
            throw ApiException.forbidden("Ghi chú phiên chỉ dành cho mentor và mentee của phiên");
        }
    }

    public static void requireEditable(String sessionStatus) {
        if (!isEditable(sessionStatus)) {
            throw ApiException.conflict("SESSION_NOTES_READ_ONLY", "Phiên đã huỷ / hết hạn — ghi chú chỉ còn để xem");
        }
    }

    public static void requireMentor(AuthUser user, UUID mentorId) {
        if (user.userId() == null || !user.userId().equals(mentorId)) {
            throw ApiException.forbidden("Chỉ mentor của phiên mới có ghi chú riêng");
        }
    }

    /** Lưu ghi chú chung: baseVersion phải bằng version hiện tại, nếu không người kia đã lưu trước. */
    public static void requireVersion(int baseVersion, int currentVersion) {
        if (baseVersion != currentVersion) {
            throw ApiException.conflict("NOTES_CONFLICT",
                    "Ghi chú vừa được người kia cập nhật — tải lại để xem bản mới nhất rồi sửa tiếp");
        }
    }

    public static String validateNotes(String content, int max) {
        String c = content == null ? "" : content.replace("\r\n", "\n");
        if (c.length() > max) {
            throw ApiException.badRequest("INVALID_NOTES", "Ghi chú tối đa " + max + " ký tự");
        }
        return c;
    }

    public static String validateItemText(String text) {
        String t = text == null ? "" : text.strip().replaceAll("\\s+", " ");
        if (t.length() < ITEM_MIN || t.length() > ITEM_MAX) {
            throw ApiException.badRequest("INVALID_ACTION_ITEM", "Nội dung việc cần làm từ " + ITEM_MIN + " đến " + ITEM_MAX + " ký tự");
        }
        return t;
    }

    /** Hạn hoàn thành không được ở quá khứ (so với ngày hiện tại theo múi giờ ứng dụng). */
    public static void validateDueDate(LocalDate dueDate, LocalDate today) {
        if (dueDate != null && dueDate.isBefore(today)) {
            throw ApiException.badRequest("INVALID_DUE_DATE", "Hạn hoàn thành không được ở quá khứ");
        }
    }

    public static void requireCanAddItem(long existingInSession) {
        if (existingInSession >= MAX_ITEMS_PER_SESSION) {
            throw ApiException.conflict("ACTION_ITEM_LIMIT", "Mỗi phiên có tối đa " + MAX_ITEMS_PER_SESSION + " việc cần làm");
        }
    }
}
