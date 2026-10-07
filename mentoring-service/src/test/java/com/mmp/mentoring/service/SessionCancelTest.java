package com.mmp.mentoring.service;

import com.mmp.mentoring.entity.LateCancellation;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.security.AuthUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** US-01 — luồng huỷ phiên ở tầng service. */
class SessionCancelTest {

    TestFixtures f;
    final UUID id = UUID.randomUUID();
    final UUID mentorId = UUID.randomUUID();
    final UUID menteeId = UUID.randomUUID();
    final AuthUser mentee = new AuthUser(menteeId, "e@test", "MENTEE");
    final AuthUser mentor = new AuthUser(mentorId, "m@test", "MENTOR");
    MentoringSession session;

    @BeforeEach
    void setUp() {
        f = new TestFixtures();
        session = new MentoringSession();
        session.setMentorId(mentorId);
        session.setMenteeId(menteeId);
        session.setDurationMinutes(60);
        session.setPrice(new BigDecimal("200000"));
        session.setStatus(MentoringSession.Status.CONFIRMED);
        org.springframework.test.util.ReflectionTestUtils.setField(session, "id", id);
        when(f.sessionRepo.findById(id)).thenReturn(Optional.of(session));
    }

    @Test
    void previewShowsExactRefund() {
        session.setScheduledAt(OffsetDateTime.now().plusDays(4));
        var p = f.service().cancelPreview(mentee, id);
        assertThat(p.refundPercent()).isEqualTo(100);
        assertThat(p.refundAmount()).isEqualByComparingTo("200000");
        assertThat(p.cancelledBy()).isEqualTo("MENTEE");
        session.setScheduledAt(OffsetDateTime.now().plusDays(1));
        assertThat(f.service().cancelPreview(mentee, id).refundAmount()).isEqualByComparingTo("0");
    }

    @Test
    void lateMenteeCancelDoesNotCallRefund() {
        session.setScheduledAt(OffsetDateTime.now().plusDays(1));
        var view = f.service().cancel(mentee, id, null);
        assertThat(view.status()).isEqualTo("CANCELLED");
        assertThat(view.cancelledBy()).isEqualTo("MENTEE");
        assertThat(view.refundPercent()).isZero();
        verify(f.paymentClient, never()).refund(any(), any(), anyInt());
        verify(f.outbox, never()).enqueueReward(any(), anyInt(), any(), any());
    }

    @Test
    void earlyMenteeCancelRefundsFully() {
        session.setScheduledAt(OffsetDateTime.now().plusDays(4));
        f.service().cancel(mentee, id, new com.mmp.mentoring.dto.MentoringDtos.CancelSessionInput("Ban viec"));
        verify(f.paymentClient).refund(any(), eq("SESSION_CANCELLED_BY_MENTEE"), eq(100));
        assertThat(session.getRefundPercent()).isEqualTo(100);
        assertThat(session.getCancelReason()).isEqualTo("Ban viec");
    }

    @Test
    void mentorCancelRefundsAndQueuesApologyPoints() {
        session.setScheduledAt(OffsetDateTime.now().plusHours(3));
        f.service().cancel(mentor, id, null);
        verify(f.paymentClient).refund(any(), eq("SESSION_CANCELLED_BY_MENTOR"), eq(100));
        verify(f.outbox).enqueueReward(eq(menteeId), eq(20), eq(PaymentOutboxService.MENTOR_CANCEL_APOLOGY), any());
        assertThat(session.getCancelledBy()).isEqualTo("MENTOR");
        verify(f.strikes).record(mentorId, id, com.mmp.mentoring.entity.MentorStrike.Reason.MENTOR_CANCEL); // US-02
    }

    @Test
    void menteeOrSystemCancelGivesNoStrike() {
        session.setScheduledAt(OffsetDateTime.now().plusDays(4));
        f.service().cancel(mentee, id, null);
        verify(f.strikes, never()).record(any(), any(), any());
    }

    @Test
    void refundFailureKeepsSessionActive() {
        session.setScheduledAt(OffsetDateTime.now().plusDays(4));
        when(f.paymentClient.refund(any(), any(), anyInt()))
                .thenThrow(new ApiException(org.springframework.http.HttpStatus.BAD_GATEWAY, "REFUND_FAILED", "x"));
        assertThatThrownBy(() -> f.service().cancel(mentee, id, null)).isInstanceOf(ApiException.class);
        assertThat(session.getStatus()).isEqualTo(MentoringSession.Status.CONFIRMED);
    }

    @Test
    void freeSessionLateCancelIsRecorded() {
        session.setPrice(BigDecimal.ZERO);
        session.setScheduledAt(OffsetDateTime.now().plusMinutes(90));
        f.service().cancel(mentee, id, null);
        verify(f.lateCancelRepo).save(any(LateCancellation.class));
        verify(f.paymentClient, never()).refund(any(), any(), anyInt());
    }

    @Test
    void paymentArrivingAfterExpiryIsRefunded() {
        // US-12 — phiên quá hạn thanh toán nay là EXPIRED (trước là CANCELLED) vẫn phải được hoàn khi tiền về muộn
        session.setScheduledAt(OffsetDateTime.now().plusDays(2));
        session.setStatus(MentoringSession.Status.EXPIRED);
        f.service().markPaid(id, UUID.randomUUID());
        assertThat(session.getStatus()).isEqualTo(MentoringSession.Status.EXPIRED);
        verify(f.paymentClient).refund(id, "SESSION_ALREADY_CANCELLED");
    }

    @Test
    void startedSessionCannotBeCancelled() {
        session.setScheduledAt(OffsetDateTime.now().minusMinutes(5));
        assertThatThrownBy(() -> f.service().cancel(mentee, id, null)).hasMessageContaining("đã bắt đầu");
    }
}
