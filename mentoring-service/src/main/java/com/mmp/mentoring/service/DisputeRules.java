package com.mmp.mentoring.service;

import com.mmp.mentoring.entity.Dispute;
import com.mmp.mentoring.entity.MentoringSession;

import java.net.URI;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * US-32 (PRD-ADM-1) — quy tắc tranh chấp dạng hàm thuần (thời điểm truyền vào để test tất định).
 *
 * <ul>
 *   <li>Mở được với phiên COMPLETED / NO_SHOW_MENTEE / NO_SHOW_MENTOR / AWAITING_ATTENDANCE, trong 7 ngày sau giờ kết thúc
 *       ({@code app.disputes.open-window}); mô tả 20–2000 ký tự; tối đa 5 link bằng chứng https.</li>
 *   <li>SLA: phản hồi đầu tiên (start-review hoặc resolve) trong 48 giờ sau khi mở ({@code app.disputes.first-response-sla}).</li>
 *   <li>Kết luận → % hoàn: FULL_REFUND / SUSPEND = 100; PARTIAL_REFUND = refundPercent (1–99, bắt buộc); NO_REFUND /
 *       WARNING = 0. Mọi kết luận trừ FULL_REFUND / SUSPEND giải phóng phần thu nhập còn lại của mentor ngay.</li>
 *   <li>Trạng thái phiên sau kết luận: NO_REFUND / WARNING → phiên DISPUTED / AWAITING_ATTENDANCE thành COMPLETED (phiên
 *       đã COMPLETED / NO_SHOW_* giữ nguyên); các kết luận có hoàn tiền giữ nguyên trạng thái phiên và ghi refund_percent.</li>
 * </ul>
 */
public final class DisputeRules {

    public static final int DESCRIPTION_MIN = 20;
    public static final int DESCRIPTION_MAX = 2000;
    public static final int MAX_EVIDENCE_LINKS = 5;
    public static final int EVIDENCE_LINK_MAX = 500;

    public static final Set<MentoringSession.Status> OPENABLE_STATUSES = Set.of(MentoringSession.Status.COMPLETED,
            MentoringSession.Status.NO_SHOW_MENTEE, MentoringSession.Status.NO_SHOW_MENTOR, MentoringSession.Status.AWAITING_ATTENDANCE);

    private DisputeRules() {
    }

    /** Mã lỗi nếu mô tả / bằng chứng không hợp lệ. */
    public static Optional<String> validateInput(String description, List<String> evidenceLinks) {
        if (description == null || description.length() < DESCRIPTION_MIN || description.length() > DESCRIPTION_MAX) {
            return Optional.of("INVALID_DESCRIPTION");
        }
        List<String> links = evidenceLinks == null ? List.of() : evidenceLinks;
        if (links.size() > MAX_EVIDENCE_LINKS) return Optional.of("TOO_MANY_EVIDENCE_LINKS");
        if (!links.stream().allMatch(DisputeRules::isHttpsUrl)) return Optional.of("INVALID_EVIDENCE_LINK");
        return Optional.empty();
    }

    static boolean isHttpsUrl(String s) {
        if (s == null || s.isBlank() || s.length() > EVIDENCE_LINK_MAX) return false;
        try {
            URI u = URI.create(s.trim());
            return "https".equalsIgnoreCase(u.getScheme()) && u.getHost() != null && !u.getHost().isBlank();
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    /** Mã lỗi 409 nếu phiên không mở tranh chấp được lúc {@code now}. */
    public static Optional<String> canOpen(MentoringSession s, Duration window, OffsetDateTime now) {
        if (!OPENABLE_STATUSES.contains(s.getStatus())) return Optional.of("DISPUTE_NOT_ALLOWED");
        if (now.isAfter(s.endsAt().plus(window))) return Optional.of("DISPUTE_WINDOW_CLOSED");
        return Optional.empty();
    }

    public static OffsetDateTime firstResponseDue(Dispute d, Duration sla) {
        return d.getCreatedAt().plus(sla);
    }

    /** Quá hạn SLA phản hồi đầu tiên: chưa phản hồi mà đã quá hạn, hoặc phản hồi sau hạn. */
    public static boolean overdue(Dispute d, Duration sla, OffsetDateTime now) {
        OffsetDateTime due = firstResponseDue(d, sla);
        return d.getFirstResponseAt() == null ? now.isAfter(due) : d.getFirstResponseAt().isAfter(due);
    }

    /** Mã lỗi 400 nếu refundPercent không khớp với kết luận (chỉ PARTIAL_REFUND có, 1–99). */
    public static Optional<String> validateResolution(Dispute.Outcome outcome, Integer refundPercent) {
        if (outcome == Dispute.Outcome.PARTIAL_REFUND) {
            return refundPercent == null || refundPercent < 1 || refundPercent > 99 ? Optional.of("INVALID_REFUND_PERCENT") : Optional.empty();
        }
        return refundPercent == null ? Optional.empty() : Optional.of("INVALID_REFUND_PERCENT");
    }

    public static int refundPercent(Dispute.Outcome outcome, Integer partialPercent) {
        return switch (outcome) {
            case FULL_REFUND, SUSPEND -> 100;
            case PARTIAL_REFUND -> partialPercent;
            case NO_REFUND, WARNING -> 0;
        };
    }

    /** Phần thu nhập còn lại của mentor được giải phóng ngay (không hoàn 100%). */
    public static boolean releasesEarning(Dispute.Outcome outcome) {
        return refundPercent(outcome, 50) < 100;
    }

    /** Trạng thái phiên sau kết luận; empty = giữ nguyên. */
    public static Optional<MentoringSession.Status> sessionStatusAfter(Dispute.Outcome outcome, MentoringSession.Status current) {
        boolean unresolved = current == MentoringSession.Status.DISPUTED || current == MentoringSession.Status.AWAITING_ATTENDANCE;
        if (unresolved && (outcome == Dispute.Outcome.NO_REFUND || outcome == Dispute.Outcome.WARNING)) {
            return Optional.of(MentoringSession.Status.COMPLETED);
        }
        return Optional.empty();
    }

    public static String outcomeLabel(Dispute.Outcome o) {
        return switch (o) {
            case FULL_REFUND -> "hoàn 100% cho mentee";
            case PARTIAL_REFUND -> "hoàn một phần cho mentee";
            case NO_REFUND -> "không hoàn tiền";
            case WARNING -> "cảnh cáo mentor, không hoàn tiền";
            case SUSPEND -> "hoàn 100% cho mentee và tạm khoá mentor";
        };
    }
}
