package com.mmp.payment.service;

import com.mmp.payment.service.MentorReferralRules.Verdict;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.OffsetDateTime;

import static org.assertj.core.api.Assertions.assertThat;

/** Bản chốt v2.0 §11 — thưởng giới thiệu theo mentor: chờ 7 ngày, hoàn tiền huỷ thưởng, trần 5 lượt/tháng, bất thường. */
class MentorReferralRulesTest {

    private static final Duration PENDING = Duration.ofDays(7);
    private final OffsetDateTime now = OffsetDateTime.parse("2026-10-21T12:00:00+07:00");

    private Verdict decide(String finalState, boolean refunded, OffsetDateTime endedAt, int qualified) {
        return MentorReferralRules.decide(finalState, refunded, endedAt, now, PENDING, qualified, 5);
    }

    @Test
    void waitsUntilTheSessionHasEnded() {
        assertThat(decide(null, false, null, 0)).isEqualTo(Verdict.WAIT);
    }

    @Test
    void waitsSevenDaysAfterACompletedSession() {
        assertThat(decide("COMPLETED", false, now.minusDays(6), 0)).isEqualTo(Verdict.WAIT);
        assertThat(decide("COMPLETED", false, now.minusDays(7), 0)).isEqualTo(Verdict.QUALIFY);
        assertThat(decide("COMPLETED", false, now.minusDays(30), 0)).isEqualTo(Verdict.QUALIFY);
    }

    @Test
    void anyRefundCancelsTheRewardEvenBeforeTheWaitIsOver() {
        assertThat(decide("COMPLETED", true, now.minusDays(2), 0)).isEqualTo(Verdict.REJECT_REFUNDED);
        assertThat(decide(null, true, null, 0)).isEqualTo(Verdict.REJECT_REFUNDED);
    }

    @Test
    void onlyCompletedSessionsCount() {
        assertThat(decide("NO_SHOW_MENTEE", false, now.minusDays(10), 0)).isEqualTo(Verdict.REJECT_NOT_COMPLETED);
        assertThat(decide("CANCELLED", false, now.minusDays(10), 0)).isEqualTo(Verdict.REJECT_NOT_COMPLETED);
    }

    @Test
    void monthlyCapStopsTheRewardButKeepsTheRecord() {
        assertThat(decide("COMPLETED", false, now.minusDays(8), 4)).isEqualTo(Verdict.QUALIFY);
        assertThat(decide("COMPLETED", false, now.minusDays(8), 5)).isEqualTo(Verdict.CAPPED);
    }

    @Test
    void moreThanThreeUsesInADayIsAnomalous() {
        assertThat(MentorReferralRules.anomalous(3, 4)).isFalse();
        assertThat(MentorReferralRules.anomalous(4, 4)).isTrue();
    }

    @Test
    void applyErrorsAreReportedInOrder() {
        assertThat(MentorReferralRules.applyError(false, false, false, false)).contains("REFERRAL_CODE_NOT_FOUND");
        assertThat(MentorReferralRules.applyError(true, false, false, false)).contains("REFERRAL_CODE_WRONG_MENTOR");
        assertThat(MentorReferralRules.applyError(true, true, true, false)).contains("SELF_REFERRAL");
        assertThat(MentorReferralRules.applyError(true, true, false, true)).contains("ALREADY_REFERRED");
        assertThat(MentorReferralRules.applyError(true, true, false, false)).isEmpty();
    }
}
