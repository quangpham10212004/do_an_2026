package com.mmp.profile.service;

import com.mmp.profile.client.MatchingIndexClient;
import com.mmp.profile.dto.ProfileDtos.EnrichmentInput;
import com.mmp.profile.entity.MenteeProfile;
import com.mmp.profile.repository.MenteeProfileRepository;
import com.mmp.profile.repository.MentorAvailabilityExceptionRepository;
import com.mmp.profile.repository.MentorAvailabilityRepository;
import com.mmp.profile.repository.MentorProfileRepository;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** FR-8.5 — goal sau chatbot enrichment; lĩnh vực chỉ đổi khi mentee chọn đổi lúc xác nhận mục tiêu. */
class ProfileEnrichmentTest {

    private final MenteeProfileRepository menteeRepo = mock(MenteeProfileRepository.class);
    private final TransactionTemplate tx = mock(TransactionTemplate.class);
    private final ProfileService service = new ProfileService(
            mock(MentorProfileRepository.class), menteeRepo, mock(MentorAvailabilityRepository.class),
            mock(MentorAvailabilityExceptionRepository.class), mock(MatchingIndexClient.class), tx, java.time.Clock.systemUTC());
    private final UUID userId = UUID.randomUUID();
    private final MenteeProfile mentee = new MenteeProfile();

    @SuppressWarnings("unchecked")
    ProfileEnrichmentTest() {
        when(tx.execute(any())).thenAnswer(inv -> ((TransactionCallback<Object>) inv.getArgument(0)).doInTransaction(null));
        mentee.setUserId(userId);
        mentee.setDomain("frontend");
        mentee.setSkills(new String[]{"HTML"});
        when(menteeRepo.findById(userId)).thenReturn(Optional.of(mentee));
        when(menteeRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void switchesDomainWhenMenteeChoseTo() {
        service.applyEnrichment(userId, new EnrichmentInput("Muốn trở thành product manager", List.of(), null, " Product "));
        assertThat(mentee.getDomain()).isEqualTo("product");
        assertThat(mentee.getGoal()).isEqualTo("Muốn trở thành product manager");
    }

    @Test
    void keepsDomainWhenNotSent() {
        service.applyEnrichment(userId, new EnrichmentInput("Muốn học sâu React và Next.js", List.of(), null, null));
        assertThat(mentee.getDomain()).isEqualTo("frontend");
    }
}
