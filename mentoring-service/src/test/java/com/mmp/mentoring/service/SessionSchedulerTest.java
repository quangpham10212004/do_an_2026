package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.repository.SessionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Map;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Kiểm thử các job nền: nhắc lịch 24 giờ / 1 giờ (US-34), phiên quá hạn thanh toán → EXPIRED, job xác nhận tham dự (US-12). */
class SessionSchedulerTest {

    private SessionRepository repo;
    private NotificationService notifications;
    private AttendanceService attendance;
    private ProfileClient profileClient;
    private SessionScheduler scheduler;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        repo = mock(SessionRepository.class);
        notifications = mock(NotificationService.class);
        attendance = mock(AttendanceService.class);
        profileClient = mock(ProfileClient.class);
        TransactionTemplate tx = mock(TransactionTemplate.class);
        when(tx.execute(any())).thenAnswer(inv -> ((TransactionCallback<Object>) inv.getArgument(0)).doInTransaction(null));
        when(profileClient.timezone(any())).thenReturn(ZoneId.of("Asia/Ho_Chi_Minh"));
        when(profileClient.displayNames(any())).thenReturn(Map.of());
        scheduler = new SessionScheduler(repo, notifications, attendance, profileClient, tx, Duration.ofMinutes(30));
    }

    private static MentoringSession session(MentoringSession.Status status, OffsetDateTime start) {
        MentoringSession s = new MentoringSession();
        s.setMenteeId(UUID.randomUUID());
        s.setMentorId(UUID.randomUUID());
        s.setStatus(status);
        s.setScheduledAt(start);
        s.setDurationMinutes(60);
        return s;
    }

    @Test
    void twentyFourHourReminderGoesToBothInTheirOwnTimezone() {
        MentoringSession s = session(MentoringSession.Status.CONFIRMED, OffsetDateTime.now().plusHours(20));
        s.setAgenda("Review CV và portfolio");
        s.setMeetingLink("https://meet.google.com/abc-defg-hij");
        when(repo.findNeedingReminder(any(), any())).thenReturn(List.of(s));
        when(repo.claimReminder24h(any(), any())).thenReturn(1);
        when(profileClient.timezone(s.getMentorId())).thenReturn(ZoneId.of("Europe/Paris"));

        scheduler.sendReminders();

        ArgumentCaptor<OffsetDateTime> from = ArgumentCaptor.forClass(OffsetDateTime.class);
        ArgumentCaptor<OffsetDateTime> until = ArgumentCaptor.forClass(OffsetDateTime.class);
        verify(repo).findNeedingReminder(from.capture(), until.capture());
        assertThat(Duration.between(from.getValue(), until.getValue())).isEqualTo(Duration.ofHours(24));
        verify(repo, never()).claimReminder1h(any(), any());
        verify(notifications).notifyUser(eq(s.getMenteeId()), eq("SESSION_REMINDER_24H"), anyString(),
                argThat(msg -> msg.contains("Asia/Ho_Chi_Minh") && msg.contains("Review CV") && msg.contains("meet.google.com")),
                anyString(), eq(s.getScheduledAt()));
        verify(notifications).notifyUser(eq(s.getMentorId()), eq("SESSION_REMINDER_24H"), anyString(),
                argThat(msg -> msg.contains("Europe/Paris")), anyString(), eq(s.getScheduledAt()));
    }

    @Test
    void oneHourReminderAfterTheDailyOne() {
        MentoringSession s = session(MentoringSession.Status.CONFIRMED, OffsetDateTime.now().plusMinutes(50));
        ReflectionTestUtils.setField(s, "reminder24hSentAt", OffsetDateTime.now().minusHours(20));
        when(repo.findNeedingReminder(any(), any())).thenReturn(List.of(s));
        when(repo.claimReminder1h(any(), any())).thenReturn(1);

        scheduler.sendReminders();

        verify(notifications, times(2)).notifyUser(any(), eq("SESSION_REMINDER_1H"), anyString(), anyString(), anyString(), any());
    }

    @Test
    void reminderAlreadyClaimedByAnotherRunIsNotSentTwice() {
        MentoringSession s = session(MentoringSession.Status.CONFIRMED, OffsetDateTime.now().plusHours(5));
        when(repo.findNeedingReminder(any(), any())).thenReturn(List.of(s));
        when(repo.claimReminder24h(any(), any())).thenReturn(0);

        scheduler.sendReminders();

        verifyNoInteractions(notifications);
    }

    @Test
    void unpaidSessionsOlderThanHoldExpire() {
        MentoringSession pending = session(MentoringSession.Status.PENDING, OffsetDateTime.now().plusDays(2));
        when(repo.findExpiredPending(any())).thenReturn(List.of(pending));

        scheduler.expireUnpaidSessions();

        ArgumentCaptor<OffsetDateTime> before = ArgumentCaptor.forClass(OffsetDateTime.class);
        verify(repo).findExpiredPending(before.capture());
        assertThat(before.getValue()).isCloseTo(OffsetDateTime.now().minusMinutes(30), within(5, java.time.temporal.ChronoUnit.SECONDS));
        assertThat(pending.getStatus()).isEqualTo(MentoringSession.Status.EXPIRED);
        assertThat(pending.getCancelReason()).isEqualTo("PAYMENT_TIMEOUT");
        verify(notifications).notifyUser(eq(pending.getMenteeId()), eq("SESSION_EXPIRED"), anyString(), anyString(), anyString());
    }

    @Test
    void finishedSessionsAreNoLongerAutoCompletedButHandedToAttendanceJob() {
        scheduler.attendanceJob();

        verify(attendance).runJob();
        verifyNoInteractions(repo);
    }
}
