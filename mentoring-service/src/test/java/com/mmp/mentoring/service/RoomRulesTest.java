package com.mmp.mentoring.service;

import com.mmp.mentoring.entity.MentoringSession.Status;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.OffsetDateTime;

import static org.assertj.core.api.Assertions.assertThat;

/** Bản chốt v2.0 §6 — khung giờ phòng học, thời gian chờ, kết luận vắng mặt từ nhật ký vào phòng. */
class RoomRulesTest {

    private final OffsetDateTime start = OffsetDateTime.parse("2026-10-07T10:00:00+07:00");
    private final OffsetDateTime end = start.plusMinutes(60);

    @Test
    void roomOpensTenMinutesBeforeAndClosesThirtyMinutesAfter() {
        Duration before = Duration.ofMinutes(10), after = Duration.ofMinutes(30);
        assertThat(RoomRules.open(start, end, start.minusMinutes(11), before, after)).isFalse();
        assertThat(RoomRules.open(start, end, start.minusMinutes(10), before, after)).isTrue();
        assertThat(RoomRules.open(start, end, start.plusMinutes(30), before, after)).isTrue();
        assertThat(RoomRules.open(start, end, end.plusMinutes(30), before, after)).isTrue();
        assertThat(RoomRules.open(start, end, end.plusMinutes(31), before, after)).isFalse();
    }

    @Test
    void graceIsTenMinutesOrFiveForTrials() {
        Duration regular = Duration.ofMinutes(10), trial = Duration.ofMinutes(5);
        assertThat(RoomRules.grace(false, regular, trial)).isEqualTo(regular);
        assertThat(RoomRules.grace(true, regular, trial)).isEqualTo(trial);
        assertThat(RoomRules.graceElapsed(start, start.plusMinutes(9), regular)).isFalse();
        assertThat(RoomRules.graceElapsed(start, start.plusMinutes(10), regular)).isTrue();
        assertThat(RoomRules.graceElapsed(start, start.plusMinutes(5), trial)).isTrue();
    }

    @Test
    void joinLogDecidesAbsence() {
        assertThat(RoomRules.byJoinLog(true, true, true)).isEmpty();
        var menteeAbsent = RoomRules.byJoinLog(false, true, true).orElseThrow();
        assertThat(menteeAbsent.outcome()).isEqualTo(Status.NO_SHOW_MENTEE);
        var mentorAbsent = RoomRules.byJoinLog(true, false, true).orElseThrow();
        assertThat(mentorAbsent.outcome()).isEqualTo(Status.NO_SHOW_MENTOR);
        var both = RoomRules.byJoinLog(false, false, true).orElseThrow();
        assertThat(both.outcome()).isEqualTo(Status.CANCELLED);
        assertThat(both.code()).isEqualTo("BOTH_ABSENT");
    }

    @Test
    void withoutRequiredLogsNoOneIsAutomaticallyAbsent() {
        assertThat(RoomRules.byJoinLog(false, false, false)).isEmpty();
        // ... nhưng khi đã có ít nhất một bên vào thì vẫn kết luận bên kia vắng
        assertThat(RoomRules.byJoinLog(false, true, false)).isPresent();
    }

    @Test
    void absenceReportNeedsGraceElapsedYouInTheRoomAndTheOtherOut() {
        assertThat(RoomRules.absenceReportError(true, false, false)).contains("GRACE_NOT_ELAPSED");
        assertThat(RoomRules.absenceReportError(false, false, true)).contains("YOU_NOT_JOINED");
        assertThat(RoomRules.absenceReportError(true, true, true)).contains("OTHER_SIDE_JOINED");
        assertThat(RoomRules.absenceReportError(true, false, true)).isEmpty();
    }
}
