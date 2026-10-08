package com.mmp.mentoring.service;

import com.mmp.mentoring.entity.MentorStrike;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.entity.MentoringSession.Attendance;
import com.mmp.mentoring.entity.MentoringSession.Status;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.security.AuthUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** US-12 — trả lời tham dự, kết luận ngay / sau 48 giờ, tác động tới tiền qua outbox, strike, hook tranh chấp. */
class AttendanceServiceTest {

    private TestFixtures f;
    private DisputeHook disputeHook;
    private AttendanceService service;
    private MentoringSession session;
    private final UUID id = UUID.randomUUID();
    private final UUID menteeId = UUID.randomUUID();
    private final UUID mentorId = UUID.randomUUID();
    private final AuthUser mentee = new AuthUser(menteeId, "e@test", "MENTEE");
    private final AuthUser mentor = new AuthUser(mentorId, "m@test", "MENTOR");

    @BeforeEach
    void setUp() {
        f = new TestFixtures();
        disputeHook = mock(DisputeHook.class);
        service = new AttendanceService(f.sessionRepo, f.outbox, f.strikes, f.packages, f.notifications, disputeHook, f.tx,
                Duration.ofHours(48), "Asia/Ho_Chi_Minh");
        session = new MentoringSession();
        ReflectionTestUtils.setField(session, "id", id);
        session.setMenteeId(menteeId);
        session.setMentorId(mentorId);
        session.setDurationMinutes(60);
        session.setPrice(new BigDecimal("300000"));
        session.setStatus(Status.CONFIRMED);
        endedMinutesAgo(10);
        when(f.sessionRepo.findForUpdate(id)).thenReturn(Optional.of(session));
    }

    private void endedMinutesAgo(long minutes) {
        session.setScheduledAt(OffsetDateTime.now().minusMinutes(60 + minutes));
    }

    private static String code(Runnable r) {
        try {
            r.run();
        } catch (ApiException e) {
            return e.getCode();
        }
        return null;
    }

    @Test
    void cannotAnswerBeforeEndOrAfterWindow() {
        session.setScheduledAt(OffsetDateTime.now().plusHours(1));
        assertThat(code(() -> service.answer(mentee, id, Attendance.HELD))).isEqualTo("ATTENDANCE_NOT_OPEN");
        session.setStatus(Status.AWAITING_ATTENDANCE);
        endedMinutesAgo(48 * 60 + 1);
        assertThat(code(() -> service.answer(mentee, id, Attendance.HELD))).isEqualTo("ATTENDANCE_WINDOW_CLOSED");
        session.setStatus(Status.COMPLETED);
        assertThat(code(() -> service.answer(mentee, id, Attendance.HELD))).isEqualTo("ATTENDANCE_CLOSED");
    }

    @Test
    void onlyParticipantsAnswerOnceWithAllowedAnswers() {
        AuthUser stranger = new AuthUser(UUID.randomUUID(), "x@test", "MENTEE");
        assertThat(code(() -> service.answer(stranger, id, Attendance.HELD))).isEqualTo("FORBIDDEN");
        assertThat(code(() -> service.answer(mentee, id, Attendance.MENTEE_NO_SHOW))).isEqualTo("INVALID_ATTENDANCE_ANSWER");
        service.answer(mentee, id, Attendance.HELD);
        assertThat(code(() -> service.answer(mentee, id, Attendance.HELD))).isEqualTo("ATTENDANCE_ALREADY_ANSWERED");
    }

    @Test
    void firstAnswerMovesEndedConfirmedSessionToAwaitingAndWaits() {
        service.answer(mentee, id, Attendance.HELD);

        assertThat(session.getStatus()).isEqualTo(Status.AWAITING_ATTENDANCE);
        assertThat(session.getMenteeAttendance()).isEqualTo(Attendance.HELD);
        assertThat(session.getMenteeAttendedAt()).isNotNull();
        verify(f.notifications).notifyUser(eq(mentorId), eq("ATTENDANCE_REQUIRED"), anyString(), anyString(), anyString());
        verifyNoInteractions(f.outbox);
    }

    @Test
    void bothHeldCompletesWithoutMoneyMovement() {
        service.answer(mentee, id, Attendance.HELD);
        service.completeByMentor(mentor, id);

        assertThat(session.getStatus()).isEqualTo(Status.COMPLETED);
        assertThat(session.getAttendanceResolution()).isEqualTo("BOTH_HELD");
        verify(f.outbox, never()).enqueueRefund(any(), anyInt(), any());
        verify(f.outbox, never()).enqueueHold(any(), any());
        verify(f.notifications).notifyUser(eq(menteeId), eq("SESSION_COMPLETED"), anyString(), anyString(), anyString());
    }

    @Test
    void conflictingAnswersDisputeAndHoldPaymentImmediately() {
        service.answer(mentee, id, Attendance.HELD);
        service.answer(mentor, id, Attendance.MENTEE_NO_SHOW);

        assertThat(session.getStatus()).isEqualTo(Status.DISPUTED);
        verify(f.outbox).enqueueHold(id, "SESSION_DISPUTED");
        verify(f.outbox, never()).enqueueRefund(any(), anyInt(), any());
        verify(f.outbox).flushSession(id);
        verify(disputeHook).sessionDisputed(session);
        verifyNoInteractions(f.strikes);
    }

