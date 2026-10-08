package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.MentoringDtos.DecisionInput;
import com.mmp.mentoring.dto.MentoringDtos.IntroSessionInput;
import com.mmp.mentoring.entity.MentoringRequest;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.MentoringRequestRepository;
import com.mmp.mentoring.repository.SessionRepository;
import com.mmp.mentoring.security.AuthUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.mmp.mentoring.service.TestSupport.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/** Buổi làm quen: đặt buổi miễn phí, rồi mỗi bên chọn tiếp tục hay dừng. */
class IntroServiceTest {

    private final UUID menteeId = UUID.randomUUID();
    private final UUID mentorId = UUID.randomUUID();
    private final AuthUser mentee = user(menteeId, "MENTEE");
    private final AuthUser mentor = user(mentorId, "MENTOR");

    private MentoringRequestRepository requestRepo;
    private SessionRepository sessionRepo;
    private ProfileClient profileClient;
    private NotificationService notifications;
    private MentoringRequestService requestService;
    private IntroService service;
    private MentoringRequest request;

    @BeforeEach
    void setUp() {
        requestRepo = mock(MentoringRequestRepository.class);
        sessionRepo = mock(SessionRepository.class);
        profileClient = mock(ProfileClient.class);
        notifications = mock(NotificationService.class);
        requestService = mock(MentoringRequestService.class);
        when(profileClient.findMentor(mentorId)).thenReturn(Optional.of(mentor(mentorId, BigDecimal.valueOf(200_000), 3)));
        when(sessionRepo.save(any(MentoringSession.class))).thenAnswer(inv -> inv.getArgument(0));
        RequestViewMapper mapper = new RequestViewMapper(sessionRepo, 15);
        service = new IntroService(requestRepo, sessionRepo, profileClient, notifications, requestService,
                validator(sessionRepo), mapper, tx(), 15);
        request = request(menteeId, mentorId, MentoringRequest.Status.INTRO);
        when(requestRepo.findById(request.getId())).thenReturn(Optional.of(request));
    }

    private MentoringSession finishedIntro() {
        MentoringSession intro = session(menteeId, mentorId, MentoringSession.Status.CONFIRMED, OffsetDateTime.now().minusMinutes(30));
        intro.setType(MentoringSession.Type.INTRO);
        intro.setDurationMinutes(15);
        intro.setPrice(BigDecimal.ZERO);
        when(sessionRepo.findActiveIntro(request.getId())).thenReturn(List.of(intro));
        return intro;
    }

    // ---------------- đặt buổi làm quen ----------------

    @Test
    void bookingCreatesAFreeConfirmedFifteenMinuteIntroSession() {
        OffsetDateTime start = at(3, 10);

        service.bookIntro(mentee, request.getId(), new IntroSessionInput(start));

        ArgumentCaptor<MentoringSession> saved = ArgumentCaptor.forClass(MentoringSession.class);
        verify(sessionRepo).save(saved.capture());
        MentoringSession s = saved.getValue();
        assertThat(s.getType()).isEqualTo(MentoringSession.Type.INTRO);
        assertThat(s.getStatus()).isEqualTo(MentoringSession.Status.CONFIRMED);
        assertThat(s.getPrice()).isEqualByComparingTo("0");
        assertThat(s.getDurationMinutes()).isEqualTo(15);
        assertThat(s.getRequestId()).isEqualTo(request.getId());
        verify(notifications).notifyUser(eq(mentorId), eq("INTRO_BOOKED"), anyString(), anyString(), anyString());
    }

    @Test
    void anIntroCanOnlyBeBookedWhileTheRequestIsInTheIntroStage() {
        request.setStatus(MentoringRequest.Status.PENDING);

        assertThatThrownBy(() -> service.bookIntro(mentee, request.getId(), new IntroSessionInput(at(3, 10))))
                .isInstanceOf(ApiException.class).hasMessageContaining("làm quen");
        verify(sessionRepo, never()).save(any());
    }

    @Test
    void onlyOneActiveIntroPerRequest() {
        finishedIntro();

        assertThatThrownBy(() -> service.bookIntro(mentee, request.getId(), new IntroSessionInput(at(3, 10))))
                .isInstanceOf(ApiException.class).hasMessageContaining("đã có buổi làm quen");
    }

    @Test
    void theIntroMustFitTheMentorAvailabilityAndTheLeadTime() {
        assertThatThrownBy(() -> service.bookIntro(mentee, request.getId(), new IntroSessionInput(at(3, 23))))
                .isInstanceOf(ApiException.class).hasMessageContaining("không rảnh");
        assertThatThrownBy(() -> service.bookIntro(mentee, request.getId(), new IntroSessionInput(OffsetDateTime.now().plusMinutes(10))))
                .isInstanceOf(ApiException.class).hasMessageContaining("trước giờ bắt đầu");
    }

