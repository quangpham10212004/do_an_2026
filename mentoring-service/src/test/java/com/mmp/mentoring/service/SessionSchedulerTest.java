package com.mmp.mentoring.service;

import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.repository.SessionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Kiểm thử các job nền: nhắc lịch (FR-5.5), huỷ phiên quá hạn thanh toán, tự hoàn thành phiên. */
class SessionSchedulerTest {

    private SessionRepository repo;
    private NotificationService notifications;
    private SessionScheduler scheduler;

    @BeforeEach
    void setUp() {
        repo = mock(SessionRepository.class);
        notifications = mock(NotificationService.class);
        scheduler = new SessionScheduler(repo, notifications, Duration.ofHours(24), Duration.ofMinutes(30), "Asia/Ho_Chi_Minh");
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
    void remindersQueryTheConfiguredWindowAndNotifyBothParticipantsOnce() {
        MentoringSession s = session(MentoringSession.Status.CONFIRMED, OffsetDateTime.parse("2026-09-20T12:00:00Z"));
        s.setTopic("Review CV");
        when(repo.findNeedingReminder(any(), any())).thenReturn(List.of(s));

        scheduler.sendReminders();

        ArgumentCaptor<OffsetDateTime> from = ArgumentCaptor.forClass(OffsetDateTime.class);
        ArgumentCaptor<OffsetDateTime> until = ArgumentCaptor.forClass(OffsetDateTime.class);
        verify(repo).findNeedingReminder(from.capture(), until.capture());
        assertThat(Duration.between(from.getValue(), until.getValue())).isEqualTo(Duration.ofHours(24));
        assertThat(from.getValue()).isCloseTo(OffsetDateTime.now(), within(5, java.time.temporal.ChronoUnit.SECONDS));

        // Hiển thị theo giờ Việt Nam: 12:00Z = 19:00 GMT+7
        verify(notifications).notifyUser(eq(s.getMenteeId()), eq("SESSION_REMINDER"), anyString(),
                argThat(msg -> msg.contains("19:00 20/09/2026") && msg.contains("Review CV")), anyString());
        verify(notifications).notifyUser(eq(s.getMentorId()), eq("SESSION_REMINDER"), anyString(), anyString(), anyString());
        assertThat(s.isReminderSent()).isTrue();
    }

    @Test
    void unpaidSessionsOlderThanHoldAreCancelled() {
        MentoringSession pending = session(MentoringSession.Status.PENDING, OffsetDateTime.now().plusDays(2));
        when(repo.findExpiredPending(any())).thenReturn(List.of(pending));

        scheduler.expireUnpaidSessions();

        ArgumentCaptor<OffsetDateTime> before = ArgumentCaptor.forClass(OffsetDateTime.class);
        verify(repo).findExpiredPending(before.capture());
        assertThat(before.getValue()).isCloseTo(OffsetDateTime.now().minusMinutes(30), within(5, java.time.temporal.ChronoUnit.SECONDS));
        assertThat(pending.getStatus()).isEqualTo(MentoringSession.Status.CANCELLED);
        verify(notifications).notifyUser(eq(pending.getMenteeId()), eq("SESSION_EXPIRED"), anyString(), anyString(), anyString());
    }

    @Test
    void onlyConfirmedSessionsEndedMoreThanTwoHoursAgoAreAutoCompleted() {
        MentoringSession old = session(MentoringSession.Status.CONFIRMED, OffsetDateTime.now().minusHours(4)); // kết thúc 3 giờ trước
        MentoringSession recent = session(MentoringSession.Status.CONFIRMED, OffsetDateTime.now().minusMinutes(90)); // kết thúc 30 phút trước
        MentoringSession pending = session(MentoringSession.Status.PENDING, OffsetDateTime.now().minusHours(5));
        when(repo.findAll()).thenReturn(List.of(old, recent, pending));

        scheduler.autoCompleteFinishedSessions();

        assertThat(old.getStatus()).isEqualTo(MentoringSession.Status.COMPLETED);
        assertThat(recent.getStatus()).isEqualTo(MentoringSession.Status.CONFIRMED);
        assertThat(pending.getStatus()).isEqualTo(MentoringSession.Status.PENDING);
        verify(notifications, times(1)).notifyUser(any(), eq("SESSION_COMPLETED"), anyString(), anyString(), anyString());
    }
}
