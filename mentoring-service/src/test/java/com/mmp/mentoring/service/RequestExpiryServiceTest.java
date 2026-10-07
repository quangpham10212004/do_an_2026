package com.mmp.mentoring.service;

import com.mmp.mentoring.client.MatchingClient;
import com.mmp.mentoring.client.MatchingClient.SimilarMentor;
import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.entity.MentoringRequest;
import com.mmp.mentoring.entity.SessionType;
import com.mmp.mentoring.repository.MentoringRequestRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** US-15 — yêu cầu PENDING quá 72 giờ → EXPIRED, báo mentee kèm link /matching và gợi ý mentor (best-effort). */
class RequestExpiryServiceTest {

    private final MentoringRequestRepository repo = mock(MentoringRequestRepository.class);
    private final MatchingClient matching = mock(MatchingClient.class);
    private final ProfileClient profileClient = mock(ProfileClient.class);
    private final NotificationService notifications = mock(NotificationService.class);
    private final TransactionTemplate tx = mock(TransactionTemplate.class);
    private final RequestExpiryService service = new RequestExpiryService(repo, matching, profileClient, notifications, tx,
            Duration.ofHours(72));

    private final UUID id = UUID.randomUUID();
    private final UUID menteeId = UUID.randomUUID();
    private final UUID mentorId = UUID.randomUUID();
    private MentoringRequest request;

    @BeforeEach
    void setUp() {
        when(tx.execute(any())).thenAnswer(inv -> inv.<TransactionCallback<?>>getArgument(0).doInTransaction(null));
        request = new MentoringRequest(menteeId, mentorId, "x".repeat(60), SessionType.CAREER_ADVICE, MentoringRequest.Frequency.WEEKLY, 3, null);
        ReflectionTestUtils.setField(request, "id", id);
        ReflectionTestUtils.setField(request, "createdAt", OffsetDateTime.now().minusHours(73));
        when(repo.findPendingIdsCreatedBefore(any())).thenReturn(List.of(id));
        when(repo.findForUpdate(id)).thenReturn(Optional.of(request));
        when(profileClient.summary(mentorId)).thenReturn(Optional.of(new ProfileClient.ProfileSummary(mentorId, "Anh Mentor", "MENTOR", "backend")));
    }

    @Test
    void queriesRequestsOlderThan72Hours() {
        OffsetDateTime now = OffsetDateTime.parse("2026-10-07T10:00:00+07:00");
        when(repo.findPendingIdsCreatedBefore(any())).thenReturn(List.of());

        service.expire(now);

        verify(repo).findPendingIdsCreatedBefore(now.minusHours(72));
    }

    @Test
    void pendingOver72HoursExpiresAndMenteeGetsSuggestions() {
        when(matching.similarMentors(menteeId, mentorId, 3)).thenReturn(List.of(
                new SimilarMentor(UUID.randomUUID(), "Mentor A", 0.9), new SimilarMentor(UUID.randomUUID(), "Mentor B", 0.8)));

        assertThat(service.expire(OffsetDateTime.now())).isEqualTo(1);

        assertThat(request.getStatus()).isEqualTo(MentoringRequest.Status.EXPIRED);
        assertThat(request.getExpiredAt()).isNotNull();
        ArgumentCaptor<String> msg = ArgumentCaptor.forClass(String.class);
        verify(notifications).notifyUser(eq(menteeId), eq("REQUEST_EXPIRED"), anyString(), msg.capture(), eq("/matching"));
        assertThat(msg.getValue()).contains("Anh Mentor").contains("72 giờ").contains("Mentor A, Mentor B");
        verify(notifications).notifyUser(eq(mentorId), eq("REQUEST_EXPIRED"), anyString(), anyString(), anyString());
        // Không đồng bộ active_mentee_count (PENDING không được tính)
        verify(profileClient, never()).updateActiveMentees(any(), anyLong());
    }

    @Test
    void matchingUnavailableStillNotifiesWithoutSuggestions() {
        when(matching.similarMentors(any(), any(), anyInt())).thenReturn(List.of());

        service.expire(OffsetDateTime.now());

        ArgumentCaptor<String> msg = ArgumentCaptor.forClass(String.class);
        verify(notifications).notifyUser(eq(menteeId), eq("REQUEST_EXPIRED"), anyString(), msg.capture(), eq("/matching"));
        assertThat(msg.getValue()).doesNotContain("Gợi ý");
    }

    @Test
    void requestAnsweredMeanwhileIsLeftAlone() {
        request.setStatus(MentoringRequest.Status.ACCEPTED);

        assertThat(service.expire(OffsetDateTime.now())).isZero();

        assertThat(request.getStatus()).isEqualTo(MentoringRequest.Status.ACCEPTED);
        verifyNoInteractions(notifications, matching);
    }

    @Test
    void messageListsAtMostTheGivenSuggestions() {
        String m = RequestExpiryService.message("X", Duration.ofHours(72),
                List.of(new SimilarMentor(UUID.randomUUID(), "A", 1.0), new SimilarMentor(UUID.randomUUID(), " ", 0.5)));
        assertThat(m).endsWith("Gợi ý mentor tương tự: A.");
    }
}