    @Test
    void onlyTheMenteeOfTheRequestCanBookTheIntro() {
        assertThatThrownBy(() -> service.bookIntro(user(UUID.randomUUID(), "MENTEE"), request.getId(), new IntroSessionInput(at(3, 10))))
                .isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> service.bookIntro(mentor, request.getId(), new IntroSessionInput(at(3, 10))))
                .isInstanceOf(ApiException.class);
    }

    // ---------------- quyết định sau buổi làm quen ----------------

    @Test
    void bothSidesContinuingMakesTheRelationshipOfficialAndTakesTheMentorCapacity() {
        finishedIntro();

        service.decide(mentee, request.getId(), new DecisionInput("CONTINUE"));
        assertThat(request.getStatus()).as("mới một bên đồng ý").isEqualTo(MentoringRequest.Status.INTRO);
        verify(notifications).notifyUser(eq(mentorId), eq("INTRO_DECISION"), anyString(), anyString(), anyString());

        service.decide(mentor, request.getId(), new DecisionInput("CONTINUE"));
        assertThat(request.getStatus()).isEqualTo(MentoringRequest.Status.ACCEPTED);
        verify(requestService).ensureCapacity(mentorId);
        verify(requestService).syncActiveMentees(mentorId);
        verify(notifications).notifyUser(eq(menteeId), eq("REQUEST_ACCEPTED"), anyString(), anyString(), anyString());
    }

    @Test
    void theMentorDecliningEndsTheRequestAsRejected() {
        finishedIntro();

        service.decide(mentor, request.getId(), new DecisionInput("DECLINE"));

        assertThat(request.getStatus()).isEqualTo(MentoringRequest.Status.REJECTED);
        assertThat(request.getMentorDecision()).isEqualTo(MentoringRequest.Decision.DECLINE);
        verify(notifications).notifyUser(eq(menteeId), eq("INTRO_DECLINED"), anyString(), anyString(), anyString());
    }

    @Test
    void theMenteeDecliningEndsTheRequestAsCancelled() {
        finishedIntro();

        service.decide(mentee, request.getId(), new DecisionInput("DECLINE"));

        assertThat(request.getStatus()).isEqualTo(MentoringRequest.Status.CANCELLED);
        verify(requestService, never()).ensureCapacity(any());
    }

    @Test
    void aSideThatAlreadyContinuedCanStillChangeItsMindBeforeTheOtherDecides() {
        finishedIntro();
        service.decide(mentee, request.getId(), new DecisionInput("CONTINUE"));

        service.decide(mentee, request.getId(), new DecisionInput("DECLINE"));

        assertThat(request.getStatus()).isEqualTo(MentoringRequest.Status.CANCELLED);
    }

    @Test
    void decisionsAreRejectedUntilTheIntroHasFinished() {
        MentoringSession upcoming = session(menteeId, mentorId, MentoringSession.Status.CONFIRMED, OffsetDateTime.now().plusDays(1));
        upcoming.setType(MentoringSession.Type.INTRO);
        when(sessionRepo.findActiveIntro(request.getId())).thenReturn(List.of(upcoming));

        assertThatThrownBy(() -> service.decide(mentee, request.getId(), new DecisionInput("CONTINUE")))
                .isInstanceOf(ApiException.class).hasMessageContaining("kết thúc");
        assertThat(request.getMenteeDecision()).isNull();
    }

    @Test
    void decisionsAreRejectedWhenNoIntroWasBooked() {
        assertThatThrownBy(() -> service.decide(mentee, request.getId(), new DecisionInput("CONTINUE")))
                .isInstanceOf(ApiException.class).hasMessageContaining("Chưa có buổi làm quen");
    }

    @Test
    void ifTheMentorBecameFullTheRelationshipIsNotConfirmed() {
        finishedIntro();
        doThrow(ApiException.conflict("CAPACITY_FULL", "đầy")).when(requestService).ensureCapacity(mentorId);
        service.decide(mentee, request.getId(), new DecisionInput("CONTINUE"));

        assertThatThrownBy(() -> service.decide(mentor, request.getId(), new DecisionInput("CONTINUE")))
                .isInstanceOf(ApiException.class).hasMessageContaining("đầy");
        assertThat(request.getStatus()).isEqualTo(MentoringRequest.Status.INTRO);
    }

    @Test
    void outsidersCannotDecide() {
        finishedIntro();

        assertThatThrownBy(() -> service.decide(user(UUID.randomUUID(), "MENTEE"), request.getId(), new DecisionInput("CONTINUE")))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void decisionsOnlyApplyToRequestsInTheIntroStage() {
        request.setStatus(MentoringRequest.Status.ACCEPTED);

        assertThatThrownBy(() -> service.decide(mentee, request.getId(), new DecisionInput("CONTINUE")))
                .isInstanceOf(ApiException.class);
    }
}
