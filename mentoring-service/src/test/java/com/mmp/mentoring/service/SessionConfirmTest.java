package com.mmp.mentoring.service;

import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.security.AuthUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Bản chốt v2.0 §5 — học phí tạm giữ từ ví → mentor xác nhận trong hạn → CONFIRMED; quá hạn / từ chối → hoàn 100%. */
class SessionConfirmTest {

    final UUID id = UUID.randomUUID();
    final UUID menteeId = UUID.randomUUID();
    final UUID mentorId = UUID.randomUUID();
    final AuthUser mentor = new AuthUser(mentorId, "m@test", "MENTOR");
    final AuthUser mentee = new AuthUser(menteeId, "e@test", "MENTEE");
    TestFixtures f;
    MentoringSession session;

    @BeforeEach
    void setUp() {
        f = new TestFixtures();
        session = new MentoringSession();
        session.setMentorId(mentorId);
        session.setMenteeId(menteeId);
        session.setDurationMinutes(60);
        session.setPrice(new BigDecimal("200000"));
        session.setStatus(MentoringSession.Status.PENDING);
        session.setScheduledAt(OffsetDateTime.now().plusDays(3));
        ReflectionTestUtils.setField(session, "id", id);
        when(f.sessionRepo.findById(id)).thenReturn(Optional.of(session));
    }

    private static String code(Runnable r) {
        try {
            r.run();
        } catch (ApiException e) {
            return e.getCode();
        }
        return "OK";
    }

    @Test
    void paymentSuccessMovesThePendingSessionToAwaitingMentorWithADeadline() {
        f.service().markPaid(id, UUID.randomUUID());

        assertThat(session.getStatus()).isEqualTo(MentoringSession.Status.AWAITING_MENTOR);
        // buổi còn 3 ngày → hạn = 24 giờ sau khi tạm giữ
        assertThat(session.getConfirmDeadline()).isBetween(OffsetDateTime.now().plusHours(23), OffsetDateTime.now().plusHours(25));
        verify(f.notifications).notifyUser(eq(mentorId), eq("SESSION_BOOKED"), anyString(), anyString(), anyString());
        verify(f.notifications).notifyUser(eq(menteeId), eq("SESSION_AWAITING_MENTOR"), anyString(), anyString(), anyString());
    }

    @Test
    void deadlineIsOneHourBeforeStartWhenThatComesFirst() {
        OffsetDateTime start = OffsetDateTime.now().plusHours(5);
        session.setScheduledAt(start);

        f.service().markPaid(id, UUID.randomUUID());

        assertThat(session.getConfirmDeadline()).isEqualTo(start.minusHours(1));
    }

    @Test
    void markPaidIsIdempotentOnceAwaitingMentor() {
        f.service().markPaid(id, UUID.randomUUID());
        OffsetDateTime first = session.getConfirmDeadline();
        f.service().markPaid(id, UUID.randomUUID());
        assertThat(session.getConfirmDeadline()).isEqualTo(first);
    }

    @Test
    void mentorConfirmsInTime() {
        session.setStatus(MentoringSession.Status.AWAITING_MENTOR);
        session.setConfirmDeadline(OffsetDateTime.now().plusHours(5));

        var view = f.service().confirm(mentor, id);

        assertThat(view.status()).isEqualTo("CONFIRMED");
        assertThat(session.getConfirmDeadline()).isNull();
        verify(f.notifications, times(2)).notifyUser(any(), eq("SESSION_CONFIRMED"), anyString(), anyString(), anyString());
    }

    @Test
    void onlyTheSessionsMentorCanConfirmAndOnlyWhileAwaiting() {
        session.setStatus(MentoringSession.Status.AWAITING_MENTOR);
        session.setConfirmDeadline(OffsetDateTime.now().plusHours(5));
        assertThatThrownBy(() -> f.service().confirm(mentee, id)).isInstanceOf(ApiException.class);

        session.setStatus(MentoringSession.Status.CONFIRMED);
        assertThat(code(() -> f.service().confirm(mentor, id))).isEqualTo("NOT_AWAITING_MENTOR");
        session.setStatus(MentoringSession.Status.PENDING);
        assertThat(code(() -> f.service().confirm(mentor, id))).isEqualTo("NOT_AWAITING_MENTOR");
    }

