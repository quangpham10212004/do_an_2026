package com.mmp.mentoring.service;

import com.mmp.mentoring.client.AuditClient;
import com.mmp.mentoring.dto.MentoringDtos.OpenDisputeInput;
import com.mmp.mentoring.dto.MentoringDtos.ResolveDisputeInput;
import com.mmp.mentoring.entity.Dispute;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.security.AuthUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** US-32 — mở tranh chấp, giữ tiền, kết luận và tác động tới tiền qua outbox. */
class DisputeServiceTest {

    private TestFixtures f;
    private MentorSuspensionService suspension;
    private AuditClient audit;
    private DisputeService service;
    private MentoringSession session;
    private final List<Dispute> disputes = new ArrayList<>();
    private final UUID sessionId = UUID.randomUUID();
    private final UUID menteeId = UUID.randomUUID();
    private final UUID mentorId = UUID.randomUUID();
    private final AuthUser mentee = new AuthUser(menteeId, "e@test", "MENTEE");
    private final AuthUser admin = new AuthUser(UUID.randomUUID(), "a@test", "ADMIN");
    private final OpenDisputeInput input = new OpenDisputeInput(Dispute.Type.QUALITY,
            "Mentor vao muon 30 phut va ket thuc som.", List.of("https://drive.google.com/x"));

    @BeforeEach
    void setUp() {
        f = new TestFixtures();
        suspension = mock(MentorSuspensionService.class);
        audit = mock(AuditClient.class);
        service = new DisputeService(f.disputeRepo, f.sessionRepo, f.outbox, f.notifications, f.profileClient, suspension, audit,
                f.tx, Duration.ofDays(7), Duration.ofHours(48), "Asia/Ho_Chi_Minh");
        session = new MentoringSession();
        ReflectionTestUtils.setField(session, "id", sessionId);
        session.setMenteeId(menteeId);
        session.setMentorId(mentorId);
        session.setDurationMinutes(60);
        session.setPrice(new BigDecimal("300000"));
        session.setStatus(MentoringSession.Status.COMPLETED);
        session.setScheduledAt(OffsetDateTime.now().minusDays(1));
        when(f.sessionRepo.findForUpdate(sessionId)).thenReturn(Optional.of(session));
        when(f.sessionRepo.findById(sessionId)).thenReturn(Optional.of(session));
        when(f.disputeRepo.saveAndFlush(any())).thenAnswer(inv -> {
            Dispute d = inv.getArgument(0);
            ReflectionTestUtils.setField(d, "id", UUID.randomUUID());
            disputes.add(d);
            return d;
        });
        when(f.disputeRepo.existsBySessionIdAndStatusIn(any(), any())).thenAnswer(inv -> disputes.stream()
                .anyMatch(d -> d.getSessionId().equals(inv.getArgument(0)) && d.isOpen()));
        when(f.disputeRepo.findForUpdate(any())).thenAnswer(inv -> disputes.stream()
                .filter(d -> d.getId().equals(inv.getArgument(0))).findFirst());
    }

    private static String code(Runnable r) {
        try {
            r.run();
        } catch (ApiException e) {
            return e.getCode();
        }
        return null;
    }

    private Dispute opened() {
        service.open(mentee, sessionId, input);
        return disputes.get(disputes.size() - 1);
    }

    @Test
    void participantOpensDisputeAndPaymentIsHeld() {
        var view = service.open(mentee, sessionId, input);
        assertThat(view.status()).isEqualTo("OPEN");
        assertThat(view.openedByRole()).isEqualTo("MENTEE");
        assertThat(view.firstResponseDueAt()).isEqualTo(view.createdAt().plusHours(48));
        assertThat(view.evidenceLinks()).containsExactly("https://drive.google.com/x");
        verify(f.outbox).enqueueHold(sessionId, "DISPUTE_OPENED");
        verify(f.outbox).flushSession(sessionId);
        verify(f.notifications).notifyUser(eq(menteeId), eq("DISPUTE_OPENED"), any(), any(), any());
        verify(f.notifications).notifyUser(eq(mentorId), eq("DISPUTE_OPENED"), any(), any(), any());
        verify(f.notifications).notifyRole(eq("ADMIN"), eq("DISPUTE_OPENED"), any(), any(), any());
    }

