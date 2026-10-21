package com.mmp.payment.service;

import com.mmp.payment.service.WalletRules.Allocation;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

/** Bản chốt v2.0 §8 — quy tắc ví thuần. */
class WalletRulesTest {

    private static BigDecimal d(long v) {
        return BigDecimal.valueOf(v);
    }

    @Test
    void promoIsSpentBeforeCash() {
        assertThat(WalletRules.allocate(d(300_000), d(100_000), d(500_000))).contains(new Allocation(d(100_000), d(200_000)));
        assertThat(WalletRules.allocate(d(300_000), d(400_000), d(500_000))).contains(new Allocation(d(300_000), d(0)));
        assertThat(WalletRules.allocate(d(300_000), d(0), d(300_000))).contains(new Allocation(d(0), d(300_000)));
    }

    @Test
    void notEnoughMoneyAllocatesNothing() {
        assertThat(WalletRules.allocate(d(300_000), d(100_000), d(199_999))).isEmpty();
        assertThat(WalletRules.allocate(d(0), d(100_000), d(100_000))).isEmpty();
        assertThat(WalletRules.allocate(null, d(100_000), d(100_000))).isEmpty();
    }

    @Test
    void fullRefundReturnsExactlyWhatWasPaidFromPromo() {
        // trả 300.000 = 100.000 khuyến mãi + 200.000 tiền nạp; hoàn trọn → khuyến mãi 100.000
        assertThat(WalletRules.promoShareOfRefund(d(300_000), d(100_000), d(300_000), d(0))).isEqualByComparingTo("100000");
    }

    @Test
    void partialRefundsAddUpToThePaidPromoWithoutOverShooting() {
        BigDecimal promoPaid = d(100_000), total = d(300_000);
        BigDecimal first = WalletRules.promoShareOfRefund(d(150_000), promoPaid, total, d(0));          // 50%
        assertThat(first).isEqualByComparingTo("50000");
        BigDecimal second = WalletRules.promoShareOfRefund(d(300_000), promoPaid, total, first);        // hoàn nốt
        assertThat(first.add(second)).isEqualByComparingTo("100000");
    }

    @Test
    void roundingNeverRefundsMorePromoThanPaid() {
        BigDecimal promoPaid = d(100), total = d(300);
        BigDecimal sum = BigDecimal.ZERO;
        for (long cumulative = 1; cumulative <= 300; cumulative += 7) {
            sum = sum.add(WalletRules.promoShareOfRefund(d(cumulative), promoPaid, total, sum));
        }
        sum = sum.add(WalletRules.promoShareOfRefund(d(300), promoPaid, total, sum));
        assertThat(sum).isEqualByComparingTo("100");
    }

    @Test
    void noPromoPaidMeansNoPromoRefund() {
        assertThat(WalletRules.promoShareOfRefund(d(300_000), d(0), d(300_000), d(0))).isEqualByComparingTo("0");
    }

    @Test
    void topupLimits() {
        BigDecimal min = d(50_000), max = d(5_000_000), cap = d(20_000_000);
        assertThat(WalletRules.validateTopup(d(50_000), min, max, d(0), cap)).isEmpty();
        assertThat(WalletRules.validateTopup(d(49_999), min, max, d(0), cap)).contains("INVALID_TOPUP_AMOUNT");
        assertThat(WalletRules.validateTopup(d(5_000_001), min, max, d(0), cap)).contains("INVALID_TOPUP_AMOUNT");
        assertThat(WalletRules.validateTopup(new BigDecimal("50000.5"), min, max, d(0), cap)).contains("INVALID_TOPUP_AMOUNT");
        assertThat(WalletRules.validateTopup(d(1_000_000), min, max, d(19_000_000), cap)).isEmpty();
        assertThat(WalletRules.validateTopup(d(1_000_001), min, max, d(19_000_000), cap)).contains("CASH_CAP_EXCEEDED");
    }

    @Test
    void refundWindowIsSevenDaysFromTheLatestTopup() {
        OffsetDateTime now = OffsetDateTime.of(2026, 10, 21, 12, 0, 0, 0, ZoneOffset.UTC);
        Duration window = Duration.ofDays(7);
        assertThat(WalletRules.refundWindowOpen(now.minusDays(7), now, window)).isTrue();
        assertThat(WalletRules.refundWindowOpen(now.minusDays(7).minusSeconds(1), now, window)).isFalse();
        assertThat(WalletRules.refundWindowOpen(null, now, window)).isFalse();
    }

    @Test
    void maxTopupRefundIsTheSmallerOfCashAndRecentTopups() {
        assertThat(WalletRules.maxTopupRefund(d(500_000), d(300_000))).isEqualByComparingTo("300000");
        assertThat(WalletRules.maxTopupRefund(d(200_000), d(300_000))).isEqualByComparingTo("200000");
        assertThat(WalletRules.maxTopupRefund(d(-5), d(300_000))).isEqualByComparingTo("0");
        assertThat(WalletRules.maxTopupRefund(d(500_000), null)).isEqualByComparingTo("0");
    }

    @Test
    void walletGoesDormantAfterTwelveMonthsWithoutActivity() {
        OffsetDateTime now = OffsetDateTime.of(2026, 10, 21, 12, 0, 0, 0, ZoneOffset.UTC);
        assertThat(WalletRules.isDormant(now.minusMonths(12).minusDays(1), now, 12)).isTrue();
        assertThat(WalletRules.isDormant(now.minusMonths(11), now, 12)).isFalse();
        assertThat(WalletRules.isDormant(null, now, 12)).isFalse();
    }
}
