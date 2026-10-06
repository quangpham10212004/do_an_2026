package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.entity.MentoringRequest;
import com.mmp.mentoring.repository.MentoringRequestRepository;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class MentoringRequestServiceTest {

    private final MentoringRequestRepository repo = mock(MentoringRequestRepository.class);
    private final MentoringRequestService service = new MentoringRequestService(
            repo, mock(ProfileClient.class), mock(NotificationService.class), mock(TransactionTemplate.class));

    @Test
    void relationshipCountsOnlyPendingOrAcceptedRequests() {
        // Quyền mentor tải CV mentee (ai-service) dựa trên kết quả này — chỉ yêu cầu đang mở mới tính.
        assertThat(MentoringRequestService.OPEN_STATUSES)
                .containsExactlyInAnyOrder(MentoringRequest.Status.PENDING, MentoringRequest.Status.ACCEPTED);
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
                MentoringRequest.Status.PENDING, MentoringRequest.Status.ACCEPTED)));
    }
}