    @Test
    void oneOpenDisputePerSession() {
        opened();
        assertThat(code(() -> service.open(mentee, sessionId, input))).isEqualTo("DISPUTE_ALREADY_OPEN");
    }

    @Test
    void cannotOpenAfterSevenDaysOrOnUpcomingSessionOrAsStranger() {
        session.setScheduledAt(OffsetDateTime.now().minusDays(8));
        assertThat(code(() -> service.open(mentee, sessionId, input))).isEqualTo("DISPUTE_WINDOW_CLOSED");
        session.setScheduledAt(OffsetDateTime.now().plusDays(1));
        session.setStatus(MentoringSession.Status.CONFIRMED);
        assertThat(code(() -> service.open(mentee, sessionId, input))).isEqualTo("DISPUTE_NOT_ALLOWED");
        AuthUser stranger = new AuthUser(UUID.randomUUID(), "x@test", "MENTEE");
        assertThat(code(() -> service.open(stranger, sessionId, input))).isEqualTo("FORBIDDEN");
        verify(f.outbox, never()).enqueueHold(any(), any());
    }

    @Test
    void freeSessionDisputeHasNoPaymentHold() {
        session.setPrice(BigDecimal.ZERO);
        service.open(mentee, sessionId, input);
        verify(f.outbox, never()).enqueueHold(any(), any());
    }

    @Test
    void automaticDisputeIsIdempotent() {
        session.setStatus(MentoringSession.Status.DISPUTED);
        session.answerAsMentee(MentoringSession.Attendance.HELD, OffsetDateTime.now());
        session.answerAsMentor(MentoringSession.Attendance.MENTEE_NO_SHOW, OffsetDateTime.now());
        assertThat(service.openAutomatic(session)).isPresent();
        assertThat(service.openAutomatic(session)).isEmpty();
        assertThat(disputes).hasSize(1);
        assertThat(disputes.get(0).getType()).isEqualTo(Dispute.Type.NO_SHOW);
        assertThat(disputes.get(0).getOpenedByRole()).isEqualTo(Dispute.OpenedByRole.SYSTEM);
    }

    @Test
    void startReviewSetsFirstResponseOnce() {
        Dispute d = opened();
        service.startReview(admin, d.getId());
        assertThat(d.getStatus()).isEqualTo(Dispute.Status.IN_REVIEW);
        assertThat(d.getFirstResponseAt()).isNotNull();
        assertThat(code(() -> service.startReview(admin, d.getId()))).isEqualTo("DISPUTE_NOT_OPEN");
        verify(audit).record(eq(admin.userId()), eq("ADMIN"), eq("DISPUTE_REVIEW_STARTED"), eq("DISPUTE"), any(), any(), any());
    }

    @Test
    void partialRefundReleasesHoldRefundsShareAndReleasesRemainingEarning() {
        Dispute d = opened();
        var view = service.resolve(admin, d.getId(), new ResolveDisputeInput(Dispute.Outcome.PARTIAL_REFUND, 50, "Mentor vao muon"));
        assertThat(view.status()).isEqualTo("RESOLVED");
        assertThat(view.refundPercent()).isEqualTo(50);
        assertThat(session.getRefundPercent()).isEqualTo(50);
        InOrder order = inOrder(f.outbox);
        order.verify(f.outbox).enqueueRelease(sessionId);
        order.verify(f.outbox).enqueueRefund(sessionId, 50, "DISPUTE_PARTIAL_REFUND");
        order.verify(f.outbox).enqueueFinalState(eq(sessionId), eq("DISPUTE_RESOLVED"), any(), eq(true));
        verify(f.notifications).notifyUser(eq(menteeId), eq("DISPUTE_RESOLVED"), any(), any(), any());
        verify(f.notifications).notifyUser(eq(mentorId), eq("DISPUTE_RESOLVED"), any(), any(), any());
        verify(audit).record(eq(admin.userId()), eq("ADMIN"), eq("DISPUTE_RESOLVED"), eq("DISPUTE"), any(), any(), any());
    }

