package com.mmp.mentoring.service;

import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.security.AuthUser;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * US-28 (PRD-REQ-5) — quy tắc thuần của không gian mentoring (không I/O để unit test).
 * Trạng thái yêu cầu so theo TÊN (chuỗi) để không phụ thuộc enum của Team A (US-31 thêm ENDED).
 */
public final class GoalRules {

    private GoalRules() {
    }

    public static final int MIN_GOALS = 1;
    public static final int MAX_GOALS = 5;
    public static final int TEXT_MIN = 5;
    public static final int TEXT_MAX = 300;
    static final String FALLBACK_GOAL = "Mục tiêu mentoring đã thống nhất";

    /** Trạng thái của yêu cầu CHƯA từng được chấp nhận — không có không gian mentoring. */
    private static final Set<String> NEVER_ACCEPTED = Set.of("PENDING", "REJECTED", "CANCELLED", "EXPIRED");

    /** Quan hệ tồn tại khi yêu cầu đã được chấp nhận (ACCEPTED, COMPLETED, ENDED, ...). */
    public static boolean isRelationship(String requestStatus) {
        return requestStatus != null && !NEVER_ACCEPTED.contains(requestStatus);
    }

    /** Chỉ sửa được khi quan hệ đang ACCEPTED; mọi trạng thái khác (ENDED, COMPLETED...) là chỉ đọc. */
    public static boolean isReadOnly(String requestStatus) {
        return !"ACCEPTED".equals(requestStatus);
    }

    public static boolean isParticipant(AuthUser user, UUID mentorId, UUID menteeId) {
        return user.userId() != null && (user.userId().equals(mentorId) || user.userId().equals(menteeId));
    }

    /** Xem: hai bên tham gia hoặc admin. */
    public static void requireViewer(AuthUser user, UUID mentorId, UUID menteeId) {
        if (!user.isAdmin() && !isParticipant(user, mentorId, menteeId)) {
            throw ApiException.forbidden("Bạn không thuộc quan hệ mentoring này");
        }
    }

    /** Sửa: chỉ hai bên tham gia (admin chỉ đọc) và quan hệ còn ACCEPTED. */
    public static void requireEditor(AuthUser user, UUID mentorId, UUID menteeId, String requestStatus) {
        if (!isParticipant(user, mentorId, menteeId)) {
            throw ApiException.forbidden(user.isAdmin()
                    ? "Quản trị viên chỉ được xem không gian mentoring"
                    : "Bạn không thuộc quan hệ mentoring này");
        }
        if (isReadOnly(requestStatus)) {
            throw ApiException.conflict("RELATIONSHIP_READ_ONLY", "Quan hệ mentoring đã kết thúc — không gian chỉ còn để xem");
        }
    }

    /** Nội dung mục tiêu 5–300 ký tự sau khi trim; trả về bản đã trim. */
    public static String validateText(String text) {
        String t = text == null ? "" : text.strip().replaceAll("\\s+", " ");
        if (t.length() < TEXT_MIN || t.length() > TEXT_MAX) {
            throw ApiException.badRequest("INVALID_GOAL", "Mục tiêu phải từ " + TEXT_MIN + " đến " + TEXT_MAX + " ký tự");
        }
        return t;
    }

    public static void requireCanAdd(int currentCount) {
        if (currentCount >= MAX_GOALS) {
            throw ApiException.conflict("GOAL_LIMIT_REACHED", "Mỗi quan hệ mentoring có tối đa " + MAX_GOALS + " mục tiêu");
        }
    }

    public static void requireCanDelete(int currentCount) {
        if (currentCount <= MIN_GOALS) {
            throw ApiException.conflict("LAST_GOAL", "Cần giữ lại ít nhất " + MIN_GOALS + " mục tiêu");
        }
    }

    /** Thứ tự mới phải là một hoán vị của đúng các id hiện có (không thiếu, không thừa, không trùng). */
    public static void validateOrder(List<UUID> requested, List<UUID> existing) {
        if (requested == null || requested.size() != existing.size()
                || new HashSet<>(requested).size() != requested.size()
                || !new HashSet<>(requested).equals(new HashSet<>(existing))) {
            throw ApiException.badRequest("INVALID_GOAL_ORDER", "Danh sách sắp xếp phải gồm đúng các mục tiêu hiện có");
        }
    }

    /**
     * Mục tiêu đầu tiên lấy từ goal của yêu cầu (50–1000 ký tự): gộp khoảng trắng, cắt về ≤ 300 ký tự ở ranh giới
     * từ kèm "…". Dữ liệu cũ quá ngắn (< 5 ký tự) dùng câu mặc định.
     */
    public static String seedText(String requestGoal) {
        String t = requestGoal == null ? "" : requestGoal.strip().replaceAll("\\s+", " ");
        if (t.length() < TEXT_MIN) return FALLBACK_GOAL;
        if (t.length() <= TEXT_MAX) return t;
        String cut = t.substring(0, TEXT_MAX - 1);
        int space = cut.lastIndexOf(' ');
        if (space >= TEXT_MAX / 2) cut = cut.substring(0, space);
        return cut.stripTrailing() + "…";
    }
}
