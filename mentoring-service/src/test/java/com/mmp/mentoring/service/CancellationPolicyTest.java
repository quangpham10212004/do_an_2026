package com.mmp.mentoring.service;

import com.mmp.mentoring.service.CancellationPolicy.Actor;
import com.mmp.mentoring.service.CancellationPolicy.Decision;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** US-01 — chính sách huỷ phiên. */
class CancellationPolicyTest {

    private final CancellationPolicy policy = CancellationPolicy.defaults();
    private final OffsetDateTime now = OffsetDateTime.parse("2026-10-07T10:00:00+07:00");
    private final BigDecimal price = new BigDecimal("300000");

    @Test
    void menteeCancellingAtLeast72HoursAheadGetsFullRefund() {
        Decision d = policy.evaluate(Actor.MENTEE, price, true, now.plusHours(72), now);
        assertThat(d.refundPercent()).isEqualTo(100);
        assertThat(d.refundAmount()).isEqualByComparingTo("300000");
        assertThat(d.strike()).isFalse();
        assertThat(d.rewardPoints()).isZero();
        assertThat(d.policyText()).contains("300.000đ");
    }

    @Test
    void menteeCancellingLateGetsNothing() {
        Decision d = policy.evaluate(Actor.MENTEE, price, true, now.plusHours(71).plusMinutes(59), now);
        assertThat(d.refundPercent()).isZero();
        assertThat(d.refundAmount()).isEqualByComparingTo("0");
        assertThat(d.lateFreeCancel()).isFalse(); // phiên có phí không tính "huỷ muộn phiên miễn phí"
    }

    @Test
    void mentorCancelAlwaysRefundsFullyWithPointsAndStrike() {
        Decision d = policy.evaluate(Actor.MENTOR, price, true, now.plusHours(1), now);
        assertThat(d.refundPercent()).isEqualTo(100);
        assertThat(d.refundAmount()).isEqualByComparingTo("300000");
        assertThat(d.rewardPoints()).isEqualTo(20);
        assertThat(d.strike()).isTrue();
    }

    @Test
    void systemCancelRefundsFullyWithoutStrike() {
        Decision d = policy.evaluate(Actor.SYSTEM, price, true, now.plusMinutes(30), now);
        assertThat(d.refundPercent()).isEqualTo(100);
        assertThat(d.strike()).isFalse();
        assertThat(d.rewardPoints()).isZero();
    }

    @Test
    void unpaidSessionRefundsNothing() {
        Decision d = policy.evaluate(Actor.MENTEE, price, false, now.plusDays(5), now);
        assertThat(d.refundPercent()).isZero();
        assertThat(d.refundAmount()).isEqualByComparingTo("0");
        assertThat(d.policyText()).contains("chưa thanh toán");
    }

    @Test
    void freeSessionCancelledUnderTwoHoursIsLate() {
        assertThat(policy.evaluate(Actor.MENTEE, BigDecimal.ZERO, false, now.plusMinutes(119), now).lateFreeCancel()).isTrue();
        assertThat(policy.evaluate(Actor.MENTEE, BigDecimal.ZERO, false, now.plusHours(2), now).lateFreeCancel()).isFalse();
        assertThat(policy.evaluate(Actor.MENTOR, BigDecimal.ZERO, false, now.plusMinutes(30), now).lateFreeCancel()).isFalse();
    }

    @Test
    void threeLateCancelsIn30DaysBlockFreeBookingFor14Days() {
        List<OffsetDateTime> two = List.of(now.minusDays(20), now.minusDays(1));
        assertThat(policy.freeBookingBlockedUntil(two, now)).isEmpty();

        List<OffsetDateTime> three = List.of(now.minusDays(20), now.minusDays(10), now.minusDays(1));
        assertThat(policy.freeBookingBlockedUntil(three, now)).contains(now.minusDays(1).plusDays(14));

        // 3 lần nhưng trải dài hơn 30 ngày → không chặn
        List<OffsetDateTime> spread = List.of(now.minusDays(40), now.minusDays(20), now.minusDays(1));
        assertThat(policy.freeBookingBlockedUntil(spread, now)).isEmpty();

        // chặn đã hết hạn (lần thứ 3 cách đây 15 ngày)
        List<OffsetDateTime> expired = List.of(now.minusDays(25), now.minusDays(20), now.minusDays(15));
        assertThat(policy.freeBookingBlockedUntil(expired, now)).isEmpty();
    }
}
