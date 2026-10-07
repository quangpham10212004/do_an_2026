package com.mmp.profile.service;

import com.mmp.profile.client.MatchingIndexClient;
import com.mmp.profile.dto.ProfileDtos.MenteePreferencesInput;
import com.mmp.profile.dto.ProfileDtos.MenteeProfileResponse;
import com.mmp.profile.entity.MenteeProfile;
import com.mmp.profile.exception.ApiException;
import com.mmp.profile.repository.MenteeProfileRepository;
import com.mmp.profile.repository.MentorAvailabilityExceptionRepository;
import com.mmp.profile.repository.MentorAvailabilityRepository;
import com.mmp.profile.repository.MentorProfileRepository;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Clock;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** US-16 (PRD-PROF-2) — sở thích tìm mentor của mentee. */
class MenteePreferencesTest {

    private static void assertInvalid(Runnable r) {
        assertThatThrownBy(r::run).isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).getCode()).isEqualTo(MenteeRules.ERROR_CODE));
    }

    @Test
    void daysAreIsoDedupedAndSorted() {
        assertThat(MenteeRules.normalizeDays(List.of(7, 1, 3, 1))).containsExactly(1, 3, 7);
        assertThat(MenteeRules.normalizeDays(null)).isEmpty();
        assertThat(MenteeRules.normalizeDays(List.of())).isEmpty();
        assertInvalid(() -> MenteeRules.normalizeDays(List.of(0)));
        assertInvalid(() -> MenteeRules.normalizeDays(List.of(8)));
        assertInvalid(() -> MenteeRules.normalizeDays(Arrays.asList(1, null)));
    }

    @Test
    void timeOfDayIsOptionalEnum() {
        assertThat(MenteeRules.parseTimeOfDay("evening")).isEqualTo(MenteeProfile.TimeOfDay.EVENING);
        assertThat(MenteeRules.parseTimeOfDay(" MORNING ")).isEqualTo(MenteeProfile.TimeOfDay.MORNING);
        assertThat(MenteeRules.parseTimeOfDay(null)).isNull();
        assertThat(MenteeRules.parseTimeOfDay("  ")).isNull();
        assertInvalid(() -> MenteeRules.parseTimeOfDay("NIGHT"));
    }

    @Test
    void budgetIsNonNegativeAndBounded() {
        assertThat(MenteeRules.normalizeBudget(null)).isNull();
        assertThat(MenteeRules.normalizeBudget(BigDecimal.ZERO)).isEqualByComparingTo("0");
        assertThat(MenteeRules.normalizeBudget(new BigDecimal("150000"))).isEqualByComparingTo("150000");
        assertThat(MenteeRules.normalizeBudget(new BigDecimal("100000000"))).isEqualByComparingTo("100000000");
        assertInvalid(() -> MenteeRules.normalizeBudget(new BigDecimal("-1")));
        assertInvalid(() -> MenteeRules.normalizeBudget(new BigDecimal("100000000.01")));
    }

    @Test
    void languagesMayBeEmptyButMustBeViOrEn() {
        assertThat(MenteeRules.normalizeLanguages(List.of(" EN", "vi", "en"))).containsExactly("en", "vi");
        assertThat(MenteeRules.normalizeLanguages(List.of())).isEmpty();
        assertThat(MenteeRules.normalizeLanguages(null)).isEmpty();
        assertInvalid(() -> MenteeRules.normalizeLanguages(List.of("fr")));
    }

    @Test
    @SuppressWarnings("unchecked")
    void preferencesAreSavedAndExposedWithoutTouchingTheEmbeddingIndex() {
        MenteeProfileRepository repo = mock(MenteeProfileRepository.class);
        MatchingIndexClient matching = mock(MatchingIndexClient.class);
        TransactionTemplate tx = mock(TransactionTemplate.class);
        doAnswer(inv -> {
            ((Consumer<TransactionStatus>) inv.getArgument(0)).accept(null);
            return null;
        }).when(tx).executeWithoutResult(any());
        ProfileService service = new ProfileService(mock(MentorProfileRepository.class), repo,
                mock(MentorAvailabilityRepository.class), mock(MentorAvailabilityExceptionRepository.class),
                matching, tx, Clock.systemUTC());
        UUID id = UUID.randomUUID();
        MenteeProfile mentee = new MenteeProfile();
        mentee.setUserId(id);
        mentee.setDomain("backend");
        when(repo.findById(id)).thenReturn(Optional.of(mentee));

        // Mặc định: không có sở thích nào.
        MenteeProfileResponse res = service.getMentee(id);
        assertThat(res.preferredDays()).isEmpty();
        assertThat(res.preferredTimeOfDay()).isNull();
        assertThat(res.budgetMaxPerHour()).isNull();
        assertThat(res.languages()).isEmpty();

        res = service.updatePreferences(id, new MenteePreferencesInput(List.of(6, 2), "evening",
                new BigDecimal("150000"), List.of("vi")));
        assertThat(res.preferredDays()).containsExactly(2, 6);
        assertThat(res.preferredTimeOfDay()).isEqualTo("EVENING");
        assertThat(res.budgetMaxPerHour()).isEqualByComparingTo("150000");
        assertThat(res.languages()).containsExactly("vi");

        // Giá trị sai => không lưu gì.
        assertInvalid(() -> service.updatePreferences(id, new MenteePreferencesInput(List.of(9), null, null, null)));
        assertThat(mentee.getPreferredDays()).containsExactly(2, 6);

        // Xoá hết sở thích.
        res = service.updatePreferences(id, new MenteePreferencesInput(null, null, null, null));
        assertThat(res.preferredDays()).isEmpty();
        assertThat(res.preferredTimeOfDay()).isNull();
        assertThat(res.budgetMaxPerHour()).isNull();

        // Sở thích không thuộc text embedding => không báo matching-service lập lại chỉ mục.
        verifyNoInteractions(matching);
    }
}
