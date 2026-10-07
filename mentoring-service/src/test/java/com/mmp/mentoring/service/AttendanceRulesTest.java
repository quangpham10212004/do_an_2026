package com.mmp.mentoring.service;

import com.mmp.mentoring.entity.MentoringSession.Attendance;
import com.mmp.mentoring.entity.MentoringSession.Status;
import com.mmp.mentoring.service.AttendanceRules.Side;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.OffsetDateTime;

import static com.mmp.mentoring.entity.MentoringSession.Attendance.*;
import static org.assertj.core.api.Assertions.assertThat;

/** US-12 — bảng kết luận xác nhận tham dự. */
class AttendanceRulesTest {

    private static Status outcome(Attendance mentee, Attendance mentor, boolean closed) {
        return AttendanceRules.resolve(mentee, mentor, closed).map(AttendanceRules.Resolution::outcome).orElse(null);
    }

    @Test
    void bothHeldCompletesImmediately() {
        assertThat(outcome(HELD, HELD, false)).isEqualTo(Status.COMPLETED);
        assertThat(AttendanceRules.resolve(HELD, HELD, false).orElseThrow().code()).isEqualTo("BOTH_HELD");
    }

    @Test
    void oneHeldWaitsForTheOtherThenCompletesAfterWindow() {
        assertThat(AttendanceRules.resolve(HELD, null, false)).isEmpty();
        assertThat(AttendanceRules.resolve(null, HELD, false)).isEmpty();
        assertThat(outcome(HELD, null, true)).isEqualTo(Status.COMPLETED);
        assertThat(outcome(null, HELD, true)).isEqualTo(Status.COMPLETED);
    }

    @Test
    void noAnswersCompleteAfterWindow() {
        assertThat(AttendanceRules.resolve(null, null, false)).isEmpty();
        assertThat(outcome(null, null, true)).isEqualTo(Status.COMPLETED);
        assertThat(AttendanceRules.resolve(null, null, true).orElseThrow().code()).isEqualTo("NO_ANSWER");
    }

    @Test
    void mentorReportsMenteeNoShowAndMenteeSilent() {
        assertThat(AttendanceRules.resolve(null, MENTEE_NO_SHOW, false)).isEmpty();
        assertThat(outcome(null, MENTEE_NO_SHOW, true)).isEqualTo(Status.NO_SHOW_MENTEE);
        assertThat(AttendanceRules.refundPercent(Status.NO_SHOW_MENTEE)).isZero();
    }

    @Test
    void menteeReportsMentorNoShowAndMentorSilent() {
        assertThat(outcome(MENTOR_NO_SHOW, null, true)).isEqualTo(Status.NO_SHOW_MENTOR);
        assertThat(AttendanceRules.refundPercent(Status.NO_SHOW_MENTOR)).isEqualTo(100);
    }

    @Test
    void conflictingAnswersDisputeImmediately() {
        assertThat(outcome(HELD, MENTEE_NO_SHOW, false)).isEqualTo(Status.DISPUTED);
        assertThat(outcome(MENTOR_NO_SHOW, HELD, false)).isEqualTo(Status.DISPUTED);
        assertThat(outcome(MENTOR_NO_SHOW, MENTEE_NO_SHOW, false)).isEqualTo(Status.DISPUTED);
        assertThat(outcome(CANCELLED_ON_CALL, HELD, false)).isEqualTo(Status.DISPUTED);
        assertThat(AttendanceRules.refundPercent(Status.DISPUTED)).isZero();
    }

    @Test
    void cancelledOnCallIsCancelledWithFullRefund() {
        assertThat(outcome(CANCELLED_ON_CALL, CANCELLED_ON_CALL, false)).isEqualTo(Status.CANCELLED);
        assertThat(outcome(CANCELLED_ON_CALL, null, true)).isEqualTo(Status.CANCELLED);
        assertThat(outcome(null, CANCELLED_ON_CALL, true)).isEqualTo(Status.CANCELLED);
        assertThat(AttendanceRules.resolve(null, CANCELLED_ON_CALL, false)).isEmpty();
        assertThat(AttendanceRules.refundPercent(Status.CANCELLED)).isEqualTo(100);
    }

    @Test
    void sidesCannotReportThemselvesAbsent() {
        assertThat(AttendanceRules.allowed(Side.MENTEE, MENTOR_NO_SHOW)).isTrue();
        assertThat(AttendanceRules.allowed(Side.MENTEE, MENTEE_NO_SHOW)).isFalse();
        assertThat(AttendanceRules.allowed(Side.MENTOR, MENTEE_NO_SHOW)).isTrue();
        assertThat(AttendanceRules.allowed(Side.MENTOR, MENTOR_NO_SHOW)).isFalse();
        assertThat(AttendanceRules.allowed(Side.MENTOR, HELD)).isTrue();
        assertThat(AttendanceRules.allowed(Side.MENTEE, CANCELLED_ON_CALL)).isTrue();
    }

    @Test
    void windowIsFromEndUntil48HoursAfter() {
        OffsetDateTime end = OffsetDateTime.parse("2026-10-07T10:00:00+07:00");
        Duration w = Duration.ofHours(48);
        assertThat(AttendanceRules.windowOpen(end, w, end.minusSeconds(1))).isFalse();
        assertThat(AttendanceRules.windowOpen(end, w, end)).isTrue();
        assertThat(AttendanceRules.windowOpen(end, w, end.plusHours(47))).isTrue();
        assertThat(AttendanceRules.windowOpen(end, w, end.plusHours(48))).isFalse();
    }
}
