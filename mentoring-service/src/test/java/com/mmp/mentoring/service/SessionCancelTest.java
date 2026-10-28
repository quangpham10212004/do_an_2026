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
        session.setScheduledAt(OffsetDateTime.now().plusHours(10));   // 4–24 giờ → 50%
        assertThat(f.service().cancelPreview(mentee, id).refundAmount()).isEqualByComparingTo("100000");
        session.setScheduledAt(OffsetDateTime.now().plusHours(3));
        assertThat(f.service().cancelPreview(mentee, id).refundAmount()).isEqualByComparingTo("0");
    }

    @Test
    void lateMenteeCancelDoesNotCallRefund() {
        session.setScheduledAt(OffsetDateTime.now().plusHours(3));
        var view = f.service().cancel(mentee, id, null);
        assertThat(view.status()).isEqualTo("CANCELLED");
        assertThat(view.cancelledBy()).isEqualTo("MENTEE");
        assertThat(view.refundPercent()).isZero();
        verify(f.outbox, never()).enqueueRefund(any(), anyInt(), any());
        verifyNoInteractions(f.paymentClient);
        verify(f.outbox, never()).enqueueReward(any(), anyInt(), any(), any());
        // US-25 — hoàn 0% → mentor được trả: báo trạng thái cuối CANCELLED để giải phóng thu nhập sau 72 giờ
        verify(f.outbox).enqueueFinalState(eq(id), eq("CANCELLED"), eq(session.endsAt()), eq(false));
    }

    @Test
    void earlyMenteeCancelRefundsFully() {
        session.setScheduledAt(OffsetDateTime.now().plusDays(4));
        f.service().cancel(mentee, id, new com.mmp.mentoring.dto.MentoringDtos.CancelSessionInput("Ban viec"));
        verify(f.outbox).enqueueRefund(eq(id), eq(100), eq("SESSION_CANCELLED_BY_MENTEE"));
        verify(f.outbox).flushSession(id);
        assertThat(session.getRefundPercent()).isEqualTo(100);
        verify(f.outbox, never()).enqueueFinalState(any(), any(), any(), anyBoolean());
        assertThat(session.getCancelReason()).isEqualTo("Ban viec");
    }

    @Test
    void mentorCancelRefundsFullyWithStrikeAndNoApologyPoints() {
        session.setScheduledAt(OffsetDateTime.now().plusHours(3));
        f.service().cancel(mentor, id, null);
        verify(f.outbox).enqueueRefund(eq(id), eq(100), eq("SESSION_CANCELLED_BY_MENTOR"));
        verify(f.outbox, never()).enqueueReward(any(), anyInt(), any(), any());   // v2.0: bỏ điểm xin lỗi
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
    void cancelNeverCallsPaymentServiceAndQueuesTheRefundInsideTheTransaction() {
        session.setScheduledAt(OffsetDateTime.now().plusDays(4));
        java.util.concurrent.atomic.AtomicBoolean inTx = new java.util.concurrent.atomic.AtomicBoolean();
        doAnswer(inv -> {
            inTx.set(true);
            try {
                return inv.<org.springframework.transaction.support.TransactionCallback<?>>getArgument(0).doInTransaction(null);
            } finally {
                inTx.set(false);
            }
        }).when(f.tx).execute(any());
        java.util.List<Boolean> queuedInsideTx = new java.util.ArrayList<>();
        doAnswer(inv -> queuedInsideTx.add(inTx.get())).when(f.outbox).enqueueRefund(any(), anyInt(), any());

        f.service().cancel(mentee, id, null);

        assertThat(queuedInsideTx).containsExactly(true);
        assertThat(session.getStatus()).isEqualTo(MentoringSession.Status.CANCELLED);
        verifyNoInteractions(f.paymentClient);
    }

    @Test
    void refundDecisionIsTakenOnTheLockedRowNotOnTheEarlierRead() {
        // Đọc cũ thấy PENDING (chưa thanh toán → hoàn 0%), nhưng khi khoá dòng markPaid đã commit: AWAITING_MENTOR → phải hoàn 100%
        session.setScheduledAt(OffsetDateTime.now().plusDays(4));
        session.setStatus(MentoringSession.Status.AWAITING_MENTOR);
        MentoringSession stale = new MentoringSession();
        stale.setMentorId(mentorId);
        stale.setMenteeId(menteeId);
        stale.setDurationMinutes(60);
        stale.setPrice(new BigDecimal("200000"));
        stale.setStatus(MentoringSession.Status.PENDING);
        stale.setScheduledAt(session.getScheduledAt());
        org.springframework.test.util.ReflectionTestUtils.setField(stale, "id", id);
        when(f.sessionRepo.findById(id)).thenReturn(Optional.of(stale));
        when(f.sessionRepo.findForUpdate(id)).thenReturn(Optional.of(session));

        f.service().cancel(mentee, id, null);

        assertThat(session.getStatus()).isEqualTo(MentoringSession.Status.CANCELLED);
        assertThat(session.getRefundPercent()).isEqualTo(100);
        verify(f.outbox).enqueueRefund(eq(id), eq(100), eq("SESSION_CANCELLED_BY_MENTEE"));
    }

    @Test
    void cancelOfAnAlreadyCancelledSessionIsRefusedOnTheLockedRow() {
        session.setScheduledAt(OffsetDateTime.now().plusDays(4));
        MentoringSession live = new MentoringSession();
        org.springframework.test.util.ReflectionTestUtils.setField(live, "id", id);
        live.setMentorId(mentorId);
        live.setMenteeId(menteeId);
        live.setPrice(new BigDecimal("200000"));
        live.setScheduledAt(session.getScheduledAt());
        live.setStatus(MentoringSession.Status.CANCELLED);
        when(f.sessionRepo.findForUpdate(id)).thenReturn(Optional.of(live));

        assertThatThrownBy(() -> f.service().cancel(mentee, id, null)).isInstanceOf(ApiException.class);
        verify(f.outbox, never()).enqueueRefund(any(), anyInt(), any());
    }

    @Test
    void midWindowMenteeCancelRefundsHalfAndReportsFinalStateForTheMentorShare() {
        session.setScheduledAt(OffsetDateTime.now().plusHours(10));
        f.service().cancel(mentee, id, null);
        var order = inOrder(f.outbox);
        order.verify(f.outbox).enqueueRefund(eq(id), eq(50), eq("SESSION_CANCELLED_BY_MENTEE"));
        order.verify(f.outbox).enqueueFinalState(eq(id), eq("CANCELLED"), eq(session.endsAt()), eq(false));
        assertThat(session.getRefundPercent()).isEqualTo(50);
    }

    @Test
    void menteeCancellingBeforeMentorConfirmationIsRefundedFullyEvenWhenLate() {
        session.setStatus(MentoringSession.Status.AWAITING_MENTOR);
        session.setScheduledAt(OffsetDateTime.now().plusHours(2));
        f.service().cancel(mentee, id, null);
        verify(f.outbox).enqueueRefund(eq(id), eq(100), eq("SESSION_CANCELLED_BY_MENTEE"));
        assertThat(session.getRefundPercent()).isEqualTo(100);
        verify(f.outbox, never()).enqueueFinalState(any(), any(), any(), anyBoolean());
    }

    @Test
    void paymentArrivingAfterExpiryIsRefunded() {
        // US-12 — phiên quá hạn thanh toán nay là EXPIRED (trước là CANCELLED) vẫn phải được hoàn khi tiền về muộn
        session.setScheduledAt(OffsetDateTime.now().plusDays(2));
        session.setStatus(MentoringSession.Status.EXPIRED);
        UUID txn = UUID.randomUUID();
        f.service().markPaid(id, txn);
        assertThat(session.getStatus()).isEqualTo(MentoringSession.Status.EXPIRED);
        verify(f.outbox).enqueueRefund(id, 100, "SESSION_ALREADY_CANCELLED");
        verify(f.outbox).flushSession(id);
        assertThat(session.getPaymentTransactionId()).isEqualTo(txn);
        verifyNoInteractions(f.paymentClient);

        // payment-service gọi lại callback tới khi đồng bộ được: không xếp thêm lần hoàn nào
        f.service().markPaid(id, txn);
        verify(f.outbox, times(1)).enqueueRefund(any(), anyInt(), any());
    }

    @Test
    void paymentArrivingAfterACancelOfAPendingSessionIsRefundedOnce() {
        // Huỷ lúc còn PENDING (chưa thấy tiền → hoàn 0%) rồi markPaid mới về: tiền phải được hoàn
        session.setScheduledAt(OffsetDateTime.now().plusDays(2));
        session.setStatus(MentoringSession.Status.PENDING);
        f.service().cancel(mentee, id, null);
        verify(f.outbox, never()).enqueueRefund(any(), anyInt(), any());

        f.service().markPaid(id, UUID.randomUUID());

        assertThat(session.getStatus()).isEqualTo(MentoringSession.Status.CANCELLED);
        verify(f.outbox, times(1)).enqueueRefund(id, 100, "SESSION_ALREADY_CANCELLED");
    }

    @Test
    void startedSessionCannotBeCancelled() {
        session.setScheduledAt(OffsetDateTime.now().minusMinutes(5));
        assertThatThrownBy(() -> f.service().cancel(mentee, id, null)).hasMessageContaining("đã bắt đầu");
    }
}