    @Test
    void noRefundOnDisputedSessionCompletesItAndReleasesEarning() {
        session.setStatus(MentoringSession.Status.DISPUTED);
        Dispute d = new Dispute(sessionId, null, Dispute.OpenedByRole.SYSTEM, Dispute.Type.NO_SHOW, "Hai ben xac nhan khac nhau.", List.of());
        ReflectionTestUtils.setField(d, "id", UUID.randomUUID());
        disputes.add(d);
        service.resolve(admin, d.getId(), new ResolveDisputeInput(Dispute.Outcome.NO_REFUND, null, "Phien da dien ra"));
        assertThat(session.getStatus()).isEqualTo(MentoringSession.Status.COMPLETED);
        verify(f.outbox).enqueueRelease(sessionId);
        verify(f.outbox, never()).enqueueRefund(any(), anyInt(), any());
        verify(f.outbox).enqueueFinalState(eq(sessionId), eq("DISPUTE_RESOLVED"), any(), eq(true));
    }

    @Test
    void fullRefundRefundsAllAndReleasesNothing() {
        Dispute d = opened();
        service.resolve(admin, d.getId(), new ResolveDisputeInput(Dispute.Outcome.FULL_REFUND, null, "Mentor vang mat"));
        verify(f.outbox).enqueueRefund(sessionId, 100, "DISPUTE_FULL_REFUND");
        verify(f.outbox, never()).enqueueFinalState(any(), any(), any(), anyBoolean());
        assertThat(session.getStatus()).isEqualTo(MentoringSession.Status.COMPLETED);
    }

    @Test
    void suspendRefundsAndSuspendsMentor() {
        Dispute d = opened();
        service.resolve(admin, d.getId(), new ResolveDisputeInput(Dispute.Outcome.SUSPEND, null, "Hanh vi khong phu hop"));
        verify(f.outbox).enqueueRefund(sessionId, 100, "DISPUTE_SUSPEND");
        verify(f.profileClient).updateMentorStatus(mentorId, "SUSPENDED", "DISPUTE");
        verify(suspension).suspend(mentorId, "DISPUTE", admin.userId());
        verify(audit).record(eq(admin.userId()), eq("ADMIN"), eq("MENTOR_SUSPENDED"), eq("MENTOR"), eq(mentorId.toString()), any(), any());
    }

    @Test
    void warningNotifiesMentor() {
        Dispute d = opened();
        service.resolve(admin, d.getId(), new ResolveDisputeInput(Dispute.Outcome.WARNING, null, "Nhac nho dung gio"));
        verify(f.notifications).notifyUser(eq(mentorId), eq("MENTOR_WARNING"), any(), any(), any());
        verify(f.outbox, never()).enqueueRefund(any(), anyInt(), any());
    }

    @Test
    void resolutionValidation() {
        Dispute d = opened();
        assertThat(code(() -> service.resolve(admin, d.getId(), new ResolveDisputeInput(Dispute.Outcome.PARTIAL_REFUND, null, "x"))))
                .isEqualTo("INVALID_REFUND_PERCENT");
        assertThat(code(() -> service.resolve(admin, d.getId(), new ResolveDisputeInput(Dispute.Outcome.NO_REFUND, 20, "x"))))
                .isEqualTo("INVALID_REFUND_PERCENT");
        assertThat(code(() -> service.resolve(admin, d.getId(), new ResolveDisputeInput(Dispute.Outcome.NO_REFUND, null, "  "))))
                .isEqualTo("NOTE_REQUIRED");
        service.resolve(admin, d.getId(), new ResolveDisputeInput(Dispute.Outcome.NO_REFUND, null, "ok"));
        assertThat(code(() -> service.resolve(admin, d.getId(), new ResolveDisputeInput(Dispute.Outcome.NO_REFUND, null, "ok"))))
                .isEqualTo("DISPUTE_ALREADY_RESOLVED");
    }
}
