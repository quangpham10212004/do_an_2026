package com.mmp.mentoring.service;

import com.mmp.mentoring.service.ReschedulePolicy.Actor;
import com.mmp.mentoring.service.ReschedulePolicy.Outcome;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.OffsetDateTime;

import static org.assertj.core.api.Assertions.assertThat;

/** Quy tắc đổi lịch: ai được tự đổi, khi nào cần bên kia đồng ý, lần đổi nào tính vào hạn mức. */
class ReschedulePolicyTest {

    private static final Duration FREE_WINDOW = Duration.ofHours(24);
    private final OffsetDateTime now = OffsetDateTime.parse("2026-10-07T10:00:00+07:00");

    private Outcome decide(Actor actor, OffsetDateTime start, int count) {
        return ReschedulePolicy.decide(actor, now, start, count, FREE_WINDOW, 2);
    }

    @Test
    void menteeChangingEarlyAndWithinQuotaAppliesImmediately() {
        assertThat(decide(Actor.MENTEE, now.plusDays(3), 0)).isEqualTo(Outcome.APPLY_NOW);
        assertThat(decide(Actor.MENTEE, now.plusDays(3), 1)).isEqualTo(Outcome.APPLY_NOW);
    }

    @Test
    void menteeExactlyAtTheFreeWindowBoundaryStillAppliesImmediately() {
        assertThat(decide(Actor.MENTEE, now.plus(FREE_WINDOW), 0)).isEqualTo(Outcome.APPLY_NOW);
        assertThat(decide(Actor.MENTEE, now.plus(FREE_WINDOW).minusMinutes(1), 0)).isEqualTo(Outcome.NEEDS_APPROVAL);
    }

    @Test
    void menteeChangingLateNeedsMentorApproval() {
        assertThat(decide(Actor.MENTEE, now.plusHours(5), 0)).isEqualTo(Outcome.NEEDS_APPROVAL);
    }

    @Test
    void menteeWhoUsedAllFreeChangesNeedsMentorApproval() {
        assertThat(decide(Actor.MENTEE, now.plusDays(3), 2)).isEqualTo(Outcome.NEEDS_APPROVAL);
    }

    @Test
    void mentorProposalAlwaysNeedsMenteeApprovalEvenFarInAdvance() {
        assertThat(decide(Actor.MENTOR, now.plusDays(30), 0)).isEqualTo(Outcome.NEEDS_APPROVAL);
    }

    @Test
    void adminAppliesImmediately() {
        assertThat(decide(Actor.ADMIN, now.plusHours(2), 5)).isEqualTo(Outcome.APPLY_NOW);
    }

    @Test
    void onlyMenteeInitiatedChangesCountTowardTheQuota() {
        assertThat(ReschedulePolicy.countsTowardQuota(Actor.MENTEE)).isTrue();
        assertThat(ReschedulePolicy.countsTowardQuota(Actor.MENTOR)).isFalse();
        assertThat(ReschedulePolicy.countsTowardQuota(Actor.ADMIN)).isFalse();
    }
}
