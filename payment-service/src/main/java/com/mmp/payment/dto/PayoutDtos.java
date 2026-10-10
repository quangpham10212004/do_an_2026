package com.mmp.payment.dto;

import com.mmp.payment.entity.Payout;
import com.mmp.payment.service.PayoutRules;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** US-42 (PRD-PAY-4..6) — tài khoản nhận tiền, rút tiền, biên lai. */
public final class PayoutDtos {

    private PayoutDtos() {
    }

    public record BankAccountInput(@NotBlank @Size(max = 100) String bankName, @NotBlank @Size(max = 40) String accountNumber,
                                   @NotBlank @Size(max = 100) String holderName) {
    }

    /** Số tài khoản luôn che (••••1234). */
    public record BankAccountView(String bankName, String accountNumberMasked, String holderName, OffsetDateTime updatedAt) {
    }

    /** accountNumberMasked cho mentor; admin xem thêm accountNumber (cần để chuyển khoản) — null với mentor. */
    public record PayoutView(UUID id, UUID mentorId, String mentorName, BigDecimal amount, String status, String bankName,
                             String accountNumberMasked, String accountNumber, String holderName, String reference,
                             String note, OffsetDateTime requestedAt, OffsetDateTime decidedAt) {

        public static PayoutView from(Payout p, String mentorName, boolean admin) {
            return new PayoutView(p.getId(), p.getMentorId(), mentorName, p.getAmount(), p.getStatus().name(), p.getBankName(),
                    PayoutRules.mask(p.getAccountNumber()), admin ? p.getAccountNumber() : null, p.getHolderName(),
                    p.getReference(), p.getNote(), p.getRequestedAt(), p.getDecidedAt());
        }
    }

    /** Trang thu nhập: khả dụng, đang chờ rút, tối thiểu, tài khoản, yêu cầu đang mở. */
    public record PayoutOverview(BigDecimal available, BigDecimal requested, BigDecimal minimum, boolean canRequest,
                                 BankAccountView bankAccount, PayoutView openPayout, List<PayoutView> history) {
    }

    public record MarkPaidInput(@NotBlank @Size(max = 100) String reference, @Size(max = 500) String note) {
    }

    public record RejectInput(@NotBlank @Size(max = 500) String reason) {
    }

    public record ReceiptRefund(String receiptNumber, UUID refundId, BigDecimal amount, String reason, OffsetDateTime createdAt) {
    }

    /** PRD-PAY-6 — biên lai giao dịch thành công (kèm biên lai hoàn tiền nếu có). */
    public record Receipt(String receiptNumber, UUID transactionId, String status, OffsetDateTime paidAt, UUID sessionId,
                          OffsetDateTime sessionStart, Integer durationMinutes, UUID payerId, String payerName, UUID mentorId,
                          String mentorName, BigDecimal amount, BigDecimal fee, BigDecimal mentorEarning, String currency,
                          String provider, String providerReference, BigDecimal refunded, BigDecimal netPaid,
                          List<ReceiptRefund> refunds) {
    }
}
