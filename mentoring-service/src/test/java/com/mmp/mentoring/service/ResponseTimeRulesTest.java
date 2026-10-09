package com.mmp.mentoring.service;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** US-35 — trung vị thời gian phản hồi yêu cầu; yêu cầu hết hạn = không phản hồi. */
class ResponseTimeRulesTest {

    private final OffsetDateTime t0 = OffsetDateTime.parse("2026-10-01T08:00:00Z");

    private ResponseTimeRules.Outcome replied(double hours) {
        return new ResponseTimeRules.Outcome(t0, t0.plusMinutes(Math.round(hours * 60)), false);
    }

    private ResponseTimeRules.Outcome expired() {
        return new ResponseTimeRules.Outcome(t0, null, true);
    }

    @Test
    void noSampleIsNull() {
        assertThat(ResponseTimeRules.median(List.of())).isNull();
    }

    @Test
    void oddAndEvenMedians() {
        assertThat(ResponseTimeRules.median(List.of(replied(2), replied(30), replied(5)))).isEqualByComparingTo("5.00");
        assertThat(ResponseTimeRules.median(List.of(replied(2), replied(4)))).isEqualByComparingTo("3.00");
    }

    @Test
    void expiredCountsAsNoReply() {
        BigDecimal m = ResponseTimeRules.median(List.of(replied(1), expired(), expired()));
        assertThat(m).isEqualByComparingTo(BigDecimal.valueOf(ResponseTimeRules.NO_REPLY_HOURS));
        assertThat(ResponseTimeRules.median(List.of(replied(1), replied(2), expired()))).isEqualByComparingTo("2.00");
    }
}
