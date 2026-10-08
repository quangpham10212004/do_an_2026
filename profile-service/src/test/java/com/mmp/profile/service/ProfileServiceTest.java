package com.mmp.profile.service;

import com.mmp.profile.dto.ProfileDtos.*;
import com.mmp.profile.entity.MenteeProfile;
import com.mmp.profile.entity.MentorProfile;
import com.mmp.profile.exception.ApiException;
import com.mmp.profile.repository.MenteeProfileRepository;
import com.mmp.profile.repository.MentorAvailabilityRepository;
import com.mmp.profile.repository.MentorProfileRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class ProfileServiceTest {

    private MentorProfileRepository mentorRepo;
    private MenteeProfileRepository menteeRepo;
    private MentorAvailabilityRepository availabilityRepo;
    private EmbeddingService embeddingService;
    private ProfileService service;
    private final UUID id = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        mentorRepo = mock(MentorProfileRepository.class);
        menteeRepo = mock(MenteeProfileRepository.class);
        availabilityRepo = mock(MentorAvailabilityRepository.class);
        embeddingService = mock(EmbeddingService.class);
        TransactionTemplate tx = mock(TransactionTemplate.class);
        when(tx.execute(any())).thenAnswer(inv -> ((TransactionCallback<?>) inv.getArgument(0)).doInTransaction(null));
        doAnswer(inv -> {
            ((java.util.function.Consumer<?>) inv.getArgument(0)).accept(null);
            return null;
        }).when(tx).executeWithoutResult(any());
        service = new ProfileService(mentorRepo, menteeRepo, availabilityRepo, new ProfileTextNormalizer(),
                embeddingService, tx);
        when(embeddingService.currentStatus(any(), any())).thenReturn(EmbeddingService.Status.PENDING);
    }

    private static AvailabilitySlot slot(int day, String from, String to) {
        return new AvailabilitySlot(null, day, LocalTime.parse(from), LocalTime.parse(to));
    }

    private MentorProfile existingMentor() {
        MentorProfile m = new MentorProfile();
        m.setUserId(id);
        m.setDisplayName("M");
        m.setDomain("backend");
        m.setBio("bio");
        m.setSkills(new String[]{"Java"});
        return m;
    }

    @Test
    void overlappingSlotsOnSameDayAreRejected() {
        when(mentorRepo.findById(id)).thenReturn(Optional.of(existingMentor()));
        var input = new AvailabilityInput(List.of(slot(1, "09:00", "11:00"), slot(1, "10:30", "12:00")));

        assertThatThrownBy(() -> service.replaceAvailability(id, input))
                .isInstanceOf(ApiException.class).hasMessageContaining("chồng lấn");
        verify(availabilityRepo, never()).deleteByMentorId(any());
    }

    @Test
    void slotsOnDifferentDaysOrAdjacentAreAccepted() {
        when(mentorRepo.findById(id)).thenReturn(Optional.of(existingMentor()));
        when(availabilityRepo.findByMentorIdOrderByDayOfWeekAscStartTimeAsc(id)).thenReturn(List.of());
        var input = new AvailabilityInput(List.of(slot(2, "09:00", "10:00"), slot(1, "10:00", "11:00"), slot(1, "09:00", "10:00")));

        service.replaceAvailability(id, input);

        verify(availabilityRepo).deleteByMentorId(id);
        verify(availabilityRepo, times(3)).save(any());
    }

    @Test
    void slotEndingBeforeItStartsIsRejected() {
        when(mentorRepo.findById(id)).thenReturn(Optional.of(existingMentor()));
        var input = new AvailabilityInput(List.of(slot(3, "15:00", "14:00")));

        assertThatThrownBy(() -> service.replaceAvailability(id, input)).isInstanceOf(ApiException.class);
    }

    @Test
    void enrichmentOverwritesGoalMergesCvSkillsWithoutDuplicatesAndRefreshesEmbedding() {
        MenteeProfile p = new MenteeProfile();
        p.setUserId(id);
        p.setDisplayName("E");
        p.setDomain("backend");
        p.setGoal("old goal");
        p.setSkills(new String[]{"Java"});
        when(menteeRepo.findById(id)).thenReturn(Optional.of(p));
        when(menteeRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(embeddingService.refresh(any(), eq(id), any(), eq(false))).thenReturn(EmbeddingService.Status.UPDATED);

        var out = service.applyEnrichment(id,
                new EnrichmentInput("  Trở thành backend engineer ", List.of("java", "Docker", " "), "cv/a.pdf"));

        assertThat(out.goal()).isEqualTo("Trở thành backend engineer");
        assertThat(out.skills()).containsExactly("Java", "Docker");
        assertThat(out.cvFileUrl()).isEqualTo("cv/a.pdf");
        assertThat(out.embeddingStatus()).isEqualTo("UPDATED");
        verify(embeddingService).refresh(eq(EmbeddingService.Table.MENTEE), eq(id), any(), eq(false));
    }

    @Test
    void enrichmentForUnknownMenteeIsNotFound() {
        when(menteeRepo.findById(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.applyEnrichment(id, new EnrichmentInput("g", null, null)))
                .isInstanceOf(ApiException.class);
        verifyNoInteractions(embeddingService);
    }

    @Test
    void upsertMentorNormalizesInputAndReportsPendingEmbeddingWithoutFailing() {
        when(mentorRepo.findById(id)).thenReturn(Optional.empty());
        when(mentorRepo.save(any())).thenAnswer(inv -> {
            MentorProfile saved = inv.getArgument(0);
            when(mentorRepo.findById(id)).thenReturn(Optional.of(saved));
            return saved;
        });
        when(embeddingService.refresh(any(), eq(id), any(), eq(false))).thenReturn(EmbeddingService.Status.PENDING);
        when(availabilityRepo.findByMentorIdOrderByDayOfWeekAscStartTimeAsc(id)).thenReturn(List.of());

        var out = service.upsertMentor(id, new MentorProfileInput(" Thảo ", List.of("Java", "java", "Spring"),
                " Backend ", " bio ", 5, null, null, null, 4, null));

        assertThat(out.domain()).isEqualTo("backend");
        assertThat(out.skills()).containsExactly("Java", "Spring");
        assertThat(out.displayName()).isEqualTo("Thảo");
        assertThat(out.embeddingStatus()).isEqualTo("PENDING");
        assertThat(out.capacity()).isEqualTo(4);
    }
}
