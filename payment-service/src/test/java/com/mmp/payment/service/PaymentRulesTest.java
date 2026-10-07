package com.mmp.payment.service;

import com.mmp.payment.entity.Transaction;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.OffsetDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** US-13 — phí nền tảng, số tiền hoàn, Idempotency-Key. */
class PaymentRulesTest {

    private static final BigDecimal RATE = new BigDecimal("0.15");

    @Test
    void feeIs15PercentAndMentorGetsTheRest() {
        PaymentRules.FeeSplit s = PaymentRules.split(new BigDecimal("300000"), RATE);
        assertThat(s.fee()).isEqualByComparingTo("45000");
        assertThat(s.mentorEarning()).isEqualByComparingTo("255000");
        assertThat(s.rate()).isEqualByComparingTo("0.15");
    }

    @Test
    void feeRoundsToWholeDongAndSplitAlwaysSumsToAmount() {
        PaymentRules.FeeSplit s = PaymentRules.split(new BigDecimal("12345"), RATE); // 1851.75 → 1852
        assertThat(s.fee()).isEqualByComparingTo("1852");
        assertThat(s.fee().add(s.mentorEarning())).isEqualByComparingTo("12345");
        assertThat(PaymentRules.split(new BigDecimal("300000"), new BigDecimal("0.20")).fee()).isEqualByComparingTo("60000");
        assertThat(PaymentRules.split(new BigDecimal("300000"), BigDecimal.ZERO).mentorEarning()).isEqualByComparingTo("300000");
    }

    @Test
    void invalidRateRejected() {
        assertThatThrownBy(() -> PaymentRules.split(BigDecimal.TEN, new BigDecimal("1.5"))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> PaymentRules.split(BigDecimal.TEN, new BigDecimal("-0.1"))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void refundByPercentOrAmountAndDefaultIsFull() {
        BigDecimal amount = new BigDecimal("300000");
        assertThat(PaymentRules.refundAmount(amount, BigDecimal.ZERO, null, null).amount()).isEqualByComparingTo("300000");
        assertThat(PaymentRules.refundAmount(amount, BigDecimal.ZERO, 50, null).amount()).isEqualByComparingTo("150000");
        assertThat(PaymentRules.refundAmount(amount, BigDecimal.ZERO, null, new BigDecimal("1000")).amount()).isEqualByComparingTo("1000");
    }

    @Test
    void sumOfRefundsNeverExceedsAmount() {
        BigDecimal amount = new BigDecimal("300000");
        assertThat(PaymentRules.refundAmount(amount, new BigDecimal("150000"), 50, null).ok()).isTrue();
        assertThat(PaymentRules.refundAmount(amount, new BigDecimal("150000"), 60, null).errorCode()).isEqualTo("REFUND_EXCEEDS_AMOUNT");
        assertThat(PaymentRules.refundAmount(amount, new BigDecimal("300000"), null, new BigDecimal("1")).errorCode()).isEqualTo("REFUND_EXCEEDS_AMOUNT");
    }

    @Test
    void invalidRefundRequestsRejected() {
        BigDecimal amount = new BigDecimal("300000");
        assertThat(PaymentRules.refundAmount(amount, BigDecimal.ZERO, 0, null).errorCode()).isEqualTo("INVALID_REFUND_AMOUNT");
        assertThat(PaymentRules.refundAmount(amount, BigDecimal.ZERO, 101, null).errorCode()).isEqualTo("INVALID_REFUND_AMOUNT");
        assertThat(PaymentRules.refundAmount(amount, BigDecimal.ZERO, 50, BigDecimal.TEN).errorCode()).isEqualTo("INVALID_REFUND_AMOUNT");
        assertThat(PaymentRules.refundAmount(amount, BigDecimal.ZERO, null, BigDecimal.ZERO).errorCode()).isEqualTo("INVALID_REFUND_AMOUNT");
    }

    @Test
    void statusAfterRefund() {
        BigDecimal amount = new BigDecimal("300000");
        assertThat(PaymentRules.statusAfterRefund(amount, new BigDecimal("100000"))).isEqualTo(Transaction.Status.PARTIALLY_REFUNDED);
        assertThat(PaymentRules.statusAfterRefund(amount, new BigDecimal("300000"))).isEqualTo(Transaction.Status.REFUNDED);
    }

    @Test
    void idempotencyKeyValidationAndTtl() {
        assertThat(PaymentRules.validIdempotencyKey("3f1c2a7e-0d4b-4c55-9a8e-1b2c3d4e5f60")).isTrue();
        assertThat(PaymentRules.validIdempotencyKey(" ")).isFalse();
        assertThat(PaymentRules.validIdempotencyKey(null)).isFalse();
        assertThat(PaymentRules.validIdempotencyKey("a".repeat(256))).isFalse();
        assertThat(PaymentRules.validIdempotencyKey("có dấu")).isFalse();
        OffsetDateTime now = OffsetDateTime.parse("2026-10-07T10:00:00+07:00");
        assertThat(PaymentRules.idempotencyKeyLive(now.minusHours(23), Duration.ofHours(24), now)).isTrue();
        assertThat(PaymentRules.idempotencyKeyLive(now.minusHours(25), Duration.ofHours(24), now)).isFalse();
    }
}
