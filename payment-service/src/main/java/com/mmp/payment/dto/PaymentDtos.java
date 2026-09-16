package com.mmp.payment.dto;

import com.mmp.payment.entity.Referral;
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
    public record ChargeRequest(@NotNull UUID sessionId, BigDecimal amount, @NotNull @Valid CardInput card) {
    }

    public record TransactionResponse(
            UUID id, UUID sessionId, UUID payerId, UUID mentorId, BigDecimal amount, String currency,
            String status, String provider, String providerReference, String failureReason,
            OffsetDateTime createdAt, OffsetDateTime updatedAt) {

        public static TransactionResponse from(Transaction t) {
            return new TransactionResponse(t.getId(), t.getSessionId(), t.getPayerId(), t.getMentorId(), t.getAmount(),
                    t.getCurrency(), t.getStatus().name(), t.getProvider(), t.getProviderReference(),
                    t.getFailureReason(), t.getCreatedAt(), t.getUpdatedAt());
        }
    }

    public record RefundRequest(@NotNull UUID sessionId, @Size(max = 300) String reason) {
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

    public record PaymentStats(long successCount, long failedCount, long refundedCount, BigDecimal totalRevenue) {
    }
}
