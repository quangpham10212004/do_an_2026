package com.mmp.payment.service;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Optional;

/**
 * Bản chốt v2.0 §11 — quy tắc giới thiệu theo mentor dạng hàm thuần (không DB/mạng) để unit test.
 * Thưởng: sau khi buổi COMPLETED + đã trả tiền + qua {@code pending} (7 ngày) mà buổi không bị hoàn tiền; trần {@code monthlyCap} lượt
 * thưởng / tháng / người giới thiệu; > {@code anomalyUses} lượt dùng mã trong 24 giờ → chuyển admin xem xét.
 */
public final class MentorReferralRules {

    private MentorReferralRules() {
    }

    public enum Verdict { WAIT, QUALIFY, CAPPED, REJECT_REFUNDED, REJECT_NOT_COMPLETED }

    /**
     * @param finalState     trạng thái cuối của buổi báo từ mentoring (COMPLETED, NO_SHOW_MENTEE, CANCELLED…); null = chưa kết thúc
     * @param refundedAny    giao dịch học phí đã có bất kỳ lần hoàn tiền nào
     * @param endedAt        giờ kết thúc buổi (mốc bắt đầu đồng hồ 7 ngày); null = chưa có
     * @param qualifiedThisMonth số lượt đã được thưởng của người giới thiệu trong tháng hiện tại
     */
    public static Verdict decide(String finalState, boolean refundedAny, OffsetDateTime endedAt, OffsetDateTime now, Duration pending,
                                 int qualifiedThisMonth, int monthlyCap) {
        if (refundedAny) return Verdict.REJECT_REFUNDED;
        if (finalState == null) return Verdict.WAIT;
        if (!"COMPLETED".equals(finalState)) return Verdict.REJECT_NOT_COMPLETED;
        if (endedAt == null || endedAt.plus(pending).isAfter(now)) return Verdict.WAIT;
        return qualifiedThisMonth >= monthlyCap ? Verdict.CAPPED : Verdict.QUALIFY;
    }

    /** Một mã bị dùng quá nhiều trong 24 giờ → chuyển admin (thưởng giữ lại). */
    public static boolean anomalous(long usesInLast24h, int anomalyUses) {
        return usesInLast24h >= anomalyUses;
    }

    /** Kiểm tra dùng mã tại lúc đặt buổi đầu; trả mã lỗi hoặc empty nếu hợp lệ. */
    public static Optional<String> applyError(boolean codeFound, boolean sameMentor, boolean selfReferral, boolean alreadyReferred) {
        if (!codeFound) return Optional.of("REFERRAL_CODE_NOT_FOUND");
        if (!sameMentor) return Optional.of("REFERRAL_CODE_WRONG_MENTOR");
        if (selfReferral) return Optional.of("SELF_REFERRAL");
        if (alreadyReferred) return Optional.of("ALREADY_REFERRED");
        return Optional.empty();
    }
}
