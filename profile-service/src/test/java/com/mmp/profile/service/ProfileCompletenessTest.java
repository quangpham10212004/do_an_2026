package com.mmp.profile.service;

import com.mmp.profile.client.MatchingIndexClient;
import com.mmp.profile.dto.ProfileDtos.*;
import com.mmp.profile.entity.MenteeProfile;
import com.mmp.profile.entity.MentorProfile;
import com.mmp.profile.entity.ProfileAvatar;
import com.mmp.profile.exception.ApiException;
import com.mmp.profile.repository.*;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** US-37 (PRD-PROF-1, PROF-3, PROF-6) — điểm hoàn thiện hồ sơ, headline + ảnh đại diện, múi giờ người dùng. */
class ProfileCompletenessTest {

    private static final String GOAL_80 = "Trở thành backend developer Java trong 6 tháng, nắm vững Spring Boot và REST API.";
    private static final String BIO_150 = "a".repeat(150);

    // ---------------- điểm hoàn thiện (hàm thuần) ----------------

    @Test
    void emptyMenteeScoresOnlyLevel() {
        CompletenessRules.Completeness c = CompletenessRules.mentee(null, "BEGINNER", 0, "", null, 0, 0, null);
        assertThat(c.score()).isEqualTo(10);
        assertThat(c.items()).extracting(CompletenessRules.Item::weight).containsExactly(15, 10, 20, 30, 15, 10);
        assertThat(c.items().stream().mapToInt(CompletenessRules.Item::weight).sum()).isEqualTo(100);
    }

    @Test
    void fullMenteeScores100() {
        assertThat(CompletenessRules.mentee("backend", "BEGINNER", 3, GOAL_80, "cv.pdf", 0, 0, "EVENING").score()).isEqualTo(100);
        assertThat(CompletenessRules.mentee("backend", "BEGINNER", 3, GOAL_80, null, 1, 2, null).score()).isEqualTo(100);
    }

    @Test
    void menteeThresholdsAreExact() {
        String goal79 = "x".repeat(79);
        CompletenessRules.Completeness c = CompletenessRules.mentee("backend", "BEGINNER", 2, goal79, null, 0, 0, null);
        assertThat(c.score()).isEqualTo(25);
        assertThat(c.items()).filteredOn(i -> !i.done()).extracting(CompletenessRules.Item::key)
                .containsExactly("skills", "goal", "cvOrPortfolio", "schedule");
    }

    @Test
    void mentorWeightsSumTo100() {
        CompletenessRules.Completeness full = CompletenessRules.mentor(BIO_150, 3, 5, 2, new BigDecimal("200000"), 1, true);
        assertThat(full.score()).isEqualTo(100);
        CompletenessRules.Completeness bare = CompletenessRules.mentor("ngắn", 1, 0, 0, BigDecimal.ZERO, 0, false);
        assertThat(bare.score()).isZero();
        assertThat(CompletenessRules.mentor(BIO_150, 3, 0, 1, BigDecimal.ZERO, 0, false).score()).isEqualTo(60);
    }

    // ---------------- ảnh đại diện ----------------

