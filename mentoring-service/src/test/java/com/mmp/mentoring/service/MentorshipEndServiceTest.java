package com.mmp.mentoring.service;

import com.mmp.mentoring.dto.MentoringDtos.EndRequestInput;
import com.mmp.mentoring.entity.MentoringRequest;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.entity.SessionType;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.security.AuthUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** US-31 — kết thúc mentoring, huỷ phiên sắp tới theo chính sách, job không hoạt động. */
class MentorshipEndServiceTest {

    private static final Duration D30 = Duration.ofDays(30);
    private static final Duration D7 = Duration.ofDays(7);

    private TestFixtures f;
    private SessionService sessions;
    private MentoringRequestService requests;
    private MentorshipEndService service;
    private MentoringRequest request;
    private final UUID requestId = UUID.randomUUID();
    private final UUID menteeId = UUID.randomUUID();
    private final UUID mentorId = UUID.randomUUID();
    private final AuthUser mentee = new AuthUser(menteeId, "e@test", "MENTEE");
    private final AuthUser mentor = new AuthUser(mentorId, "m@test", "MENTOR");

    @BeforeEach
    void setUp() {
        f = new TestFixtures();
        sessions = mock(SessionService.class);
        requests = mock(MentoringRequestService.class);
        service = new MentorshipEndService(f.requestRepo, f.sessionRepo, sessions, requests, f.profileClient, f.notifications, f.tx, D30, D7);
        request = new MentoringRequest(menteeId, mentorId, "goal", SessionType.CAREER_ADVICE, MentoringRequest.Frequency.WEEKLY, 3, null);
        ReflectionTestUtils.setField(request, "id", requestId);
        request.setStatus(MentoringRequest.Status.ACCEPTED);
        when(f.requestRepo.findById(requestId)).thenReturn(Optional.of(request));
        when(f.requestRepo.findForUpdate(requestId)).thenReturn(Optional.of(request));
    }

