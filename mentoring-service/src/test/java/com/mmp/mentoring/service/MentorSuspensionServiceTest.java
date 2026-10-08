package com.mmp.mentoring.service;

import com.mmp.mentoring.client.AuditClient;
import com.mmp.mentoring.controller.InternalMentorController;
import com.mmp.mentoring.dto.MentoringDtos.SuspendMentorInput;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.exception.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** US-27 — khoá mentor: huỷ (SYSTEM, hoàn 100%) mọi phiên sắp tới, idempotent. */
class MentorSuspensionServiceTest {

    private final TestFixtures f = new TestFixtures();
    private final SessionService sessions = mock(SessionService.class);
    private final AuditClient audit = mock(AuditClient.class);
    private final UUID mentorId = UUID.randomUUID();
    private final UUID adminId = UUID.randomUUID();
    private MentorSuspensionService service;

    @BeforeEach
    void setUp() {
        service = new MentorSuspensionService(f.sessionRepo, sessions, audit);
    }

    private MentoringSession upcoming(MentoringSession.Status status) {
        MentoringSession s = new MentoringSession();
        ReflectionTestUtils.setField(s, "id", UUID.randomUUID());
        s.setMentorId(mentorId);
        s.setMenteeId(UUID.randomUUID());
        s.setScheduledAt(OffsetDateTime.now().plusDays(1));
        s.setPrice(new BigDecimal("200000"));
        s.setStatus(status);
        return s;
    }

    @Test
    void cancelsEveryUpcomingSessionAsSystem() {
        MentoringSession a = upcoming(MentoringSession.Status.CONFIRMED);
        MentoringSession b = upcoming(MentoringSession.Status.PENDING);
        when(f.sessionRepo.findUpcomingHoldingByMentor(eq(mentorId), any())).thenReturn(List.of(a, b));
        assertThat(service.suspend(mentorId, "Vi pham", adminId)).isEqualTo(2);
        verify(sessions).cancelWithPolicy(eq(a), eq(CancellationPolicy.Actor.SYSTEM), contains("tạm khoá"));
        verify(sessions).cancelWithPolicy(eq(b), eq(CancellationPolicy.Actor.SYSTEM), contains("tạm khoá"));
        verify(audit).record(eq(adminId), eq("ADMIN"), eq("MENTOR_SESSIONS_CANCELLED"), eq("MENTOR"), eq(mentorId.toString()), any(), any());
    }

    @Test
    void secondCallIsNoOp() {
        when(f.sessionRepo.findUpcomingHoldingByMentor(eq(mentorId), any())).thenReturn(List.of());
        assertThat(service.suspend(mentorId, null, null)).isZero();
        verifyNoInteractions(sessions, audit);
    }

    @Test
    void sessionCancelledConcurrentlyIsSkipped() {
        MentoringSession a = upcoming(MentoringSession.Status.CONFIRMED);
        when(f.sessionRepo.findUpcomingHoldingByMentor(eq(mentorId), any())).thenReturn(List.of(a));
        doThrow(ApiException.conflict("SESSION_NOT_CANCELLABLE", "x")).when(sessions).cancelWithPolicy(any(), any(), any());
        assertThat(service.suspend(mentorId, null, null)).isZero();
    }

    @Test
    void refundFailureCancelsOthersThenReports502ForRetry() {
        MentoringSession a = upcoming(MentoringSession.Status.CONFIRMED);
        MentoringSession b = upcoming(MentoringSession.Status.CONFIRMED);
        when(f.sessionRepo.findUpcomingHoldingByMentor(eq(mentorId), any())).thenReturn(List.of(a, b));
        doThrow(new ApiException(HttpStatus.BAD_GATEWAY, "REFUND_FAILED", "x")).when(sessions).cancelWithPolicy(eq(a), any(), any());
        assertThatThrownBy(() -> service.suspend(mentorId, null, null))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("SUSPEND_INCOMPLETE");
        verify(sessions).cancelWithPolicy(eq(b), any(), any());
    }

    @Test
    void controllerReturnsCount() {
        when(f.sessionRepo.findUpcomingHoldingByMentor(eq(mentorId), any())).thenReturn(List.of(upcoming(MentoringSession.Status.CONFIRMED)));
        var res = new InternalMentorController(service).suspend(mentorId, new SuspendMentorInput("ADMIN_ACTION", adminId));
        assertThat(res.cancelledSessions()).isEqualTo(1);
        assertThat(new InternalMentorController(service).suspend(mentorId, null).mentorId()).isEqualTo(mentorId);
    }
}
