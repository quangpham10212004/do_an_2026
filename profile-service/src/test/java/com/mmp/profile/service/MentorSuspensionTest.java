package com.mmp.profile.service;

import com.mmp.profile.client.AuditClient;
import com.mmp.profile.client.MentoringClient;
import com.mmp.profile.client.MentoringClient.SuspendResult;
import com.mmp.profile.dto.ProfileDtos.*;
import com.mmp.profile.entity.MentorProfile;
import com.mmp.profile.entity.MentorProfile.Status;
import com.mmp.profile.exception.ApiException;
import com.mmp.profile.repository.MentorProfileRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.*;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** US-27 (PRD-ADM-3) — admin đình chỉ / gỡ đình chỉ mentor. */
class MentorSuspensionTest {

    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-11-10T03:00:00Z"), ZoneOffset.UTC);
    private static final String REASON = "Vi phạm quy tắc ứng xử nhiều lần";

    private final MentorProfileRepository mentorRepo = mock(MentorProfileRepository.class);
    private final MentoringClient mentoringClient = mock(MentoringClient.class);
    private final AuditClient auditClient = mock(AuditClient.class);
    private final TransactionTemplate tx = mock(TransactionTemplate.class);
    private final MentorSuspensionService service =
            new MentorSuspensionService(mentorRepo, mentoringClient, auditClient, tx, CLOCK);
    private final UUID mentorId = UUID.randomUUID();
    private final UUID adminId = UUID.randomUUID();
    private final MentorProfile mentor = new MentorProfile();

