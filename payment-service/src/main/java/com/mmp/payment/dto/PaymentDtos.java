package com.mmp.payment.dto;

import com.mmp.payment.entity.Referral;
import com.mmp.payment.entity.Refund;
import com.mmp.payment.entity.RewardEntry;
import com.mmp.payment.entity.Transaction;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class PaymentDtos {

    private PaymentDtos() {
    }

    public record CardInput(
            @NotBlank @Size(max = 23) String cardNumber,
            @Size(max = 100) String cardHolder,
            @NotBlank @Size(max = 5) String expiry,
            @NotBlank @Size(max = 4) String cvv) {
    }

    /**
     * Số tiền KHÔNG lấy từ client mà lấy từ mentoring-service (giá của phiên) để
     * tránh client sửa số tiền. Trường amount chỉ dùng để đối chiếu nếu client gửi.
     */
    public record ChargeRequest(UUID sessionId, UUID packageId, BigDecimal amount, @NotNull @Valid CardInput card) {

        /** Thanh toán một phiên lẻ (chữ ký trước khi có gói buổi). */
        public ChargeRequest(UUID sessionId, BigDecimal amount, CardInput card) {
            this(sessionId, null, amount, card);
        }
    }

    /**
     * US-13 — fee / mentorEarning / feeRate chốt lúc charge; refundedAmount = tổng các lần hoàn; refunds = chi tiết
     * (bảng refunds, không ghi đè giao dịch).
     */
    public record TransactionResponse(
            UUID id, UUID sessionId, UUID packageId, UUID payerId, UUID mentorId, BigDecimal amount, BigDecimal fee, BigDecimal mentorEarning,
            BigDecimal feeRate, BigDecimal refundedAmount, String currency,
            String status, String provider, String providerReference, String failureReason, String holdReason,
            List<RefundView> refunds, OffsetDateTime createdAt, OffsetDateTime updatedAt) {

        public static TransactionResponse from(Transaction t, List<Refund> refunds) {
            BigDecimal refunded = refunds.stream().map(Refund::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
            return new TransactionResponse(t.getId(), t.getSessionId(), t.getPackageId(), t.getPayerId(), t.getMentorId(), t.getAmount(),
                    t.getFee(), t.getMentorEarning(), t.getFeeRate(), refunded,
                    t.getCurrency(), t.getStatus().name(), t.getProvider(), t.getProviderReference(),
                    t.getFailureReason(), t.getHoldReason(), refunds.stream().map(RefundView::from).toList(),
                    t.getCreatedAt(), t.getUpdatedAt());
        }
    }

    public record RefundView(UUID id, BigDecimal amount, String reason, UUID actorId, OffsetDateTime createdAt) {

        public static RefundView from(Refund r) {
            return new RefundView(r.getId(), r.getAmount(), r.getReason(), r.getActorId(), r.getCreatedAt());
        }
    }

    /**
     * US-13 — hoàn tiền nội bộ: {@code amount} (VND) HOẶC {@code percent} (% giá gốc, mặc định 100 khi cả hai trống).
     * Tổng các lần hoàn ≤ giá gốc. actorId = người thực hiện (admin), null = hệ thống.
     */
    public record RefundRequest(@NotNull UUID sessionId, @Size(max = 300) String reason,
                                @jakarta.validation.constraints.Min(1) @jakarta.validation.constraints.Max(100) Integer percent,
                                @jakarta.validation.constraints.Positive BigDecimal amount,
                                UUID actorId) {
    }

    /**
     * Hoàn tiền gói buổi theo TỔNG LUỸ KẾ đã phải hoàn ({@code refundedTotal}, VND): payment-service tính phần còn thiếu so
     * với tổng đã hoàn nên gọi lại cùng giá trị (sau lỗi mạng) không hoàn trùng.
     */
    public record PackageRefundRequest(@NotNull UUID packageId, @NotNull @jakarta.validation.constraints.Positive BigDecimal refundedTotal,
                                       @Size(max = 300) String reason) {
    }

    /** US-12 — tạm giữ / giải phóng giao dịch của phiên đang tranh chấp. */
    public record HoldRequest(@NotNull UUID sessionId, @Size(max = 300) String reason) {
    }

    /** US-01 — mentoring-service cộng điểm thưởng (idempotent theo userId + reason + sessionId). */
    public record GrantRewardRequest(@NotNull UUID userId, @NotNull @jakarta.validation.constraints.Min(1)
                                     @jakarta.validation.constraints.Max(10000) Integer points,
                                     @NotBlank @Size(max = 100) String reason, @NotNull UUID sessionId) {
    }

    public record RegisterReferralRequest(@NotBlank String code, @NotNull UUID refereeId) {
    }

    public record ReferralResponse(UUID id, UUID referrerId, UUID refereeId, String code, String status,
                                   String rejectReason, OffsetDateTime createdAt, OffsetDateTime qualifiedAt) {

        public static ReferralResponse from(Referral r) {
            return new ReferralResponse(r.getId(), r.getReferrerId(), r.getRefereeId(), r.getCode(), r.getStatus().name(),
                    r.getRejectReason(), r.getCreatedAt(), r.getQualifiedAt());
        }
    }

    public record RewardResponse(UUID id, int points, String reason, OffsetDateTime createdAt) {

        public static RewardResponse from(RewardEntry e) {
            return new RewardResponse(e.getId(), e.getPoints(), e.getReason(), e.getCreatedAt());
        }
    }

    public record MyReferralOverview(
            String code, String shareUrl, long totalReferrals, long qualifiedReferrals, long pointsBalance,
            int rewardPointsPerReferral, BigDecimal minQualifyingAmount,
            List<ReferralResponse> referrals, List<RewardResponse> rewards) {
    }

    public record PageResponse<T>(List<T> items, int page, int size, long totalItems, int totalPages) {
    }

    /** totalPlatformFee = tổng phí của giao dịch SUCCESS / PARTIALLY_REFUNDED (US-13). */
    public record PaymentStats(long successCount, long failedCount, long refundedCount, BigDecimal totalRevenue,
                               long partiallyRefundedCount, long onHoldCount, BigDecimal totalPlatformFee) {
    }
}
