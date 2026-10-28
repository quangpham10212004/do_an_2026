package com.mmp.mentoring.service;

import com.mmp.mentoring.service.CancellationPolicy.Actor;
import com.mmp.mentoring.service.CancellationPolicy.Decision;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

import static org.assertj.core.api.Assertions.assertThat;

/** Bản chốt v2.0 §7 — chính sách huỷ buổi (3 bậc 24h / 4h; trải nghiệm 2h; mentor / hệ thống hoàn đủ). */
class CancellationPolicyTest {

    private final CancellationPolicy policy = CancellationPolicy.defaults();
    private final OffsetDateTime now = OffsetDateTime.parse("2026-10-07T10:00:00+07:00");
    private final BigDecimal price = new BigDecimal("300000");

    private Decision mentee(OffsetDateTime start) {
        return policy.evaluate(Actor.MENTEE, price, true, start, now);
    }

    @Test
    void menteeCancellingAtLeast24HoursAheadGetsFullRefund() {
        Decision d = mentee(now.plusHours(24));
        assertThat(d.refundPercent()).isEqualTo(100);
        assertThat(d.refundAmount()).isEqualByComparingTo("300000");
        assertThat(d.strike()).isFalse();
        assertThat(d.rewardPoints()).isZero();
        assertThat(d.policyText()).contains("300.000đ");
    }

    @Test
    void menteeCancellingBetween4And24HoursGetsHalf() {
        Decision d = mentee(now.plusHours(23).plusMinutes(59));
        assertThat(d.refundPercent()).isEqualTo(50);
        assertThat(d.refundAmount()).isEqualByComparingTo("150000");
        assertThat(mentee(now.plusHours(4)).refundPercent()).isEqualTo(50);
        assertThat(d.policyText()).contains("50%");
    }

    @Test
    void menteeCancellingUnder4HoursGetsNothing() {
        Decision d = mentee(now.plusHours(3).plusMinutes(59));
        assertThat(d.refundPercent()).isZero();
        assertThat(d.refundAmount()).isEqualByComparingTo("0");
        assertThat(d.lateFreeCancel()).isFalse();
    }

    @Test
    void menteeCancellingBeforeTheMentorConfirmsIsAlwaysRefundedFully() {
        Decision d = policy.evaluate(Actor.MENTEE, price, true, now.plusHours(1), now, false, false);
        assertThat(d.refundPercent()).isEqualTo(100);
        assertThat(d.policyText()).contains("chưa xác nhận");
    }

    @Test
    void trialSessionIsFullyRefundedOnlyTwoHoursAhead() {
        BigDecimal trialPrice = new BigDecimal("30000");
        Decision early = policy.evaluate(Actor.MENTEE, trialPrice, true, now.plusHours(2), now, true, true);
        assertThat(early.refundPercent()).isEqualTo(100);
        Decision late = policy.evaluate(Actor.MENTEE, trialPrice, true, now.plusHours(1).plusMinutes(59), now, true, true);
        assertThat(late.refundPercent()).isZero();
        assertThat(late.refundAmount()).isEqualByComparingTo("0");
        // trải nghiệm không có bậc 50%
        assertThat(policy.evaluate(Actor.MENTEE, trialPrice, true, now.plusHours(10), now, true, true).refundPercent()).isEqualTo(100);
    }

    @Test
    void mentorCancelAlwaysRefundsFullyWithStrikeButNoApologyPoints() {
        Decision d = policy.evaluate(Actor.MENTOR, price, true, now.plusHours(1), now);
        assertThat(d.refundPercent()).isEqualTo(100);
        assertThat(d.refundAmount()).isEqualByComparingTo("300000");
        assertThat(d.rewardPoints()).isZero();   // v2.0 bỏ điểm xin lỗi
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
        assertThat(d.policyText()).contains("chưa tạm giữ");
    }

    @Test
    void mentorCancelIsStruckOnlyWhenTheSessionIsConfirmed() {
        OffsetDateTime start = now.plusDays(3);
        // CONFIRMED (đã thanh toán, mentor đã xác nhận) → strike
        assertThat(policy.evaluate(Actor.MENTOR, price, true, start, now, false, true, true).strike()).isTrue();
        // AWAITING_MENTOR (đã thanh toán, mentor chưa xác nhận) → không strike
        assertThat(policy.evaluate(Actor.MENTOR, price, true, start, now, false, false, false).strike()).isFalse();
        // PENDING (chưa thanh toán) → không strike
        assertThat(policy.evaluate(Actor.MENTOR, price, false, start, now, false, true, false).strike()).isFalse();
        // phiên chưa thanh toán qua lời gọi cũ cũng không strike
        assertThat(policy.evaluate(Actor.MENTOR, price, false, start, now, false, true).strike()).isFalse();
        // mentee không bao giờ bị strike
        assertThat(policy.evaluate(Actor.MENTEE, price, true, start, now, false, true, true).strike()).isFalse();
    }

    @Test
    void windowOfLateCancellationIsTheFullRefundMark() {
        assertThat(policy.withinFullRefundWindow(now.plusHours(10), now)).isTrue();
        assertThat(policy.withinFullRefundWindow(now.plusHours(24), now)).isFalse();
        assertThat(policy.withinFullRefundWindow(now.plusDays(3), now)).isFalse();
    }

    @Test
    void thresholdsAreConfigurable() {
        CancellationPolicy strict = new CancellationPolicy(java.time.Duration.ofHours(48), java.time.Duration.ofHours(12), java.time.Duration.ofHours(2));
        assertThat(strict.evaluate(Actor.MENTEE, price, true, now.plusHours(30), now).refundPercent()).isEqualTo(50);
        assertThat(strict.evaluate(Actor.MENTEE, price, true, now.plusHours(10), now).refundPercent()).isZero();
    }
}