    private MentoringSession upcoming() {
        MentoringSession s = new MentoringSession();
        ReflectionTestUtils.setField(s, "id", UUID.randomUUID());
        s.setMenteeId(menteeId);
        s.setMentorId(mentorId);
        s.setScheduledAt(OffsetDateTime.now().plusDays(2));
        s.setPrice(new BigDecimal("200000"));
        s.setStatus(MentoringSession.Status.CONFIRMED);
        return s;
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
    void menteeEndsAndUpcomingSessionsAreCancelledAsMentee() {
        MentoringSession a = upcoming();
        MentoringSession b = upcoming();
        when(f.sessionRepo.findUpcomingHoldingByPair(eq(menteeId), eq(mentorId), any())).thenReturn(List.of(a, b));
        var view = service.end(mentee, requestId, new EndRequestInput(MentoringRequest.EndReason.GOAL_REACHED, "Cam on anh"));
        assertThat(view.status()).isEqualTo("ENDED");
        assertThat(view.endedBy()).isEqualTo("MENTEE");
        assertThat(view.endReason()).isEqualTo("GOAL_REACHED");
        assertThat(view.endNote()).isEqualTo("Cam on anh");
        assertThat(view.endedAt()).isNotNull();
        verify(sessions).cancelWithPolicy(a, CancellationPolicy.Actor.MENTEE, "Kết thúc mentoring");
        verify(sessions).cancelWithPolicy(b, CancellationPolicy.Actor.MENTEE, "Kết thúc mentoring");
        verify(requests).syncActiveMentees(mentorId);
        verify(f.notifications).notifyUser(eq(mentorId), eq("MENTORING_ENDED"), any(), any(), any());
        verify(f.notifications, never()).notifyUser(eq(menteeId), eq("MENTORING_ENDED"), any(), any(), any());
    }

    @Test
    void mentorEndingCancelsAsMentor() {
        MentoringSession a = upcoming();
        when(f.sessionRepo.findUpcomingHoldingByPair(any(), any(), any())).thenReturn(List.of(a));
        service.end(mentor, requestId, new EndRequestInput(MentoringRequest.EndReason.NOT_A_FIT, null));
        verify(sessions).cancelWithPolicy(a, CancellationPolicy.Actor.MENTOR, "Kết thúc mentoring");
        assertThat(request.getEndedBy()).isEqualTo("MENTOR");
    }

    @Test
    void refundFailureKeepsRelationshipAccepted() {
        MentoringSession a = upcoming();
        when(f.sessionRepo.findUpcomingHoldingByPair(any(), any(), any())).thenReturn(List.of(a));
        doThrow(new ApiException(org.springframework.http.HttpStatus.BAD_GATEWAY, "REFUND_FAILED", "x"))
                .when(sessions).cancelWithPolicy(any(), any(), any());
        assertThat(code(() -> service.end(mentee, requestId, new EndRequestInput(MentoringRequest.EndReason.OTHER, null))))
                .isEqualTo("REFUND_FAILED");
        assertThat(request.getStatus()).isEqualTo(MentoringRequest.Status.ACCEPTED);
    }

    @Test
    void onlyParticipantsEndOnlyAcceptedAndNotAsInactive() {
        AuthUser stranger = new AuthUser(UUID.randomUUID(), "x@test", "MENTEE");
        assertThat(code(() -> service.end(stranger, requestId, new EndRequestInput(MentoringRequest.EndReason.OTHER, null))))
                .isEqualTo("FORBIDDEN");
        assertThat(code(() -> service.end(mentee, requestId, new EndRequestInput(MentoringRequest.EndReason.INACTIVE, null))))
                .isEqualTo("INVALID_END_REASON");
        request.setStatus(MentoringRequest.Status.PENDING);
        assertThat(code(() -> service.end(mentee, requestId, new EndRequestInput(MentoringRequest.EndReason.OTHER, null))))
                .isEqualTo("REQUEST_NOT_ACTIVE");
    }

    @Test
    void legacyCompletedReadsAsEnded() {
        request.setStatus(MentoringRequest.Status.COMPLETED);
        assertThat(request.effectiveStatus()).isEqualTo(MentoringRequest.Status.ENDED);
        assertThat(MentoringRequestService.toView(request, java.util.Map.of(), java.util.Map.of()).status()).isEqualTo("ENDED");
    }

    // ---------- job không hoạt động ----------

    @Test
    void inactivityRules() {
        OffsetDateTime now = OffsetDateTime.now();
        assertThat(InactivityRules.decide(now.minusDays(29), null, now, D30, D7)).isEqualTo(InactivityRules.Action.NONE);
        assertThat(InactivityRules.decide(now.minusDays(30), null, now, D30, D7)).isEqualTo(InactivityRules.Action.WARN);
        assertThat(InactivityRules.decide(now.plusDays(3), null, now, D30, D7)).isEqualTo(InactivityRules.Action.NONE); // phiên sắp tới
        assertThat(InactivityRules.decide(now.minusDays(40), now.minusDays(6), now, D30, D7)).isEqualTo(InactivityRules.Action.NONE);
        assertThat(InactivityRules.decide(now.minusDays(40), now.minusDays(7), now, D30, D7)).isEqualTo(InactivityRules.Action.END);
        assertThat(InactivityRules.decide(now.minusDays(1), now.minusDays(8), now, D30, D7)).isEqualTo(InactivityRules.Action.CLEAR);
    }

    @Test
    void jobWarnsThenEndsAsSystemInactive() {
        OffsetDateTime now = OffsetDateTime.now();
        List<Object[]> rows = new ArrayList<>();
        rows.add(new Object[]{requestId.toString(), now.minusDays(31), null});
        when(f.requestRepo.findAcceptedActivity()).thenReturn(rows);
        assertThat(service.runInactivity(now)).containsExactly(1, 0);
        assertThat(request.getInactivityWarnedAt()).isEqualTo(now);
        verify(f.notifications).notifyUser(eq(menteeId), eq("MENTORING_INACTIVE"), eq("Bạn có muốn tiếp tục?"), any(), any());
        verify(f.notifications).notifyUser(eq(mentorId), eq("MENTORING_INACTIVE"), eq("Bạn có muốn tiếp tục?"), any(), any());

        rows.set(0, new Object[]{requestId.toString(), now.minusDays(38), java.sql.Timestamp.from(now.minusDays(7).toInstant())});
        assertThat(service.runInactivity(now)).containsExactly(0, 1);
        assertThat(request.getStatus()).isEqualTo(MentoringRequest.Status.ENDED);
        assertThat(request.getEndedBy()).isEqualTo("SYSTEM");
        assertThat(request.getEndReason()).isEqualTo(MentoringRequest.EndReason.INACTIVE);
        verify(requests).syncActiveMentees(mentorId);
    }

    @Test
    void newActivityAfterWarningClearsIt() {
        OffsetDateTime now = OffsetDateTime.now();
        List<Object[]> rows = new ArrayList<>();
        rows.add(new Object[]{requestId.toString(), now.minusDays(1), now.minusDays(3)});
        when(f.requestRepo.findAcceptedActivity()).thenReturn(rows);
        service.runInactivity(now);
        verify(f.requestRepo).clearInactivityWarning(requestId);
        assertThat(request.getStatus()).isEqualTo(MentoringRequest.Status.ACCEPTED);
    }
}
