package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.entity.MentorStrike;
import com.mmp.mentoring.repository.MentorStrikeRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** US-02 — strike của mentor. */
class StrikeServiceTest {

    MentorStrikeRepository repo;
    ProfileClient profile;
    NotificationService notifications;
    StrikeService service;
    final UUID mentor = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        repo = mock(MentorStrikeRepository.class);
        profile = mock(ProfileClient.class);
        notifications = mock(NotificationService.class);
        TransactionTemplate tx = mock(TransactionTemplate.class);
        when(tx.execute(any())).thenAnswer(inv -> inv.<TransactionCallback<?>>getArgument(0).doInTransaction(null));
        service = new StrikeService(repo, profile, notifications, tx, 3, Duration.ofDays(30));
    }

    @Test
    void thresholdRule() {
        assertThat(StrikeService.shouldPause(2, 3)).isFalse();
        assertThat(StrikeService.shouldPause(3, 3)).isTrue();
        assertThat(StrikeService.shouldPause(4, 3)).isTrue();
        assertThat(StrikeService.shouldPause(10, 0)).isFalse();
    }

    @Test
    void secondStrikeOnlyNotifiesMentor() {
        when(repo.countByMentorIdAndCreatedAtAfter(eq(mentor), any())).thenReturn(2L);
        assertThat(service.record(mentor, UUID.randomUUID(), MentorStrike.Reason.MENTOR_CANCEL)).isEqualTo(2);
        verify(repo).save(any(MentorStrike.class));
        verify(profile, never()).updateMentorStatus(any(), any(), any());
        verify(notifications, never()).notifyRole(any(), any(), any(), any(), any());
        verify(notifications).notifyUser(eq(mentor), eq("MENTOR_STRIKE"), any(), contains("2/3"), any());
    }

    @Test
    void thirdStrikeWithin30DaysPausesMentorAndNotifiesAdmins() {
        when(repo.countByMentorIdAndCreatedAtAfter(eq(mentor), any())).thenReturn(3L);
        service.record(mentor, UUID.randomUUID(), MentorStrike.Reason.MENTOR_CANCEL);
        verify(profile).updateMentorStatus(mentor, "PAUSED", "STRIKES");
        verify(notifications).notifyRole(eq("ADMIN"), eq("MENTOR_PAUSED_STRIKES"), any(), any(), any());
        verify(repo).countByMentorIdAndCreatedAtAfter(eq(mentor),
                argThat(t -> Math.abs(ChronoUnit.SECONDS.between(t, OffsetDateTime.now().minusDays(30))) < 5));
    }

    @Test
    void sameSessionIsNotStruckTwice() {
        UUID session = UUID.randomUUID();
        when(repo.existsBySessionIdAndReason(session, MentorStrike.Reason.MENTOR_CANCEL)).thenReturn(true);
        assertThat(service.record(mentor, session, MentorStrike.Reason.MENTOR_CANCEL)).isZero();
        verify(repo, never()).save(any());
        verifyNoInteractions(profile);
    }
}
