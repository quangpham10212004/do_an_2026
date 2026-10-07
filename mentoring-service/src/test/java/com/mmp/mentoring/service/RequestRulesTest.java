package com.mmp.mentoring.service;

import com.mmp.mentoring.entity.MentoringRequest;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** US-14 — form yêu cầu và giới hạn yêu cầu PENDING. */
class RequestRulesTest {

    @Test
    void goalMustBe50To1000Chars() {
        assertThat(RequestRules.validateForm("x".repeat(49), 1)).contains("INVALID_GOAL");
        assertThat(RequestRules.validateForm("x".repeat(50), 1)).isEmpty();
        assertThat(RequestRules.validateForm("x".repeat(1000), 6)).isEmpty();
        assertThat(RequestRules.validateForm("x".repeat(1001), 1)).contains("INVALID_GOAL");
        assertThat(RequestRules.validateForm(null, 1)).contains("INVALID_GOAL");
    }

    @Test
    void expectedDurationIs1Or3Or6Months() {
        String goal = "x".repeat(60);
        assertThat(RequestRules.validateForm(goal, 3)).isEmpty();
        assertThat(RequestRules.validateForm(goal, 2)).contains("INVALID_EXPECTED_DURATION");
        assertThat(RequestRules.validateForm(goal, 12)).contains("INVALID_EXPECTED_DURATION");
        assertThat(RequestRules.validateForm(goal, null)).contains("INVALID_EXPECTED_DURATION");
    }

    @Test
    void atMostThreePending() {
        assertThat(RequestRules.tooManyPending(2, 3)).isFalse();
        assertThat(RequestRules.tooManyPending(3, 3)).isTrue();
    }

    @Test
    void everyRejectReasonHasVietnameseLabel() {
        for (MentoringRequest.RejectReason r : MentoringRequest.RejectReason.values()) {
            assertThat(RequestRules.rejectReasonLabel(r)).isNotBlank();
        }
    }
}
