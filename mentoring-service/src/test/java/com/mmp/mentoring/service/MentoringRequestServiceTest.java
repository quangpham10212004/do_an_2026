package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.MentoringDtos.CreateRequestInput;
import com.mmp.mentoring.dto.MentoringDtos.RespondRequestInput;
import com.mmp.mentoring.entity.MentoringRequest;
import com.mmp.mentoring.entity.SessionType;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.MentoringRequestRepository;
import com.mmp.mentoring.security.AuthUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class MentoringRequestServiceTest {

    private static final String GOAL = "Trở thành backend developer Java trong 6 tháng, nắm vững Spring Boot và REST API.";

    private final MentoringRequestRepository repo = mock(MentoringRequestRepository.class);
    private final ProfileClient profileClient = mock(ProfileClient.class);
    private final NotificationService notifications = mock(NotificationService.class);
    private final TransactionTemplate tx = mock(TransactionTemplate.class);
    private final com.mmp.mentoring.repository.SessionRepository sessionRepo = mock(com.mmp.mentoring.repository.SessionRepository.class);
    private final SessionService sessionService = mock(SessionService.class);
    private final MentoringRequestService service = new MentoringRequestService(repo, profileClient, notifications, tx, 3,
            sessionRepo, sessionService, 2);

    private final UUID menteeId = UUID.randomUUID();
    private final UUID mentorId = UUID.randomUUID();
    private final AuthUser mentee = new AuthUser(menteeId, "e@test", "MENTEE");
    private final AuthUser mentor = new AuthUser(mentorId, "m@test", "MENTOR");

    @BeforeEach
    void setUp() {
        when(tx.execute(any())).thenAnswer(inv -> inv.<TransactionCallback<?>>getArgument(0).doInTransaction(null));
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(profileClient.displayNames(any())).thenReturn(Map.of());
        when(profileClient.findMentor(mentorId)).thenReturn(Optional.of(new ProfileClient.MentorInfo(mentorId, "Mentor", List.of("Java"),
                "backend", "bio", 5, new BigDecimal("200000"), 5, 0, true, 0, 0, "APPROVED", List.of(),
                "ACCEPTING", null, null, null, null, null, List.of())));
    }

    private CreateRequestInput input(String goal, Integer months) {
        return new CreateRequestInput(mentorId, goal, SessionType.CAREER_ADVICE, MentoringRequest.Frequency.WEEKLY, months, " Xin chào ");
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
    void relationshipCountsOnlyPendingOrAcceptedRequests() {
        // Quyền mentor tải CV mentee (ai-service) dựa trên kết quả này — chỉ yêu cầu đang mở mới tính.
        assertThat(MentoringRequestService.OPEN_STATUSES)
                .containsExactlyInAnyOrder(MentoringRequest.Status.PENDING, MentoringRequest.Status.INTRO, MentoringRequest.Status.ACCEPTED);
        UUID mentor = UUID.randomUUID();
        UUID mentee = UUID.randomUUID();
        when(repo.existsByMenteeIdAndMentorIdAndStatusIn(mentee, mentor, MentoringRequestService.OPEN_STATUSES))
                .thenReturn(true);

        var view = service.relationship(mentor, mentee);

        assertThat(view.related()).isTrue();
        assertThat(view.mentorId()).isEqualTo(mentor);
        assertThat(view.menteeId()).isEqualTo(mentee);
        assertThat(service.relationship(UUID.randomUUID(), mentee).related()).isFalse();
        verify(repo).existsByMenteeIdAndMentorIdAndStatusIn(eq(mentee), eq(mentor), eq(List.of(
                MentoringRequest.Status.PENDING, MentoringRequest.Status.INTRO, MentoringRequest.Status.ACCEPTED)));
    }

    @Test
    void createStoresFormFields() {
        var view = service.create(mentee, input("  " + GOAL + "  ", 3));

        assertThat(view.goal()).isEqualTo(GOAL);
        assertThat(view.sessionType()).isEqualTo("CAREER_ADVICE");
        assertThat(view.frequency()).isEqualTo("WEEKLY");
        assertThat(view.expectedDurationMonths()).isEqualTo(3);
        assertThat(view.message()).isEqualTo("Xin chào");
        assertThat(view.status()).isEqualTo("PENDING");
        verify(repo).lockMenteeRequests(menteeId);
    }

    @Test
    void goalLengthAndDurationValidated() {
        assertThat(code(() -> service.create(mentee, input("quá ngắn", 3)))).isEqualTo("INVALID_GOAL");
        assertThat(code(() -> service.create(mentee, input("x".repeat(1001), 3)))).isEqualTo("INVALID_GOAL");
        assertThat(code(() -> service.create(mentee, input(GOAL, 2)))).isEqualTo("INVALID_EXPECTED_DURATION");
        verify(repo, never()).save(any());
    }

    @Test
    void fourthPendingRequestIsRejected() {
        when(repo.countByMenteeIdAndStatus(menteeId, MentoringRequest.Status.PENDING)).thenReturn(3L);

        assertThat(code(() -> service.create(mentee, input(GOAL, 1)))).isEqualTo("TOO_MANY_PENDING_REQUESTS");
        verify(repo, never()).save(any());
    }

    @Test
    void oneOpenRequestPerMentorStays() {
        when(repo.existsByMenteeIdAndMentorIdAndStatusIn(menteeId, mentorId, MentoringRequestService.OPEN_STATUSES)).thenReturn(true);

        assertThat(code(() -> service.create(mentee, input(GOAL, 1)))).isEqualTo("REQUEST_ALREADY_EXISTS");
    }

    @Test
    void rejectRequiresReasonAndStoresIt() {
        MentoringRequest r = new MentoringRequest(menteeId, mentorId, GOAL, SessionType.CODE_REVIEW, MentoringRequest.Frequency.ONE_OFF, 1, null);
        UUID id = UUID.randomUUID();
        ReflectionTestUtils.setField(r, "id", id);
        when(repo.findForUpdate(id)).thenReturn(Optional.of(r));

        assertThat(code(() -> service.respond(mentor, id, new RespondRequestInput("REJECT", null, "Bận")))).isEqualTo("REJECT_REASON_REQUIRED");
        var view = service.respond(mentor, id, new RespondRequestInput("REJECT", MentoringRequest.RejectReason.SCHEDULE, " Bận "));

        assertThat(view.status()).isEqualTo("REJECTED");
        assertThat(view.rejectReason()).isEqualTo("SCHEDULE");
        assertThat(view.responseNote()).isEqualTo("Bận");
        verify(notifications).notifyUser(eq(menteeId), eq("REQUEST_REJECTED"), anyString(),
                org.mockito.ArgumentMatchers.contains("Lịch không phù hợp"), anyString());
    }

    @Test
    void mentorSeesMenteeProfileSummaryForOpenRequests() {
        MentoringRequest r = new MentoringRequest(menteeId, mentorId, GOAL, SessionType.CODE_REVIEW, MentoringRequest.Frequency.ONE_OFF, 1, null);
        when(repo.findByMentorIdOrderByCreatedAtDesc(mentorId)).thenReturn(List.of(r));
        when(profileClient.menteeProfile(menteeId)).thenReturn(Optional.of(new ProfileClient.MenteeProfile(menteeId, "An",
                "Học backend", "backend", "BEGINNER", List.of("Java"))));

        var views = service.mine(mentor);

        assertThat(views.get(0).menteeProfile()).isNotNull();
        assertThat(views.get(0).menteeProfile().currentLevel()).isEqualTo("BEGINNER");
        assertThat(service.mine(mentee).isEmpty()).isTrue();
        verify(profileClient, times(1)).menteeProfile(menteeId);
    }

    // ---------- buổi làm quen ----------

    private MentoringRequest pendingRequest(UUID id) {
        MentoringRequest r = new MentoringRequest(menteeId, mentorId, GOAL, SessionType.CODE_REVIEW, MentoringRequest.Frequency.ONE_OFF, 1, null);
        ReflectionTestUtils.setField(r, "id", id);
        when(repo.findForUpdate(id)).thenReturn(Optional.of(r));
        return r;
    }

    @Test
    void introMovesRequestToIntroWithoutTouchingCapacity() {
        UUID id = UUID.randomUUID();
        MentoringRequest r = pendingRequest(id);
        when(repo.countByMentorIdAndStatus(mentorId, MentoringRequest.Status.INTRO)).thenReturn(0L);

        var view = service.respond(mentor, id, new RespondRequestInput("INTRO", null, " Hẹn trò chuyện nhé "));

        assertThat(view.status()).isEqualTo("INTRO");
        assertThat(r.getStatus()).isEqualTo(MentoringRequest.Status.INTRO);
        assertThat(view.responseNote()).isEqualTo("Hẹn trò chuyện nhé");
        verify(repo, never()).countActiveMentees(any());
        verify(notifications).notifyUser(eq(menteeId), eq("REQUEST_INTRO"), anyString(), anyString(), anyString());
    }

    @Test
    void introIsLimitedPerMentor() {
        UUID id = UUID.randomUUID();
        pendingRequest(id);
        when(repo.countByMentorIdAndStatus(mentorId, MentoringRequest.Status.INTRO)).thenReturn(2L);

        assertThat(code(() -> service.respond(mentor, id, new RespondRequestInput("INTRO", null, null)))).isEqualTo("INTRO_LIMIT");
    }

    @Test
    void cancellingAnIntroRequestCancelsUpcomingIntroSessions() {
        UUID id = UUID.randomUUID();
        MentoringRequest r = pendingRequest(id);
        r.setStatus(MentoringRequest.Status.INTRO);
        com.mmp.mentoring.entity.MentoringSession upcoming = new com.mmp.mentoring.entity.MentoringSession();
        upcoming.setMenteeId(menteeId);
        upcoming.setMentorId(mentorId);
        upcoming.setScheduledAt(java.time.OffsetDateTime.now().plusDays(1));
        when(sessionRepo.findByRequestIdAndKindAndStatusIn(eq(id), eq(com.mmp.mentoring.entity.MentoringSession.Kind.INTRO), any()))
                .thenReturn(List.of(upcoming));

        var view = service.cancel(mentee, id);

        assertThat(view.status()).isEqualTo("CANCELLED");
        verify(sessionService).cancelWithPolicy(eq(upcoming), eq(CancellationPolicy.Actor.MENTEE), anyString());
    }

    @Test
    void acceptedRequestsCannotBeCancelledByTheMentee() {
        UUID id = UUID.randomUUID();
        pendingRequest(id).setStatus(MentoringRequest.Status.ACCEPTED);
        assertThat(code(() -> service.cancel(mentee, id))).isEqualTo("REQUEST_NOT_PENDING");
    }
}
