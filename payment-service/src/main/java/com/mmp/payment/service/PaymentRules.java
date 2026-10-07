package com.mmp.payment.service;

import com.mmp.payment.entity.Transaction;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.OffsetDateTime;

/** US-13 — quy tắc tiền dạng hàm thuần (không DB/mạng) để unit test. Tiền VND làm tròn tới 1đ (HALF_UP). */
public final class PaymentRules {

    public static final int IDEMPOTENCY_KEY_MAX = 255;

    private PaymentRules() {
    }

    /** Phí nền tảng chốt lúc charge: fee = round(amount × rate), mentorEarning = amount − fee. */
    public record FeeSplit(BigDecimal rate, BigDecimal fee, BigDecimal mentorEarning) {
    }

    public static FeeSplit split(BigDecimal amount, BigDecimal rate) {
        if (rate == null || rate.signum() < 0 || rate.compareTo(BigDecimal.ONE) > 0) {
            throw new IllegalArgumentException("platform fee rate must be within [0, 1]");
        }
        BigDecimal fee = amount.multiply(rate).setScale(0, RoundingMode.HALF_UP);
        return new FeeSplit(rate, fee, amount.subtract(fee));
    }

    /** Kết quả tính số tiền hoàn: amount > 0 hoặc mã lỗi (để service đổi thành ApiException). */
    public record RefundCalc(BigDecimal amount, String errorCode) {
        public boolean ok() {
            return errorCode == null;
        }
    }

    /**
     * Số tiền hoàn của 1 yêu cầu. {@code requestedAmount} (VND) ưu tiên hơn {@code percent} (% giá gốc, mặc định 100).
     * Lỗi: INVALID_REFUND_AMOUNT (≤ 0 / cả hai cùng có / % ngoài 1–100), REFUND_EXCEEDS_AMOUNT (đã hoàn + lần này > giá gốc).
     */
    public static RefundCalc refundAmount(BigDecimal txAmount, BigDecimal alreadyRefunded, Integer percent, BigDecimal requestedAmount) {
        if (percent != null && requestedAmount != null) return new RefundCalc(null, "INVALID_REFUND_AMOUNT");
        BigDecimal amount;
        if (requestedAmount != null) {
            amount = requestedAmount.setScale(0, RoundingMode.HALF_UP);
        } else {
            int p = percent == null ? 100 : percent;
            if (p < 1 || p > 100) return new RefundCalc(null, "INVALID_REFUND_AMOUNT");
            amount = txAmount.multiply(BigDecimal.valueOf(p)).divide(BigDecimal.valueOf(100), 0, RoundingMode.HALF_UP);
        }
        if (amount.signum() <= 0) return new RefundCalc(null, "INVALID_REFUND_AMOUNT");
        BigDecimal refunded = alreadyRefunded == null ? BigDecimal.ZERO : alreadyRefunded;
        if (refunded.add(amount).compareTo(txAmount) > 0) return new RefundCalc(null, "REFUND_EXCEEDS_AMOUNT");
        return new RefundCalc(amount, null);
    }

    /** Trạng thái sau khi tổng đã hoàn = {@code totalRefunded}. */
    public static Transaction.Status statusAfterRefund(BigDecimal txAmount, BigDecimal totalRefunded) {
        return totalRefunded.compareTo(txAmount) >= 0 ? Transaction.Status.REFUNDED : Transaction.Status.PARTIALLY_REFUNDED;
    }

    /** Idempotency-Key hợp lệ: không rỗng, ≤ 255 ký tự, ký tự in được (ASCII 0x21–0x7E). */
    public static boolean validIdempotencyKey(String key) {
        return key != null && !key.isBlank() && key.length() <= IDEMPOTENCY_KEY_MAX && key.chars().allMatch(c -> c >= 0x21 && c <= 0x7E);
    }

    /** Bản ghi key còn hiệu lực (tạo trong vòng {@code ttl}). */
    public static boolean idempotencyKeyLive(OffsetDateTime createdAt, Duration ttl, OffsetDateTime now) {
        return createdAt.isAfter(now.minus(ttl));
    }
}