    @Test
    void avatarTypeIsDetectedFromBytesNotFilename() {
        byte[] jpg = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 0x00};
        byte[] png = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0x00};
        assertThat(AvatarRules.detectType(jpg)).isEqualTo("image/jpeg");
        assertThat(AvatarRules.detectType(png)).isEqualTo("image/png");
        assertThatThrownBy(() -> AvatarRules.detectType("GIF89a".getBytes()))
                .isInstanceOf(ApiException.class).hasFieldOrPropertyWithValue("code", "INVALID_AVATAR");
        byte[] big = new byte[AvatarRules.MAX_BYTES + 1];
        big[0] = (byte) 0xFF;
        big[1] = (byte) 0xD8;
        big[2] = (byte) 0xFF;
        assertThatThrownBy(() -> AvatarRules.detectType(big)).hasFieldOrPropertyWithValue("code", "AVATAR_TOO_LARGE");
    }

    // ---------------- ProfileService ----------------

    private final MentorProfileRepository mentorRepo = mock(MentorProfileRepository.class);
    private final MenteeProfileRepository menteeRepo = mock(MenteeProfileRepository.class);
    private final MentorAvailabilityRepository availabilityRepo = mock(MentorAvailabilityRepository.class);
    private final MentorAvailabilityExceptionRepository exceptionRepo = mock(MentorAvailabilityExceptionRepository.class);
    private final ProfileAvatarRepository avatarRepo = mock(ProfileAvatarRepository.class);
    private final TransactionTemplate tx = mock(TransactionTemplate.class);
    private final ProfileService service = new ProfileService(mentorRepo, menteeRepo, availabilityRepo, exceptionRepo,
            mock(MatchingIndexClient.class), tx, Clock.systemUTC(), avatarRepo);
    private final UUID id = UUID.randomUUID();

    @SuppressWarnings("unchecked")
    ProfileCompletenessTest() {
        when(tx.execute(any())).thenAnswer(inv -> ((TransactionCallback<Object>) inv.getArgument(0)).doInTransaction(null));
        doAnswer(inv -> {
            ((Consumer<TransactionStatus>) inv.getArgument(0)).accept(null);
            return null;
        }).when(tx).executeWithoutResult(any());
        when(mentorRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(menteeRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(avatarRepo.findUpdatedAt(any())).thenReturn(Optional.empty());
    }

    private MenteeProfile mentee() {
        MenteeProfile m = new MenteeProfile();
        m.setUserId(id);
        m.setDisplayName("Mentee");
        m.setDomain("backend");
        m.setGoal(GOAL_80);
        m.setSkills(new String[]{"Java", "SQL", "Git"});
        when(menteeRepo.findById(id)).thenReturn(Optional.of(m));
        return m;
    }

    @Test
    void menteeResponseCarriesScoreAndMatchingGate() {
        MenteeProfile m = mentee();
        MenteeProfileResponse r = service.getMentee(id);
        assertThat(r.completeness().score()).isEqualTo(75);
        assertThat(r.matchingEnabled()).isTrue();
        m.setGoal("ngắn");
        m.setSkills(new String[0]);
        r = service.getMentee(id);
        assertThat(r.completeness().score()).isEqualTo(25);
        assertThat(r.matchingEnabled()).isFalse();
        assertThat(r.timezone()).isEqualTo("Asia/Ho_Chi_Minh");
    }

    @Test
    void timezoneIsValidatedAndExposedInSummary() {
        mentee();
        ProfileSummary s = service.updateTimezone(id, new TimezoneInput("Europe/Paris"));
        assertThat(s.timezone()).isEqualTo("Europe/Paris");
        assertThatThrownBy(() -> service.updateTimezone(id, new TimezoneInput("Mars/Base")))
                .hasFieldOrPropertyWithValue("code", "INVALID_TIMEZONE");
        UUID nobody = UUID.randomUUID();
        when(mentorRepo.findById(nobody)).thenReturn(Optional.empty());
        when(menteeRepo.findById(nobody)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.updateTimezone(nobody, new TimezoneInput("UTC")))
                .hasFieldOrPropertyWithValue("code", "PROFILE_NOT_FOUND");
    }

    @Test
    void avatarUploadReturnsVersionedPublicUrl() {
        mentee();
        OffsetDateTime at = OffsetDateTime.parse("2026-10-10T10:00:00Z");
        when(avatarRepo.findUpdatedAt(id)).thenReturn(Optional.of(at));
        AvatarResult r = service.uploadAvatar(id, new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 1});
        verify(avatarRepo).save(any(ProfileAvatar.class));
        assertThat(r.avatarUrl()).isEqualTo("/api/profile/avatars/" + id + "?v=" + at.toInstant().toEpochMilli());
        assertThat(service.getMentee(id).avatarUrl()).isEqualTo(r.avatarUrl());
    }

    @Test
    void mentorHeadlineIsTrimmedAndBlankClears() {
        MentorProfile p = new MentorProfile();
        p.setUserId(id);
        when(mentorRepo.findById(id)).thenReturn(Optional.of(p));
        when(availabilityRepo.findByMentorIdOrderByDayOfWeekAscStartTimeAsc(id)).thenReturn(List.of());
        MentorProfileInput in = new MentorProfileInput("Mentor", List.of("Java", "Spring", "SQL"), "backend", BIO_150, 5,
                null, List.of(), new BigDecimal("200000"), 3, null, "  Backend   lead @ FPT  ");
        MentorProfileResponse r = service.upsertMentor(id, in);
        assertThat(r.headline()).isEqualTo("Backend lead @ FPT");
        // bio 20 + skills 15 + years 10 + rate 10 = 55 (chưa có lịch rảnh, portfolio, ảnh)
        assertThat(r.completeness().score()).isEqualTo(55);
        service.upsertMentor(id, new MentorProfileInput("Mentor", List.of("Java"), "backend", BIO_150, 5,
                null, List.of(), null, 3, null, " "));
        assertThat(p.getHeadline()).isNull();
    }
}
