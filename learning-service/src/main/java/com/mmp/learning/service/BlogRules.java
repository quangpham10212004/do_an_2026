package com.mmp.learning.service;

import java.net.URI;
import java.net.URISyntaxException;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Quy tắc blog dạng hàm thuần (không DB/mạng) để dễ kiểm thử.
 * <ul>
 *   <li>Tiêu đề 10–150 ký tự; nội dung Markdown tối đa 50.000 ký tự, cần tối thiểu 300 ký tự để đăng.</li>
 *   <li>Tối đa 5 tag/bài, mỗi tag 2–30 ký tự; tag trùng slug được gộp.</li>
 *   <li>Ảnh bìa (nếu có) phải là URL http(s).</li>
 *   <li>Bài chưa PUBLISHED chỉ tác giả và ADMIN xem được.</li>
 * </ul>
 */
public final class BlogRules {

    public static final String DRAFT = "DRAFT";
    public static final String PUBLISHED = "PUBLISHED";
    public static final String UNPUBLISHED = "UNPUBLISHED";

    public static final int TITLE_MIN = 10;
    public static final int TITLE_MAX = 150;
    public static final int CONTENT_MAX = 50_000;
    public static final int PUBLISH_MIN_CONTENT = 300;
    public static final int SUMMARY_MAX = 300;
    public static final int MAX_TAGS = 5;
    public static final int TAG_MIN = 2;
    public static final int TAG_MAX = 30;
    public static final int COMMENT_MAX = 2000;
    public static final int REPORT_REASON_MIN = 10;
    public static final int REPORT_REASON_MAX = 500;
    private static final int WORDS_PER_MINUTE = 200;
    private static final int AUTO_SUMMARY_LENGTH = 200;
    private static final int SLUG_MAX = 80;

    private static final Pattern DIACRITICS = Pattern.compile("\\p{InCombiningDiacriticalMarks}+");
    private static final Pattern NON_ALNUM = Pattern.compile("[^a-z0-9]+");
    private static final Pattern CODE_FENCE = Pattern.compile("(?s)```.*?```");
    private static final Pattern MD_LINK = Pattern.compile("!?\\[([^\\]]*)]\\([^)]*\\)");
    private static final Pattern MD_SYMBOLS = Pattern.compile("[#>*_`~|]");
    private static final Pattern WHITESPACE = Pattern.compile("\\s+");

    private BlogRules() {
    }

    /** Slug không dấu, a-z0-9 và dấu gạch ngang; tối đa 80 ký tự. */
    public static String slugify(String text) {
        if (text == null) return "bai-viet";
        String s = text.replace('đ', 'd').replace('Đ', 'D');
        s = DIACRITICS.matcher(Normalizer.normalize(s, Normalizer.Form.NFD)).replaceAll("");
        s = NON_ALNUM.matcher(s.toLowerCase(Locale.ROOT)).replaceAll("-");
        s = trimDashes(s);
        if (s.length() > SLUG_MAX) s = trimDashes(s.substring(0, SLUG_MAX));
        return s.isEmpty() ? "bai-viet" : s;
    }

    /** Slug của tag: dùng cùng quy tắc nhưng "c++" / "c#" không được trùng nhau là "c". */
    public static String tagSlug(String name) {
        String lower = name == null ? "" : name.trim().toLowerCase(Locale.ROOT);
        String suffix = lower.contains("++") ? "-plus-plus" : lower.contains("#") ? "-sharp" : "";
        String base = slugify(name);
        return "bai-viet".equals(base) ? "tag" : base + suffix;
    }

    /** Slug duy nhất: thêm hậu tố ngắn (6 ký tự đầu của UUID) khi trùng. */
    public static String withSuffix(String slug, UUID unique) {
        return slug + "-" + unique.toString().substring(0, 6);
    }

    /** Số phút đọc = số từ / 200 (làm tròn lên), tối thiểu 1. */
    public static int readingMinutes(String contentMd) {
        if (contentMd == null || contentMd.isBlank()) return 1;
        int words = WHITESPACE.split(contentMd.trim()).length;
        return Math.max(1, (int) Math.ceil(words / (double) WORDS_PER_MINUTE));
    }

    /** Tóm tắt tự cắt từ nội dung Markdown (bỏ code block, ký hiệu), cắt ở ranh giới từ. */
    public static String autoSummary(String contentMd) {
        if (contentMd == null) return "";
        String s = CODE_FENCE.matcher(contentMd).replaceAll(" ");
        s = MD_LINK.matcher(s).replaceAll("$1");
        s = MD_SYMBOLS.matcher(s).replaceAll(" ");
        s = WHITESPACE.matcher(s).replaceAll(" ").trim();
        if (s.length() <= AUTO_SUMMARY_LENGTH) return s;
        int cut = s.lastIndexOf(' ', AUTO_SUMMARY_LENGTH);
        return s.substring(0, cut > 0 ? cut : AUTO_SUMMARY_LENGTH) + "…";
    }

