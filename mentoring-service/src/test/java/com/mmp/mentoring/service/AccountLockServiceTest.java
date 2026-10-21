package com.mmp.mentoring.service;

import com.mmp.mentoring.client.AuditClient;
import com.mmp.mentoring.client.PaymentClient;
import com.mmp.mentoring.entity.Dispute;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.repository.SessionRepository;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Bản chốt v2.0 §2.1 — khoá tài khoản: huỷ buổi sắp tới, giữ thu nhập đang chờ của mentor, báo người bị khoá. */
class AccountLockServiceTest {

    final SessionRepository sessionRepo = mock(SessionRepository.class);
    final SessionService sessionService = mock(SessionService.class);
    final DisputeService disputes = mock(DisputeService.class);
    final PaymentClient payment = mock(PaymentClient.class);
    final NotificationService notifications = mock(NotificationService.class);
    final AccountLockService service = new AccountLockService(sessionRepo, sessionService, disputes, payment, notifications,
            mock(AuditClient.class));
    final UUID mentorId = UUID.randomUUID();

    MentoringSession session(MentoringSession.Status status, int daysFromNow, String cancelReason) {
        MentoringSession s = new MentoringSession();
        ReflectionTestUtils.setField(s, "id", UUID.randomUUID());
        s.setMentorId(mentorId);
        s.setScheduledAt(OffsetDateTime.now().plusDays(daysFromNow));
        s.setDurationMinutes(60);
        s.setStatus(status);
        s.setCancelReason(cancelReason);
        return s;
    }

    @Test
    void lockingMentorCancelsUpcomingAndHoldsPendingEarningsOfPastSessions() {
        MentoringSession upcoming = session(MentoringSession.Status.CONFIRMED, 3, null);
        MentoringSession completed = session(MentoringSession.Status.COMPLETED, -1, null);
        MentoringSession lateCancelled = session(MentoringSession.Status.CANCELLED, 0, "Ban viec");
        MentoringSession cancelledByLock = session(MentoringSession.Status.CANCELLED, 3, AccountLockService.CANCEL_REASON);
        when(sessionRepo.findUpcomingHoldingByUser(eq(mentorId), any())).thenReturn(List.of(upcoming));
        when(payment.pendingEarningSessions(mentorId))
                .thenReturn(List.of(completed.getId(), lateCancelled.getId(), cancelledByLock.getId()));
        for (MentoringSession s : List.of(completed, lateCancelled, cancelledByLock)) {
            when(sessionRepo.findById(s.getId())).thenReturn(Optional.of(s));
        }
        when(disputes.openForLockedMentor(any(), any())).thenReturn(Optional.of(mock(Dispute.class)));

        AccountLockService.Result r = service.onLockChanged(mentorId, true, UUID.randomUUID(), "Vi pham chinh sach nhieu lan");

        verify(sessionService).cancelWithPolicy(upcoming, CancellationPolicy.Actor.SYSTEM, AccountLockService.CANCEL_REASON);
        verify(disputes).openForLockedMentor(completed, "Vi pham chinh sach nhieu lan");
        verify(disputes).openForLockedMentor(lateCancelled, "Vi pham chinh sach nhieu lan");
        verify(disputes, never()).openForLockedMentor(eq(cancelledByLock), any());
        verify(payment).freezeWallet(mentorId, true);
        verify(notifications).notifyUser(eq(mentorId), eq("ACCOUNT_LOCKED"), anyString(),
                contains("Vi pham chinh sach nhieu lan"), isNull());
        assertThat(r.cancelledSessions()).isEqualTo(1);
        assertThat(r.heldEarnings()).isEqualTo(2);
        assertThat(r.failed()).isZero();
    }

    @Test
    void paymentUnavailableCountsAsFailedButStillFreezes() {
        when(sessionRepo.findUpcomingHoldingByUser(eq(mentorId), any())).thenReturn(List.of());
        when(payment.pendingEarningSessions(mentorId)).thenThrow(new org.springframework.web.client.ResourceAccessException("down"));

        AccountLockService.Result r = service.onLockChanged(mentorId, true, null, "Vi pham chinh sach nhieu lan");

        assertThat(r.failed()).isEqualTo(1);
        verify(payment).freezeWallet(mentorId, true);
    }

    @Test
    void unlockingOnlyUnfreezesAndNotifies() {
        AccountLockService.Result r = service.onLockChanged(mentorId, false, UUID.randomUUID(), null);

        verifyNoInteractions(sessionService, disputes);
        verify(payment, never()).pendingEarningSessions(any());
        verify(payment).freezeWallet(mentorId, false);
        verify(notifications).notifyUser(eq(mentorId), eq("ACCOUNT_UNLOCKED"), anyString(), anyString(), eq("/wallet"));
        assertThat(r.locked()).isFalse();
    }
}
