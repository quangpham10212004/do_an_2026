package com.mmp.profile.service;

import com.mmp.profile.client.MatchingIndexClient;
import com.mmp.profile.dto.ProfileDtos.*;
import com.mmp.profile.entity.MentorProfile;
import com.mmp.profile.entity.MentorProfile.Status;
import com.mmp.profile.exception.ApiException;
import com.mmp.profile.repository.MenteeProfileRepository;
import com.mmp.profile.repository.MentorAvailabilityExceptionRepository;
import com.mmp.profile.repository.MentorAvailabilityRepository;
import com.mmp.profile.repository.MentorProfileRepository;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.*;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** US-08 (PRD-PROF-5) — trạng thái mentor thay cho cờ is_available. */
class MentorStatusTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 10, 7);
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-07T03:00:00Z"), ZoneOffset.UTC);

    private final MentorProfileRepository mentorRepo = mock(MentorProfileRepository.class);
    private final TransactionTemplate tx = mock(TransactionTemplate.class);
    private final ProfileService service = new ProfileService(mentorRepo, mock(MenteeProfileRepository.class),
            mock(MentorAvailabilityRepository.class), mock(MentorAvailabilityExceptionRepository.class),
            mock(MatchingIndexClient.class), tx, CLOCK);
    private final UUID mentorId = UUID.randomUUID();
    private final MentorProfile mentor = new MentorProfile();

    @SuppressWarnings("unchecked")
    MentorStatusTest() {
        when(tx.execute(any())).thenAnswer(inv -> ((TransactionCallback<Object>) inv.getArgument(0)).doInTransaction(null));
        doAnswer(inv -> {
            ((Consumer<TransactionStatus>) inv.getArgument(0)).accept(null);
            return null;
        }).when(tx).executeWithoutResult(any());
        mentor.setUserId(mentorId);
        mentor.setDisplayName("Mentor");
        mentor.setDomain("backend");
        mentor.setVerificationStatus(MentorProfile.VerificationStatus.APPROVED);
        when(mentorRepo.findById(mentorId)).thenReturn(Optional.of(mentor));
        when(mentorRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    private static void assertCode(Runnable r, String code) {
        assertThatThrownBy(r::run).isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).getCode()).isEqualTo(code));
    }

    @Test
    void leaveAutoReturnsToAcceptingAfterTheLastDay() {
        assertThat(MentorRules.effectiveStatus(Status.ON_LEAVE, TODAY, TODAY)).isEqualTo(Status.ON_LEAVE);
        assertThat(MentorRules.effectiveStatus(Status.ON_LEAVE, TODAY.minusDays(1), TODAY)).isEqualTo(Status.ACCEPTING);
        assertThat(MentorRules.effectiveStatus(Status.PAUSED, TODAY.minusDays(1), TODAY)).isEqualTo(Status.PAUSED);
        assertThat(MentorRules.effectiveStatus(Status.SUSPENDED, null, TODAY)).isEqualTo(Status.SUSPENDED);
    }

    @Test
    void mentorCannotSuspendHimselfNorLeaveSuspension() {
        assertThatThrownBy(() -> MentorRules.validateSelfStatusChange(Status.ACCEPTING, Status.SUSPENDED, null, TODAY))
                .isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).getStatus()).isEqualTo(HttpStatus.FORBIDDEN));
        for (Status target : List.of(Status.ACCEPTING, Status.PAUSED, Status.ON_LEAVE)) {
            assertCode(() -> MentorRules.validateSelfStatusChange(Status.SUSPENDED, target, TODAY, TODAY), "MENTOR_SUSPENDED");
        }
    }

    @Test
    void leaveNeedsAnEndDateWithinOneYear() {
        assertCode(() -> MentorRules.validateSelfStatusChange(Status.ACCEPTING, Status.ON_LEAVE, null, TODAY), "INVALID_STATUS");
        assertCode(() -> MentorRules.validateSelfStatusChange(Status.ACCEPTING, Status.ON_LEAVE, TODAY.minusDays(1), TODAY), "INVALID_STATUS");
        assertCode(() -> MentorRules.validateSelfStatusChange(Status.ACCEPTING, Status.ON_LEAVE, TODAY.plusDays(366), TODAY), "INVALID_STATUS");
        MentorRules.validateSelfStatusChange(Status.ACCEPTING, Status.ON_LEAVE, TODAY, TODAY);
        MentorRules.validateSelfStatusChange(Status.PAUSED, Status.ACCEPTING, null, TODAY);
    }

    @Test
    void legacyIsAvailableFlagMapsToAcceptingOrPausedButNeverLiftsSuspension() {
        assertThat(MentorRules.statusFromLegacyFlag(true, Status.PAUSED)).isEqualTo(Status.ACCEPTING);
        assertThat(MentorRules.statusFromLegacyFlag(false, Status.ACCEPTING)).isEqualTo(Status.PAUSED);
        assertThat(MentorRules.statusFromLegacyFlag(true, Status.ACCEPTING)).isNull();
        assertThat(MentorRules.statusFromLegacyFlag(false, Status.ON_LEAVE)).isNull();
        assertThat(MentorRules.statusFromLegacyFlag(true, Status.SUSPENDED)).isNull();
        assertThat(MentorRules.statusFromLegacyFlag(null, Status.PAUSED)).isNull();
    }

    @Test
    void ownStatusChangeIsReflectedInResponseAndIsAvailable() {
        MentorProfileResponse res = service.changeOwnStatus(mentorId, new MentorStatusInput("ON_LEAVE", TODAY.plusDays(5), " Đi du lịch "));
        assertThat(res.status()).isEqualTo("ON_LEAVE");
        assertThat(res.onLeaveUntil()).isEqualTo(TODAY.plusDays(5));
        assertThat(res.isAvailable()).isFalse();
        assertThat(res.statusReason()).isEqualTo("Đi du lịch");

        res = service.changeOwnStatus(mentorId, new MentorStatusInput("ACCEPTING", TODAY.plusDays(5), null));
        assertThat(res.status()).isEqualTo("ACCEPTING");
        assertThat(res.onLeaveUntil()).isNull(); // ngày nghỉ chỉ giữ khi ON_LEAVE
        assertThat(res.isAvailable()).isTrue();
    }

    @Test
    void expiredLeaveIsReadAsAccepting() {
        mentor.changeStatus(Status.ON_LEAVE, TODAY.minusDays(1), "nghỉ");
        MentorProfileResponse res = service.getMentor(mentorId);
        assertThat(res.status()).isEqualTo("ACCEPTING");
        assertThat(res.isAvailable()).isTrue();
        assertThat(res.onLeaveUntil()).isNull();
        assertThat(res.statusReason()).isNull();
    }

    @Test
    void internalSuspensionBlocksMentorUntilLifted() {
        MentorProfileResponse res = service.setStatusInternal(mentorId, new InternalStatusUpdate("SUSPENDED", "Tranh chấp #12"));
        assertThat(res.status()).isEqualTo("SUSPENDED");
        assertThat(res.statusReason()).isEqualTo("Tranh chấp #12");
        assertCode(() -> service.changeOwnStatus(mentorId, new MentorStatusInput("ACCEPTING", null, null)), "MENTOR_SUSPENDED");

        // Cờ isAvailable cũ trong PUT hồ sơ cũng không gỡ được đình chỉ.
        service.upsertMentor(mentorId, new MentorProfileInput("Mentor", List.of("Java"), "backend", "Bio",
                5, null, List.of(), null, 3, true));
        assertThat(mentor.getStatus()).isEqualTo(Status.SUSPENDED);

        assertThat(service.setStatusInternal(mentorId, new InternalStatusUpdate("ACCEPTING", null)).status()).isEqualTo("ACCEPTING");
    }
}