    /** Thông điệp lỗi nếu bài (nháp) không hợp lệ; empty = hợp lệ. */
    public static Optional<String> validateDraft(String title, String summary, String contentMd, String coverUrl) {
        String t = title == null ? "" : title.trim();
        if (t.length() < TITLE_MIN || t.length() > TITLE_MAX) {
            return Optional.of("Tiêu đề phải từ " + TITLE_MIN + " đến " + TITLE_MAX + " ký tự");
        }
        if (summary != null && summary.trim().length() > SUMMARY_MAX) {
            return Optional.of("Tóm tắt tối đa " + SUMMARY_MAX + " ký tự");
        }
        if (contentMd != null && contentMd.length() > CONTENT_MAX) {
            return Optional.of("Nội dung tối đa " + CONTENT_MAX + " ký tự");
        }
        if (coverUrl != null && !coverUrl.isBlank() && !isHttpUrl(coverUrl)
                && !coverUrl.matches("/api/learning/blog/covers/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}")) {
            return Optional.of("Ảnh bìa phải là đường dẫn http(s) hoặc bắt đầu bằng /");
        }
        return Optional.empty();
    }

    /** Đăng bài cần đủ độ dài tối thiểu. */
    public static boolean longEnoughToPublish(String contentMd) {
        return contentMd != null && contentMd.trim().length() >= PUBLISH_MIN_CONTENT;
    }

    /**
     * Chuẩn hoá danh sách tag: bỏ khoảng trắng thừa, gộp tag trùng slug (giữ cách viết đầu tiên).
     * @throws IllegalArgumentException nếu quá 5 tag hoặc tag quá ngắn / dài.
     */
    public static List<String> normalizeTags(List<String> raw) {
        if (raw == null) return List.of();
        Map<String, String> bySlug = new LinkedHashMap<>();
        for (String tag : raw) {
            if (tag == null) continue;
            String name = WHITESPACE.matcher(tag.trim()).replaceAll(" ");
            if (name.isEmpty()) continue;
            if (name.length() < TAG_MIN || name.length() > TAG_MAX) {
                throw new IllegalArgumentException("Mỗi tag phải từ " + TAG_MIN + " đến " + TAG_MAX + " ký tự");
            }
            bySlug.putIfAbsent(tagSlug(name), name);
        }
        if (bySlug.size() > MAX_TAGS) {
            throw new IllegalArgumentException("Mỗi bài tối đa " + MAX_TAGS + " tag");
        }
        return new ArrayList<>(bySlug.values());
    }

    /** Người gọi có được xem bài không: bài PUBLISHED ai cũng xem, còn lại chỉ tác giả và admin. */
    public static boolean canView(String status, UUID authorId, UUID viewerId, boolean viewerIsAdmin) {
        return PUBLISHED.equals(status) || viewerIsAdmin || (viewerId != null && viewerId.equals(authorId));
    }

    /**
     * Tác giả có được đăng (lại) bài không. Bài bị admin gỡ (UNPUBLISHED) thì không; tác giả tự gỡ thì về DRAFT nên đăng lại được.
     */
    public static boolean authorMayPublish(String status) {
        return DRAFT.equals(status) || PUBLISHED.equals(status);
    }

    public static Optional<String> validateComment(String body) {
        String b = body == null ? "" : body.trim();
        if (b.isEmpty() || b.length() > COMMENT_MAX) {
            return Optional.of("Bình luận phải từ 1 đến " + COMMENT_MAX + " ký tự");
        }
        return Optional.empty();
    }

    public static Optional<String> validateReason(String reason) {
        String r = reason == null ? "" : reason.trim();
        if (r.length() < REPORT_REASON_MIN || r.length() > REPORT_REASON_MAX) {
            return Optional.of("Lý do phải từ " + REPORT_REASON_MIN + " đến " + REPORT_REASON_MAX + " ký tự");
        }
        return Optional.empty();
    }

    /** Chỉ cho phép mentor / mentee / admin viết blog (service nội bộ thì không có hồ sơ tác giả). */
    public static boolean canWrite(String role) {
        return "MENTOR".equals(role) || "MENTEE".equals(role) || "ADMIN".equals(role);
    }

    public static boolean isHttpUrl(String value) {
        if (value == null) return false;
        String v = value.trim();
        // Đường dẫn tương đối cùng origin (ví dụ /seed/blog/x.svg); "//host" là URL tương đối giao thức nên loại
        if (v.startsWith("/") && !v.startsWith("//") && !v.contains("\\") && !v.contains("..")) return true;
        try {
            URI uri = new URI(value.trim());
            String scheme = uri.getScheme();
            return ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) && uri.getHost() != null;
        } catch (URISyntaxException e) {
            return false;
        }
    }

    private static String trimDashes(String s) {
        int start = 0;
        int end = s.length();
        while (start < end && s.charAt(start) == '-') start++;
        while (end > start && s.charAt(end - 1) == '-') end--;
        return s.substring(start, end);
    }
}
