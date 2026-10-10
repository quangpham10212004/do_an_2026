package com.mmp.profile.service;

import com.mmp.profile.client.MatchingIndexClient;
import com.mmp.profile.entity.MenteeProfile;
import com.mmp.profile.entity.MentorProfile;
import com.mmp.profile.repository.MenteeProfileRepository;
import com.mmp.profile.repository.MentorAvailabilityExceptionRepository;
import com.mmp.profile.repository.MentorAvailabilityRepository;
import com.mmp.profile.repository.MentorProfileRepository;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** Gỡ cvFileUrl sau khi CV bị xoá ở ai-service (DELETE /internal/profile/{userId}/cv-file). */
class ProfileCvFileTest {

    private static final String URL = "/api/ai/cv/11111111-1111-1111-1111-111111111111/file";

    private final MentorProfileRepository mentorRepo = mock(MentorProfileRepository.class);
    private final MenteeProfileRepository menteeRepo = mock(MenteeProfileRepository.class);
    private final MatchingIndexClient matching = mock(MatchingIndexClient.class);
    private final TransactionTemplate tx = mock(TransactionTemplate.class);
    private final ProfileService service = new ProfileService(
            mentorRepo, menteeRepo, mock(MentorAvailabilityRepository.class),
            mock(MentorAvailabilityExceptionRepository.class), matching, tx, java.time.Clock.systemUTC());
    private final UUID userId = UUID.randomUUID();

    @SuppressWarnings("unchecked")
    ProfileCvFileTest() {
        when(tx.execute(any())).thenAnswer(inv -> ((TransactionCallback<Object>) inv.getArgument(0)).doInTransaction(null));
        when(mentorRepo.findById(userId)).thenReturn(Optional.empty());
        when(menteeRepo.findById(userId)).thenReturn(Optional.empty());
    }

    @Test
    void clearsMenteeReferenceToDeletedCv() {
        MenteeProfile mentee = new MenteeProfile();
        mentee.setCvFileUrl(URL);
        when(menteeRepo.findById(userId)).thenReturn(Optional.of(mentee));

        assertThat(service.clearCvFileUrl(userId, URL)).isTrue();
        assertThat(mentee.getCvFileUrl()).isNull();
        verify(menteeRepo).save(mentee);
        verifyNoInteractions(matching); // cv_file_url không thuộc text embedding
    }

    @Test
    void clearsMentorReferenceToDeletedCv() {
        MentorProfile mentor = new MentorProfile();
        mentor.setCvFileUrl(URL);
        when(mentorRepo.findById(userId)).thenReturn(Optional.of(mentor));

        assertThat(service.clearCvFileUrl(userId, URL)).isTrue();
        assertThat(mentor.getCvFileUrl()).isNull();
    }

    @Test
    void keepsReferenceToADifferentCvAndIgnoresMissingProfile() {
        MenteeProfile mentee = new MenteeProfile();
        mentee.setCvFileUrl("/api/ai/cv/22222222-2222-2222-2222-222222222222/file");
        when(menteeRepo.findById(userId)).thenReturn(Optional.of(mentee));

        assertThat(service.clearCvFileUrl(userId, URL)).isFalse();
        assertThat(mentee.getCvFileUrl()).endsWith("22222222-2222-2222-2222-222222222222/file");
        verify(menteeRepo, never()).save(any());
        assertThat(service.clearCvFileUrl(UUID.randomUUID(), URL)).isFalse();
    }

    // ---- US-45 (PRD-CV-6): xoá CV kèm "gỡ cả kỹ năng đã thêm từ CV này" ----

    @Test
    void removesSkillsCaseInsensitivelyAndReindexes() {
        MenteeProfile mentee = new MenteeProfile();
        mentee.setSkills(new String[]{"Java", "Docker", "React"});
        when(menteeRepo.findById(userId)).thenReturn(Optional.of(mentee));

        service.removeMenteeSkills(userId, java.util.List.of("java", " DOCKER "));
        assertThat(mentee.getSkills()).containsExactly("React");
        verify(menteeRepo).save(mentee);
        verify(matching).reindexAsync(any(), eq(userId));
    }

    @Test
    void skillsNotOnProfileChangeNothing() {
        MenteeProfile mentee = new MenteeProfile();
        mentee.setSkills(new String[]{"React"});
        when(menteeRepo.findById(userId)).thenReturn(Optional.of(mentee));

        service.removeMenteeSkills(userId, java.util.List.of("Java"));
        assertThat(mentee.getSkills()).containsExactly("React");
        verify(menteeRepo, never()).save(any());
        verifyNoInteractions(matching);
    }
}
