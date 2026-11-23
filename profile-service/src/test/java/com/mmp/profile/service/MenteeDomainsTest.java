package com.mmp.profile.service;

import com.mmp.profile.client.MatchingIndexClient;
import com.mmp.profile.dto.ProfileDtos.MenteeExtraDomain;
import com.mmp.profile.dto.ProfileDtos.MenteeProfileInput;
import com.mmp.profile.dto.ProfileDtos.MenteeProfileResponse;
import com.mmp.profile.entity.MenteeDomain;
import com.mmp.profile.entity.MenteeProfile;
import com.mmp.profile.exception.ApiException;
import com.mmp.profile.repository.*;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** Mentee học nhiều lĩnh vực: 1 chính + tối đa 2 phụ, mỗi lĩnh vực phụ có kỹ năng và mục tiêu riêng. */
class MenteeDomainsTest {

    private final MentorProfileRepository mentorRepo = mock(MentorProfileRepository.class);
    private final MenteeProfileRepository menteeRepo = mock(MenteeProfileRepository.class);
    private final MenteeDomainRepository domainRepo = mock(MenteeDomainRepository.class);
    private final ProfileAvatarRepository avatarRepo = mock(ProfileAvatarRepository.class);
    private final TransactionTemplate tx = mock(TransactionTemplate.class);
    private final ProfileService service = new ProfileService(mentorRepo, menteeRepo,
            mock(MentorAvailabilityRepository.class), mock(MentorAvailabilityExceptionRepository.class),
            mock(MatchingIndexClient.class), tx, Clock.systemUTC(), avatarRepo);
    private final UUID id = UUID.randomUUID();
    private final List<MenteeDomain> stored = new ArrayList<>();

    @SuppressWarnings("unchecked")
    MenteeDomainsTest() {
        when(tx.execute(any())).thenAnswer(inv -> ((TransactionCallback<Object>) inv.getArgument(0)).doInTransaction(null));
        when(menteeRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(avatarRepo.findUpdatedAt(any())).thenReturn(Optional.empty());
        when(domainRepo.findByMenteeIdOrderByAddedAt(id)).thenAnswer(inv -> List.copyOf(stored));
        when(domainRepo.save(any())).thenAnswer(inv -> {
            stored.add(inv.getArgument(0));
            return inv.getArgument(0);
        });
        doAnswer(inv -> { stored.clear(); return null; }).when(domainRepo).deleteByMenteeId(id);
        service.setMenteeDomainRepo(domainRepo);
    }

    private MenteeProfileInput input(String domain, List<MenteeExtraDomain> extras) {
        return new MenteeProfileInput("Mentee", "Học backend Java", domain, "BEGINNER", List.of("Java"), List.of(), null, extras);
    }

    private void profileExists() {
        MenteeProfile existing = new MenteeProfile();
        existing.setUserId(id);
        existing.setDisplayName("Mentee");
        existing.setDomain("backend");
        existing.setGoal("Học backend Java");
        when(menteeRepo.findById(id)).thenAnswer(inv -> Optional.of(existing));
    }

    @Test
    void savesExtraDomainsWithTheirOwnSkillsAndGoal() {
        profileExists();
        MenteeProfileResponse r = service.upsertMentee(id, input("Backend", List.of(
                new MenteeExtraDomain("DevOps", List.of("Docker", " docker ", "Kubernetes"), "  Triển khai CI/CD  "))));

        ArgumentCaptor<MenteeDomain> row = ArgumentCaptor.forClass(MenteeDomain.class);
        verify(domainRepo).save(row.capture());
        assertThat(row.getValue().getDomain()).isEqualTo("devops");
        assertThat(row.getValue().getSkills()).containsExactly("Docker", "Kubernetes");
        assertThat(row.getValue().getGoal()).isEqualTo("Triển khai CI/CD");
        assertThat(r.extraDomains()).extracting(MenteeExtraDomain::domain).containsExactly("devops");
        assertThat(r.extraDomains().get(0).skills()).containsExactly("Docker", "Kubernetes");
    }

    @Test
    void replacingExtrasDeletesAndFlushesBeforeReinsertingToAvoidUniqueViolation() {
        profileExists();
        service.upsertMentee(id, input("backend", List.of(new MenteeExtraDomain("data", List.of(), null))));
        service.upsertMentee(id, input("backend", List.of(new MenteeExtraDomain("data", List.of("SQL"), null))));

        InOrder order = inOrder(domainRepo);
        order.verify(domainRepo).deleteByMenteeId(id);
        order.verify(domainRepo).flush();
        order.verify(domainRepo).save(any());
        assertThat(stored).hasSize(1);
    }

    @Test
    void nullExtrasKeepExistingOnesButDropTheOneThatBecamePrimary() {
        profileExists();
        service.upsertMentee(id, input("backend", List.of(
                new MenteeExtraDomain("devops", List.of(), null), new MenteeExtraDomain("data", List.of(), null))));

        // Đổi lĩnh vực chính sang devops, không gửi extraDomains → data được giữ, devops không còn là lĩnh vực phụ.
        MenteeProfileResponse r = service.upsertMentee(id, input("devops", null));

        assertThat(r.extraDomains()).extracting(MenteeExtraDomain::domain).containsExactly("data");
    }

    @Test
    void emptyListClearsExtraDomains() {
        profileExists();
        service.upsertMentee(id, input("backend", List.of(new MenteeExtraDomain("data", List.of(), null))));
        assertThat(service.upsertMentee(id, input("backend", List.of())).extraDomains()).isEmpty();
    }

    @Test
    void rejectsInvalidDuplicateAndTooManyDomains() {
        assertThatThrownBy(() -> ProfileService.validateExtraDomains("backend", List.of(new MenteeExtraDomain("cooking", List.of(), null))))
                .isInstanceOf(ApiException.class).hasMessageContaining("không hợp lệ");
        assertThatThrownBy(() -> ProfileService.validateExtraDomains("backend", List.of(new MenteeExtraDomain("Backend", List.of(), null))))
                .isInstanceOf(ApiException.class).hasMessageContaining("khác lĩnh vực chính");
        assertThatThrownBy(() -> ProfileService.validateExtraDomains("backend", List.of(
                new MenteeExtraDomain("data", List.of(), null), new MenteeExtraDomain("DATA", List.of(), null))))
                .isInstanceOf(ApiException.class).hasMessageContaining("một lần");
        assertThatThrownBy(() -> ProfileService.validateExtraDomains("backend", List.of(
                new MenteeExtraDomain("data", List.of(), null), new MenteeExtraDomain("devops", List.of(), null),
                new MenteeExtraDomain("mobile", List.of(), null)))).isInstanceOf(ApiException.class).hasMessageContaining("Tối đa 3");
    }

    @Test
    void worksWithoutDomainRepositoryForLegacyCallers() {
        ProfileService legacy = new ProfileService(mentorRepo, menteeRepo, mock(MentorAvailabilityRepository.class),
                mock(MentorAvailabilityExceptionRepository.class), mock(MatchingIndexClient.class), tx, Clock.systemUTC(), avatarRepo);
        profileExists();
        assertThat(legacy.upsertMentee(id, input("backend", null)).extraDomains()).isEmpty();
    }
}
