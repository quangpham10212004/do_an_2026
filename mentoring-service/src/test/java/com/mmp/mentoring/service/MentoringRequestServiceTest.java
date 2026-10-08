package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.MentoringDtos.CreateRequestInput;
import com.mmp.mentoring.dto.MentoringDtos.RespondRequestInput;
import com.mmp.mentoring.entity.MentoringRequest;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.MentoringRequestRepository;
import com.mmp.mentoring.repository.SessionRepository;
import com.mmp.mentoring.security.AuthUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

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

/** Yêu cầu mentoring: mentor nhận thẳng, đồng ý làm quen trước, hoặc từ chối; kết thúc quan hệ đóng các gói. */
class MentoringRequestServiceTest {

    private final UUID menteeId = UUID.randomUUID();
    private final UUID mentorId = UUID.randomUUID();
    private final AuthUser mentee = user(menteeId, "MENTEE");
    private final AuthUser mentor = user(mentorId, "MENTOR");

    private MentoringRequestRepository requestRepo;
    private SessionRepository sessionRepo;
    private ProfileClient profileClient;
    private NotificationService notifications;
    private PackageService packageService;
    private MentoringRequestService service;
    private MentoringRequest request;

    @BeforeEach
    void setUp() {
        requestRepo = mock(MentoringRequestRepository.class);
        sessionRepo = mock(SessionRepository.class);
        profileClient = mock(ProfileClient.class);
        notifications = mock(NotificationService.class);
        packageService = mock(PackageService.class);
        when(profileClient.findMentor(mentorId)).thenReturn(Optional.of(mentor(mentorId, BigDecimal.valueOf(200_000), 2)));
        when(requestRepo.save(any(MentoringRequest.class))).thenAnswer(inv -> inv.getArgument(0));
        service = new MentoringRequestService(requestRepo, sessionRepo, profileClient, notifications, packageService,
                new RequestViewMapper(sessionRepo, 15), tx(), 2);
        request = request(menteeId, mentorId, MentoringRequest.Status.PENDING);
        when(requestRepo.findById(request.getId())).thenReturn(Optional.of(request));
    }

    @Test
    void acceptingDirectlyTakesACapacitySlot() {
        service.respond(mentor, request.getId(), new RespondRequestInput("ACCEPT", null));

        assertThat(request.getStatus()).isEqualTo(MentoringRequest.Status.ACCEPTED);
        verify(notifications).notifyUser(eq(menteeId), eq("REQUEST_ACCEPTED"), anyString(), anyString(), anyString());
    }

    @Test
    void acceptingFailsWhenTheMentorIsFull() {
        when(requestRepo.countActiveMentees(mentorId)).thenReturn(2L);

        assertThatThrownBy(() -> service.respond(mentor, request.getId(), new RespondRequestInput("ACCEPT", null)))
                .isInstanceOf(ApiException.class).hasMessageContaining("đủ số mentee");
        assertThat(request.getStatus()).isEqualTo(MentoringRequest.Status.PENDING);
    }

    @Test
    void agreeingToAnIntroDoesNotNeedFreeCapacity() {
        when(requestRepo.countActiveMentees(mentorId)).thenReturn(2L); // đã đầy chỗ chính thức

        service.respond(mentor, request.getId(), new RespondRequestInput("INTRO", null));

        assertThat(request.getStatus()).isEqualTo(MentoringRequest.Status.INTRO);
        verify(notifications).notifyUser(eq(menteeId), eq("REQUEST_INTRO"), anyString(), anyString(), anyString());
    }

    @Test
    void aMentorCannotHaveMoreOpenIntrosThanTheLimit() {
        when(requestRepo.countByMentorIdAndStatus(mentorId, MentoringRequest.Status.INTRO)).thenReturn(2L);

        assertThatThrownBy(() -> service.respond(mentor, request.getId(), new RespondRequestInput("INTRO", null)))
                .isInstanceOf(ApiException.class).hasMessageContaining("làm quen");
        assertThat(request.getStatus()).isEqualTo(MentoringRequest.Status.PENDING);
    }

    @Test
    void rejectingKeepsTheNoteForTheMentee() {
        service.respond(mentor, request.getId(), new RespondRequestInput("REJECT", "Chưa phù hợp"));

        assertThat(request.getStatus()).isEqualTo(MentoringRequest.Status.REJECTED);
        assertThat(request.getResponseNote()).isEqualTo("Chưa phù hợp");
    }

    @Test
    void onlyPendingRequestsCanBeAnswered() {
        request.setStatus(MentoringRequest.Status.INTRO);

        assertThatThrownBy(() -> service.respond(mentor, request.getId(), new RespondRequestInput("ACCEPT", null)))
                .isInstanceOf(ApiException.class).hasMessageContaining("đã được xử lý");
    }

    @Test
    void onlyTheAddressedMentorCanAnswer() {
        assertThatThrownBy(() -> service.respond(user(UUID.randomUUID(), "MENTOR"), request.getId(), new RespondRequestInput("ACCEPT", null)))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void aNewRequestIsBlockedWhileAnIntroIsInProgress() {
        when(requestRepo.existsByMenteeIdAndMentorIdAndStatusIn(eq(menteeId), eq(mentorId), any())).thenReturn(true);

        assertThatThrownBy(() -> service.create(mentee, new CreateRequestInput(mentorId, "hi")))
                .isInstanceOf(ApiException.class).hasMessageContaining("đã có yêu cầu");
    }

    @Test
    void cancellingARequestInTheIntroStageAlsoCancelsTheUpcomingIntroSession() {
        request.setStatus(MentoringRequest.Status.INTRO);
        MentoringSession intro = session(menteeId, mentorId, MentoringSession.Status.CONFIRMED, OffsetDateTime.now().plusDays(2));
        intro.setType(MentoringSession.Type.INTRO);
        MentoringSession regular = session(menteeId, mentorId, MentoringSession.Status.CONFIRMED, OffsetDateTime.now().plusDays(3));
        when(sessionRepo.findByRequestIdAndStatusIn(eq(request.getId()), any())).thenReturn(List.of(intro, regular));

        service.cancel(mentee, request.getId());

        assertThat(request.getStatus()).isEqualTo(MentoringRequest.Status.CANCELLED);
        assertThat(intro.getStatus()).isEqualTo(MentoringSession.Status.CANCELLED);
        assertThat(regular.getStatus()).as("chỉ buổi làm quen bị huỷ theo").isEqualTo(MentoringSession.Status.CONFIRMED);
    }

    @Test
    void aMenteeCannotCancelAnAcceptedRequest() {
        request.setStatus(MentoringRequest.Status.ACCEPTED);

        assertThatThrownBy(() -> service.cancel(mentee, request.getId())).isInstanceOf(ApiException.class);
    }

    @Test
    void endingTheRelationshipFreesTheSlotAndClosesPackages() {
        request.setStatus(MentoringRequest.Status.ACCEPTED);

        service.complete(mentee, request.getId());

        assertThat(request.getStatus()).isEqualTo(MentoringRequest.Status.COMPLETED);
        verify(packageService).endForRelationship(menteeId, mentorId);
        verify(profileClient).updateActiveMentees(eq(mentorId), anyLong());
    }
}
