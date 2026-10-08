package com.mmp.payment.service;

import com.mmp.payment.entity.LedgerEntry;
import com.mmp.payment.entity.Transaction;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** US-25 — số dư sổ thu nhập và thu hồi theo tỉ lệ hoàn tiền. */
class EarningRulesTest {

    private final Transaction t = tx();

    private static Transaction tx() {
        Transaction t = new Transaction();
        ReflectionTestUtils.setField(t, "id", UUID.randomUUID());
        t.setSessionId(UUID.randomUUID());
        t.setMentorId(UUID.randomUUID());
        t.setAmount(new BigDecimal("300000"));
        t.applyFee(new BigDecimal("0.15"), new BigDecimal("45000"), new BigDecimal("255000"));
        return t;
    }

    private LedgerEntry e(LedgerEntry.Type type, String amount) {
        return new LedgerEntry(t, type, new BigDecimal(amount), null);
    }

    @Test
    void pendingOnlyAfterCharge() {
        EarningRules.Balance b = EarningRules.balance(List.of(e(LedgerEntry.Type.EARNING_PENDING, "255000")));
        assertThat(b.pending()).isEqualByComparingTo("255000");
        assertThat(b.available()).isEqualByComparingTo("0");
    }

    @Test
    void releaseMovesPendingToAvailable() {
        EarningRules.Balance b = EarningRules.balance(List.of(e(LedgerEntry.Type.EARNING_PENDING, "255000"),
                e(LedgerEntry.Type.EARNING_AVAILABLE, "255000")));
        assertThat(b.pending()).isEqualByComparingTo("0");
        assertThat(b.available()).isEqualByComparingTo("255000");
    }

    @Test
    void fullRefundBeforeReleaseLeavesNothing() {
        EarningRules.Balance b = EarningRules.balance(List.of(e(LedgerEntry.Type.EARNING_PENDING, "255000"),
                e(LedgerEntry.Type.REVERSAL, "255000")));
        assertThat(b.pending()).isEqualByComparingTo("0");
        assertThat(b.available()).isEqualByComparingTo("0");
        assertThat(b.reversed()).isEqualByComparingTo("255000");
    }

    @Test
    void partialRefundThenReleaseOfRemainder() {
        EarningRules.Balance b = EarningRules.balance(List.of(e(LedgerEntry.Type.EARNING_PENDING, "255000"),
                e(LedgerEntry.Type.REVERSAL, "127500"), e(LedgerEntry.Type.EARNING_AVAILABLE, "127500")));
        assertThat(b.pending()).isEqualByComparingTo("0");
        assertThat(b.available()).isEqualByComparingTo("127500");
    }

    @Test
    void refundAfterReleaseClawsBackFromAvailable() {
        EarningRules.Balance b = EarningRules.balance(List.of(e(LedgerEntry.Type.EARNING_PENDING, "255000"),
                e(LedgerEntry.Type.EARNING_AVAILABLE, "255000"), e(LedgerEntry.Type.REVERSAL, "127500")));
        assertThat(b.pending()).isEqualByComparingTo("0");
        assertThat(b.available()).isEqualByComparingTo("127500");
    }

    @Test
    void payoutMovesAvailableToPaidOut() {
        EarningRules.Balance b = EarningRules.balance(List.of(e(LedgerEntry.Type.EARNING_PENDING, "255000"),
                e(LedgerEntry.Type.EARNING_AVAILABLE, "255000"), e(LedgerEntry.Type.PAYOUT, "255000")));
        assertThat(b.available()).isEqualByComparingTo("0");
        assertThat(b.paidOut()).isEqualByComparingTo("255000");
    }

    @Test
    void reversalIsProportionalToRefundedShare() {
        BigDecimal earning = new BigDecimal("255000");
        BigDecimal amount = new BigDecimal("300000");
        assertThat(EarningRules.reversal(earning, amount, BigDecimal.ZERO, new BigDecimal("150000"))).isEqualByComparingTo("127500");
        assertThat(EarningRules.reversal(earning, amount, BigDecimal.ZERO, amount)).isEqualByComparingTo("255000");
    }

    @Test
    void cumulativeRoundingSumsExactlyToEarning() {
        BigDecimal earning = new BigDecimal("85000");   // 100.000đ, phí 15%
        BigDecimal amount = new BigDecimal("100000");
        BigDecimal r1 = EarningRules.reversal(earning, amount, BigDecimal.ZERO, new BigDecimal("33333"));
        BigDecimal r2 = EarningRules.reversal(earning, amount, new BigDecimal("33333"), new BigDecimal("33333"));
        BigDecimal r3 = EarningRules.reversal(earning, amount, new BigDecimal("66666"), new BigDecimal("33334"));
        assertThat(r1.add(r2).add(r3)).isEqualByComparingTo("85000");
    }

    @Test
    void freeOrZeroEarningHasNoReversal() {
        assertThat(EarningRules.reversal(BigDecimal.ZERO, new BigDecimal("100000"), BigDecimal.ZERO, new BigDecimal("1"))).isZero();
        assertThat(EarningRules.reversal(new BigDecimal("1"), BigDecimal.ZERO, BigDecimal.ZERO, new BigDecimal("1"))).isZero();
    }

    @Test
    void releasableStates() {
        assertThat(EarningRules.releasableState("COMPLETED")).isTrue();
        assertThat(EarningRules.releasableState("NO_SHOW_MENTEE")).isTrue();
        assertThat(EarningRules.releasableState("DISPUTE_RESOLVED")).isTrue();
        assertThat(EarningRules.releasableState("NO_SHOW_MENTOR")).isFalse();
        assertThat(EarningRules.releasableState("DISPUTED")).isFalse();
    }
}