    @Test
    void adminCanCompleteOnBehalfOfMentorButNotAnswerAsSide() {
        AuthUser admin = new AuthUser(UUID.randomUUID(), "a@test", "ADMIN");
        assertThat(code(() -> service.answer(admin, id, Attendance.HELD))).isEqualTo("FORBIDDEN");
        service.completeByMentor(admin, id);
        assertThat(session.getMentorAttendance()).isEqualTo(Attendance.HELD);
    }

    @Test
    void jobMovesEndedConfirmedSessionsToAwaiting() {
        when(f.sessionRepo.findIdsEndedBefore(eq("CONFIRMED"), any())).thenReturn(List.of(id.toString()));

        assertThat(service.markEnded(OffsetDateTime.now())).isEqualTo(1);

        assertThat(session.getStatus()).isEqualTo(Status.AWAITING_ATTENDANCE);
        verify(f.notifications).notifyUser(eq(menteeId), eq("ATTENDANCE_REQUIRED"), anyString(), anyString(), anyString());
        verify(f.notifications).notifyUser(eq(mentorId), eq("ATTENDANCE_REQUIRED"), anyString(), anyString(), anyString());
    }

    @Test
    void noAnswersCompleteAfter48Hours() {
        session.setStatus(Status.AWAITING_ATTENDANCE);
        endedMinutesAgo(48 * 60 + 1);
        when(f.sessionRepo.findIdsEndedBefore(eq("AWAITING_ATTENDANCE"), any())).thenReturn(List.of(id.toString()));

        assertThat(service.resolveExpired(OffsetDateTime.now())).isEqualTo(1);

        assertThat(session.getStatus()).isEqualTo(Status.COMPLETED);
        assertThat(session.getAttendanceResolution()).isEqualTo("NO_ANSWER");
        verifyNoInteractions(f.strikes);
    }

    @Test
    void sessionStillInWindowIsNotResolvedByJob() {
        session.setStatus(Status.AWAITING_ATTENDANCE);
        endedMinutesAgo(47 * 60);
        when(f.sessionRepo.findIdsEndedBefore(eq("AWAITING_ATTENDANCE"), any())).thenReturn(List.of(id.toString()));

        assertThat(service.resolveExpired(OffsetDateTime.now())).isZero();
        assertThat(session.getStatus()).isEqualTo(Status.AWAITING_ATTENDANCE);
    }

    @Test
    void mentorNoShowReportedAndMentorSilentRefundsFullyAndStrikes() {
        session.setStatus(Status.AWAITING_ATTENDANCE);
        session.answerAsMentee(Attendance.MENTOR_NO_SHOW, OffsetDateTime.now().minusHours(47));
        endedMinutesAgo(48 * 60 + 1);
        when(f.sessionRepo.findIdsEndedBefore(eq("AWAITING_ATTENDANCE"), any())).thenReturn(List.of(id.toString()));

        service.resolveExpired(OffsetDateTime.now());

        assertThat(session.getStatus()).isEqualTo(Status.NO_SHOW_MENTOR);
        assertThat(session.getRefundPercent()).isEqualTo(100);
        verify(f.outbox).enqueueRefund(id, 100, "MENTOR_NO_SHOW");
        verify(f.strikes).record(mentorId, id, MentorStrike.Reason.MENTOR_NO_SHOW);
    }

    @Test
    void menteeNoShowReportedAndMenteeSilentPaysMentor() {
        session.setStatus(Status.AWAITING_ATTENDANCE);
        session.answerAsMentor(Attendance.MENTEE_NO_SHOW, OffsetDateTime.now().minusHours(47));
        endedMinutesAgo(48 * 60 + 1);
        when(f.sessionRepo.findIdsEndedBefore(eq("AWAITING_ATTENDANCE"), any())).thenReturn(List.of(id.toString()));

        service.resolveExpired(OffsetDateTime.now());

        assertThat(session.getStatus()).isEqualTo(Status.NO_SHOW_MENTEE);
        assertThat(session.getRefundPercent()).isZero();
        verify(f.outbox, never()).enqueueRefund(any(), anyInt(), any());
        verifyNoInteractions(f.strikes);
    }

    @Test
    void bothCancelledOnCallRefundsWithoutStrike() {
        service.answer(mentee, id, Attendance.CANCELLED_ON_CALL);
        service.answer(mentor, id, Attendance.CANCELLED_ON_CALL);

        assertThat(session.getStatus()).isEqualTo(Status.CANCELLED);
        assertThat(session.getCancelReason()).isEqualTo("CANCELLED_ON_CALL");
        assertThat(session.getCancelledBy()).isEqualTo("SYSTEM");
        verify(f.outbox).enqueueRefund(id, 100, "CANCELLED_ON_CALL");
        verifyNoInteractions(f.strikes);
    }

    @Test
    void freeSessionNoShowDoesNotQueueRefundButStillStrikes() {
        session.setPrice(BigDecimal.ZERO);
        session.setStatus(Status.AWAITING_ATTENDANCE);
        session.answerAsMentee(Attendance.MENTOR_NO_SHOW, OffsetDateTime.now().minusHours(47));
        endedMinutesAgo(48 * 60 + 1);
        when(f.sessionRepo.findIdsEndedBefore(eq("AWAITING_ATTENDANCE"), any())).thenReturn(List.of(id.toString()));

        service.resolveExpired(OffsetDateTime.now());

        assertThat(session.getStatus()).isEqualTo(Status.NO_SHOW_MENTOR);
        verify(f.outbox, never()).enqueueRefund(any(), anyInt(), any());
        verify(f.strikes).record(mentorId, id, MentorStrike.Reason.MENTOR_NO_SHOW);
    }
}