    @Test
    void confirmationAfterTheDeadlineIsRefused() {
        session.setStatus(MentoringSession.Status.AWAITING_MENTOR);
        session.setConfirmDeadline(OffsetDateTime.now().minusMinutes(1));
        assertThat(code(() -> f.service().confirm(mentor, id))).isEqualTo("CONFIRM_WINDOW_CLOSED");
        assertThat(session.getStatus()).isEqualTo(MentoringSession.Status.AWAITING_MENTOR);
    }

    @Test
    void declineRefundsInFullAndGivesNoStrike() {
        session.setStatus(MentoringSession.Status.AWAITING_MENTOR);
        session.setConfirmDeadline(OffsetDateTime.now().plusHours(5));

        var view = f.service().decline(mentor, id, new com.mmp.mentoring.dto.MentoringDtos.DeclineSessionInput("Trung lich"));

        verify(f.paymentClient).refund(eq(id), anyString(), eq(100));
        assertThat(view.status()).isEqualTo("CANCELLED");
        assertThat(session.getCancelledBy()).isEqualTo("MENTOR");
        assertThat(session.getRefundPercent()).isEqualTo(100);
        assertThat(session.getCancelReason()).isEqualTo("Trung lich");
        verify(f.strikes, never()).record(any(), any(), any());
        verify(f.notifications).notifyUser(eq(menteeId), eq("SESSION_CANCELLED"), anyString(), contains("hoàn 100%"), anyString());
    }

    @Test
    void anotherMentorCannotDecline() {
        session.setStatus(MentoringSession.Status.AWAITING_MENTOR);
        AuthUser other = new AuthUser(UUID.randomUUID(), "x@test", "MENTOR");
        assertThatThrownBy(() -> f.service().decline(other, id, null)).isInstanceOf(ApiException.class);
        verify(f.paymentClient, never()).refund(any(), any(), anyInt());
    }

    @Test
    void unconfirmedSessionsPastTheDeadlineExpireWithAFullRefund() {
        session.setStatus(MentoringSession.Status.AWAITING_MENTOR);
        session.setConfirmDeadline(OffsetDateTime.now().minusMinutes(1));
        when(f.sessionRepo.findUnconfirmedPastDeadline(any())).thenReturn(List.of(session));

        int n = f.service().expireUnconfirmed(OffsetDateTime.now());

        assertThat(n).isEqualTo(1);
        assertThat(session.getStatus()).isEqualTo(MentoringSession.Status.EXPIRED);
        assertThat(session.getCancelledBy()).isEqualTo("SYSTEM");
        assertThat(session.getCancelReason()).isEqualTo("MENTOR_NO_RESPONSE");
        verify(f.paymentClient).refund(eq(id), anyString(), eq(100));
        verify(f.notifications).notifyUser(eq(mentorId), eq("SESSION_EXPIRED"), anyString(), anyString(), anyString());
        verify(f.strikes, never()).record(any(), any(), any());
    }

    @Test
    void refundFailureKeepsTheSessionAwaitingSoTheJobRetries() {
        session.setStatus(MentoringSession.Status.AWAITING_MENTOR);
        session.setConfirmDeadline(OffsetDateTime.now().minusMinutes(1));
        when(f.sessionRepo.findUnconfirmedPastDeadline(any())).thenReturn(List.of(session));
        when(f.paymentClient.refund(any(), any(), anyInt()))
                .thenThrow(new ApiException(org.springframework.http.HttpStatus.BAD_GATEWAY, "REFUND_FAILED", "x"));

        int n = f.service().expireUnconfirmed(OffsetDateTime.now());

        assertThat(n).isZero();
        assertThat(session.getStatus()).isEqualTo(MentoringSession.Status.AWAITING_MENTOR);
    }
}
