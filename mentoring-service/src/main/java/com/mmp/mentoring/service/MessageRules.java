package com.mmp.mentoring.service;

import com.mmp.mentoring.exception.ApiException;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * US-33 (PRD-MSG-1..3) — quy tắc thuần của nhắn tin (không I/O để unit test).
 * Trạng thái yêu cầu so theo TÊN (chuỗi) giống GoalRules.
 */
public final class MessageRules {

    private MessageRules() {
    }

    public static final int BODY_MAX = 2000;
    /** PRD-MSG-3 — mentee gửi tối đa 3 tin khi yêu cầu chưa từng được chấp nhận. */
    public static final int PRE_ACCEPT_LIMIT = 3;
    /** PRD-MSG-1 — cuộc trò chuyện còn gửi được 30 ngày sau khi yêu cầu kết thúc / bị từ chối / hết hạn. */
    public static final Duration CLOSE_GRACE = Duration.ofDays(30);
    static final String MASK = "•••••••";

    /** Số điện thoại Việt Nam: 0xxxxxxxxx hoặc +84 / 84, cho phép dấu cách, chấm, gạch giữa các chữ số. */
    private static final Pattern PHONE = Pattern.compile("(?<![\\p{L}\\p{N}+])(?:\\+?84|0)(?:[ .-]?\\d){8,10}(?![\\p{L}\\p{N}])");
    private static final Pattern EMAIL = Pattern.compile("([\\p{L}\\p{N}._%+-])[\\p{L}\\p{N}._%+-]*@[\\p{L}\\p{N}-]+(?:\\.[\\p{L}\\p{N}-]+)*\\.([A-Za-z]{2,})");

    /** Nội dung sau khi trim, 1–2000 ký tự. */
    public static String validateBody(String body) {
        String t = body == null ? "" : body.strip();
        if (t.isEmpty() || t.length() > BODY_MAX) {
            throw ApiException.badRequest("INVALID_MESSAGE", "Tin nhắn phải từ 1 đến " + BODY_MAX + " ký tự");
        }
        return t;
    }

    /**
     * Gửi được khi yêu cầu PENDING / ACCEPTED, hoặc trong 30 ngày sau khi ENDED / REJECTED / EXPIRED (closedAt).
     * CANCELLED (mentee tự rút yêu cầu) là chỉ đọc ngay.
     */
    public static boolean isWritable(String requestStatus, OffsetDateTime closedAt, OffsetDateTime now) {
        if ("PENDING".equals(requestStatus) || "ACCEPTED".equals(requestStatus)) return true;
        if ("CANCELLED".equals(requestStatus) || closedAt == null) return false;
        return now.isBefore(closedAt.plus(CLOSE_GRACE));
    }

    public static void requireWritable(String requestStatus, OffsetDateTime closedAt, OffsetDateTime now) {
        if (!isWritable(requestStatus, closedAt, now)) {
            throw ApiException.conflict("CONVERSATION_READ_ONLY", "Cuộc trò chuyện đã đóng — chỉ còn để xem");
        }
    }

    /** PRD-MSG-3 — mentee đã gửi {@code sentSoFar} tin trong yêu cầu chưa từng được chấp nhận. */
    public static void requirePreAcceptQuota(boolean senderIsMentee, String requestStatus, long sentSoFar) {
        if (senderIsMentee && !GoalRules.isRelationship(requestStatus) && sentSoFar >= PRE_ACCEPT_LIMIT) {
            throw ApiException.tooManyRequests("MESSAGE_LIMIT_BEFORE_ACCEPT",
                    "Trước khi mentor chấp nhận, bạn chỉ gửi được tối đa " + PRE_ACCEPT_LIMIT + " tin nhắn");
        }
    }

    /** Số tin mentee còn gửi được trước khi được chấp nhận (null = không giới hạn). */
    public static Integer remainingPreAccept(boolean viewerIsMentee, String requestStatus, long sentSoFar) {
        if (!viewerIsMentee || GoalRules.isRelationship(requestStatus)) return null;
        return (int) Math.max(0, PRE_ACCEPT_LIMIT - sentSoFar);
    }

    /**
     * PRD-MSG-3 — che SĐT và email: "0912345678" → "09•••••••78", "nam.le@gmail.com" → "n•••@•••.com".
     * Số ký tự che cố định để không lộ độ dài.
     */
    public static String mask(String body) {
        if (body == null || body.isEmpty()) return body;
        Matcher pm = PHONE.matcher(body);
        StringBuilder sb = new StringBuilder();
        while (pm.find()) {
            String digits = pm.group().replaceAll("\\D", "");
            pm.appendReplacement(sb, Matcher.quoteReplacement(digits.substring(0, 2) + MASK + digits.substring(digits.length() - 2)));
        }
        pm.appendTail(sb);
        Matcher em = EMAIL.matcher(sb.toString());
        StringBuilder out = new StringBuilder();
        while (em.find()) {
            em.appendReplacement(out, Matcher.quoteReplacement(em.group(1) + "•••@•••." + em.group(2)));
        }
        em.appendTail(out);
        return out.toString();
    }
}