    @SuppressWarnings("unchecked")
    MentorSuspensionTest() {
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

    private static void assertError(Runnable r, HttpStatus status, String code) {
        assertThatThrownBy(r::run).isInstanceOf(ApiException.class)
                .satisfies(e -> {
                    assertThat(((ApiException) e).getStatus()).isEqualTo(status);
                    assertThat(((ApiException) e).getCode()).isEqualTo(code);
                });
    }

    @Test
    void reasonMustBe10To500CharactersAfterTrim() {
        assertError(() -> MentorRules.validateSuspendReason(null), HttpStatus.BAD_REQUEST, "INVALID_SUSPEND_REASON");
        assertError(() -> MentorRules.validateSuspendReason("   ngắn    "), HttpStatus.BAD_REQUEST, "INVALID_SUSPEND_REASON");
        assertError(() -> MentorRules.validateSuspendReason("x".repeat(501)), HttpStatus.BAD_REQUEST, "INVALID_SUSPEND_REASON");
        assertThat(MentorRules.validateSuspendReason("  0123456789  ")).isEqualTo("0123456789");
        assertThat(MentorRules.validateSuspendReason("x".repeat(500))).hasSize(500);
    }

    @Test
    void suspendSetsStatusAndAuditFieldsThenCancelsSessionsAndAudits() {
        when(mentoringClient.suspendMentor(mentorId, REASON, adminId)).thenReturn(new SuspendResult(true, 2, null));

        SuspensionResult res = service.suspend(mentorId, "  " + REASON + " ", adminId);

        assertThat(mentor.getStatus()).isEqualTo(Status.SUSPENDED);
        assertThat(mentor.getSuspendedReason()).isEqualTo(REASON);
        assertThat(mentor.getSuspendedBy()).isEqualTo(adminId);
        assertThat(mentor.getSuspendedAt()).isEqualTo(OffsetDateTime.now(CLOCK));
        assertThat(res.mentor().status()).isEqualTo("SUSPENDED");
        assertThat(res.mentoringNotified()).isTrue();
        assertThat(res.cancelledSessions()).isEqualTo(2);
        assertThat(res.warning()).isNull();

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> after = ArgumentCaptor.forClass(Map.class);
        verify(auditClient).recordAsync(eq(adminId), eq("ADMIN"), eq("MENTOR_SUSPENDED"), eq("MENTOR"),
                eq(mentorId.toString()), eq(Map.of("status", "ACCEPTING")), after.capture());
        assertThat((Map<String, Object>) after.getValue()).containsEntry("status", "SUSPENDED").containsEntry("reason", REASON)
                .containsEntry("cancelledSessions", 2);
    }

    @Test
    void suspendStillSucceedsWhenMentoringEndpointIsMissing() {
        when(mentoringClient.suspendMentor(any(), any(), any())).thenReturn(SuspendResult.failed("ENDPOINT_NOT_FOUND"));

        SuspensionResult res = service.suspend(mentorId, REASON, adminId);

        assertThat(mentor.getStatus()).isEqualTo(Status.SUSPENDED);
        assertThat(res.mentoringNotified()).isFalse();
        assertThat(res.cancelledSessions()).isNull();
        assertThat(res.warning()).isNotBlank();
        verify(auditClient).recordAsync(any(), any(), eq("MENTOR_SUSPENDED"), any(), any(), any(), any());
    }

    @Test
    void suspendingASuspendedMentorIsAConflictAndCallsNobody() {
        mentor.suspend("Lý do trước đó đủ dài", adminId, OffsetDateTime.now(CLOCK));
        assertError(() -> service.suspend(mentorId, REASON, adminId), HttpStatus.CONFLICT, "MENTOR_ALREADY_SUSPENDED");
        verifyNoInteractions(mentoringClient, auditClient);
    }

    @Test
    void invalidReasonIsRejectedBeforeTouchingTheProfile() {
        assertError(() -> service.suspend(mentorId, "ngắn", adminId), HttpStatus.BAD_REQUEST, "INVALID_SUSPEND_REASON");
        assertThat(mentor.getStatus()).isEqualTo(Status.ACCEPTING);
        verifyNoInteractions(mentoringClient, auditClient);
    }

    @Test
    void unknownMentorIs404() {
        UUID other = UUID.randomUUID();
        when(mentorRepo.findById(other)).thenReturn(Optional.empty());
        assertError(() -> service.suspend(other, REASON, adminId), HttpStatus.NOT_FOUND, "PROFILE_NOT_FOUND");
    }

    @Test
    void unsuspendReturnsToAcceptingClearsFieldsAndAudits() {
        mentor.suspend(REASON, adminId, OffsetDateTime.now(CLOCK));

        SuspensionResult res = service.unsuspend(mentorId, adminId);

        assertThat(mentor.getStatus()).isEqualTo(Status.ACCEPTING);
        assertThat(mentor.getSuspendedReason()).isNull();
        assertThat(mentor.getSuspendedAt()).isNull();
        assertThat(mentor.getSuspendedBy()).isNull();
        assertThat(mentor.getStatusReason()).isNull();
        assertThat(res.mentor().status()).isEqualTo("ACCEPTING");
        verify(auditClient).recordAsync(eq(adminId), eq("ADMIN"), eq("MENTOR_UNSUSPENDED"), eq("MENTOR"),
                eq(mentorId.toString()), eq(Map.of("status", "SUSPENDED", "reason", REASON)), eq(Map.of("status", "ACCEPTING")));
        verifyNoInteractions(mentoringClient);
    }

    @Test
    void unsuspendingAnActiveMentorIsAConflict() {
        mentor.changeStatus(Status.PAUSED, null, null);
        assertError(() -> service.unsuspend(mentorId, adminId), HttpStatus.CONFLICT, "MENTOR_NOT_SUSPENDED");
        assertThat(mentor.getStatus()).isEqualTo(Status.PAUSED);
    }

    @Test
    void mentorCannotLiftAnAdminSuspensionHimself() {
        mentor.suspend(REASON, adminId, OffsetDateTime.now(CLOCK));
        assertError(() -> MentorRules.validateSelfStatusChange(mentor.getStatus(), Status.ACCEPTING, null, LocalDate.now(CLOCK)),
                HttpStatus.CONFLICT, "MENTOR_SUSPENDED");
        assertThat(MentorRules.statusFromLegacyFlag(true, mentor.getStatus())).isNull();
    }

    @Test
    void internalDisputeSuspensionRecordsSystemSuspensionAndAcceptingClearsIt() {
        mentor.changeStatus(Status.SUSPENDED, null, "DISPUTE");
        assertThat(mentor.getSuspendedAt()).isNotNull();
        assertThat(mentor.getSuspendedBy()).isNull();
        assertThat(mentor.getSuspendedReason()).isEqualTo("DISPUTE");
        mentor.changeStatus(Status.ACCEPTING, null, null);
        assertThat(mentor.getSuspendedAt()).isNull();
        assertThat(mentor.getSuspendedReason()).isNull();
    }

    @Test
    void publicViewerDoesNotSeeTheSuspensionReason() {
        mentor.suspend(REASON, adminId, OffsetDateTime.now(CLOCK));
        MentorProfileResponse full = MentorProfileResponse.from(mentor, Status.SUSPENDED, java.util.List.of(), java.util.List.of());
        assertThat(full.statusReason()).isEqualTo(REASON);
        MentorProfileResponse pub = full.forPublicViewer();
        assertThat(pub.status()).isEqualTo("SUSPENDED");
        assertThat(pub.statusReason()).isNull();
        assertThat(pub.meetingLink()).isNull();
    }

    @Test
    void auditBodyFollowsTheSharedInterface() {
        Map<String, Object> body = AuditClient.body(adminId, "ADMIN", "MENTOR_SUSPENDED", "MENTOR", "m1",
                Map.of("status", "ACCEPTING"), null);
        assertThat(body).containsOnlyKeys("actorId", "actorRole", "action", "targetType", "targetId", "before", "after");
        assertThat(body.get("actorId")).isEqualTo(adminId.toString());
        assertThat(body.get("after")).isNull();
    }
}
