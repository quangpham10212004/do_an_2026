package com.mmp.profile.service;

import com.mmp.profile.dto.MentorDomainDtos.Domain;
import com.mmp.profile.entity.MentorDomain;
import com.mmp.profile.entity.MentorDomain.Stage;
import com.mmp.profile.entity.MentorDomain.State;
import com.mmp.profile.entity.MentorProfile;
import com.mmp.profile.exception.ApiException;
import com.mmp.profile.repository.MentorDomainRepository;
import com.mmp.profile.repository.MentorProfileRepository;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class MentorDomainRulesTest {
    @Test
    void normalizesDomainCatalogCodes() {
        assertThat(MentorDomainService.catalogCode(" Backend ")).isEqualTo("backend");
        assertThatThrownBy(() -> MentorDomainService.catalogCode("unlisted"))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void countsTheExistingProfileDomainUntilItHasItsOwnRecord() {
        var profile = new MentorProfile();
        profile.setDomain("backend");
        assertThat(MentorDomainService.effectiveDomainCount(profile, List.of())).isEqualTo(1);
    }

    @Test
    void publicListUsesVerifiedDomainsAndPutsPrimaryFirst() {
        var id = UUID.randomUUID();
        var at = OffsetDateTime.parse("2026-11-22T10:00:00Z");
        var profile = new MentorProfile();
        profile.setUserId(id);
        profile.setDomain("backend");
        profile.setVerificationStatus(MentorProfile.VerificationStatus.APPROVED);
        var pending = new MentorDomain(id, "data", at);
        var secondary = new MentorDomain(id, "frontend", at);
        secondary.updateVerification(State.VERIFIED, Stage.ADMIN, 85, null, null, at);

        var profiles = mock(MentorProfileRepository.class);
        var domains = mock(MentorDomainRepository.class);
        var profileService = mock(ProfileService.class);
        when(profiles.findById(id)).thenReturn(Optional.of(profile));
        when(domains.findByMentorIdOrderByAddedAtAscDomainAsc(id)).thenReturn(List.of(pending, secondary));
        when(profileService.effectiveStatus(profile)).thenReturn(MentorProfile.Status.ACCEPTING);
        var service = new MentorDomainService(profiles, domains, null, null, profileService, null, Clock.systemUTC());

        assertThat(service.list(id, true).domains()).extracting(Domain::domain).containsExactly("backend", "frontend");
        assertThat(service.list(id, false).domains()).extracting(Domain::domain).contains("data");
    }
}
