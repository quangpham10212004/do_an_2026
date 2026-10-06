package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.client.ProfileClient.AvailabilityException;
import com.mmp.mentoring.client.ProfileClient.AvailabilitySlot;
import com.mmp.mentoring.dto.MentoringDtos.BookSessionInput;
import com.mmp.mentoring.entity.MentoringRequest;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.entity.SessionType;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.security.AuthUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.*;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/** US-03 / US-05 — kiểm tra đặt lịch ở tầng service (mock repository + profile-service). */
class SessionBookingTest {

    static final ZoneId VN = ZoneId.of("Asia/Ho_Chi_Minh");
    static final String AGENDA = "Review kien truc REST API cua du an quan ly kho";

    final UUID menteeId = UUID.randomUUID();
    final UUID mentorId = UUID.randomUUID();
    final AuthUser mentee = new AuthUser(menteeId, "mentee@test", "MENTEE");
    TestFixtures f;

    @BeforeEach
    void setUp() {
        f = new TestFixtures();
        MentoringRequest accepted = new MentoringRequest(menteeId, mentorId, null);
        accepted.setStatus(MentoringRequest.Status.ACCEPTED);
        when(f.requestRepo.findFirstByMenteeIdAndMentorIdAndStatus(menteeId, mentorId, MentoringRequest.Status.ACCEPTED))
                .thenReturn(Optional.of(accepted));
        when(f.sessionRepo.findActiveAround(any(), any(), any())).thenReturn(List.of());
    }

    static List<AvailabilitySlot> allWeek() {
        return IntStream.rangeClosed(1, 7).mapToObj(d -> new AvailabilitySlot(UUID.randomUUID(), d, LocalTime.of(6, 0), LocalTime.of(23, 0))).toList();
    }

    ProfileClient.MentorInfo mentor(String status, LocalDate onLeaveUntil, Integer minNotice, List<AvailabilityException> exceptions) {
        return new ProfileClient.MentorInfo(mentorId, "Mentor", List.of(), "backend", "", 5, new BigDecimal("200000"), 3, 0,
                true, 0, 0, "APPROVED", allWeek(), status, onLeaveUntil, null, minNotice, null, "Asia/Ho_Chi_Minh", exceptions);
    }

    static OffsetDateTime daysAhead(int days, int hour) {
        return LocalDate.now(VN).plusDays(days).atTime(hour, 0).atZone(VN).toOffsetDateTime();
    }

    BookSessionInput input(OffsetDateTime start, int duration, String agenda) {
        return new BookSessionInput(menteeId, mentorId, start, duration, SessionType.CODE_REVIEW, agenda, null, null);
    }

    private void givenMentor(ProfileClient.MentorInfo info) {
        when(f.profileClient.findMentor(mentorId)).thenReturn(Optional.of(info));
    }

    private static String code(Runnable r) {
        try {
            r.run();
        } catch (ApiException e) {
            return e.getCode();
        }
        return "OK";
    }

    @Test
    void validBookingIsSavedAsPendingWithFormFields() {
        givenMentor(mentor(null, null, null, null));
        f.service().book(mentee, new BookSessionInput(menteeId, mentorId, daysAhead(3, 10), 45, SessionType.MOCK_INTERVIEW,
                "  " + AGENDA + "  ", "https://github.com/me/repo", null));
        verify(f.sessionRepo).save(argThatSession(s -> s.getStatus() == MentoringSession.Status.PENDING
                && s.getDurationMinutes() == 45 && s.getSessionType() == SessionType.MOCK_INTERVIEW
                && AGENDA.equals(s.getAgenda()) && "https://github.com/me/repo".equals(s.getPreReadLink())
                && s.getPrice().compareTo(new BigDecimal("150000")) == 0));
    }

    @Test
    void formValidation() {
        givenMentor(mentor(null, null, null, null));
        assertThat(code(() -> f.service().book(mentee, input(daysAhead(3, 10), 75, AGENDA)))).isEqualTo("INVALID_DURATION");
        assertThat(code(() -> f.service().book(mentee, input(daysAhead(3, 10), 60, "qua ngan")))).isEqualTo("INVALID_AGENDA");
        assertThat(code(() -> f.service().book(mentee, input(daysAhead(3, 10), 60, "x".repeat(501))))).isEqualTo("INVALID_AGENDA");
        assertThat(code(() -> f.service().book(mentee, new BookSessionInput(menteeId, mentorId, daysAhead(3, 10), 60,
                SessionType.CODE_REVIEW, AGENDA, "ftp://x", null)))).isEqualTo("INVALID_PRE_READ_LINK");
    }

    @Test
    void mentorMinNoticeHoursOverridesPlatformLeadTime() {
        givenMentor(mentor(null, null, 12, null));
        OffsetDateTime in6h = OffsetDateTime.now().plusHours(6).withMinute(0).withSecond(0).withNano(0);
        assertThat(code(() -> f.service().book(mentee, input(in6h, 30, AGENDA)))).isIn("TOO_SOON", "MENTOR_NOT_AVAILABLE");
        // mặc định 12 giờ khi profile-service chưa trả minNoticeHours
        givenMentor(mentor(null, null, null, null));
        OffsetDateTime in3h = OffsetDateTime.now().plusHours(3);
        assertThat(code(() -> f.service().book(mentee, input(in3h, 30, AGENDA)))).isEqualTo("TOO_SOON");
    }

    @Test
    void mentorStatusBlocksBooking() {
        givenMentor(mentor("ON_LEAVE", LocalDate.now(VN).plusDays(5), null, null));
        assertThat(code(() -> f.service().book(mentee, input(daysAhead(3, 10), 60, AGENDA)))).isEqualTo("MENTOR_ON_LEAVE");
        assertThat(code(() -> f.service().book(mentee, input(daysAhead(7, 10), 60, AGENDA)))).isEqualTo("OK");
        givenMentor(mentor("SUSPENDED", null, null, null));
        assertThat(code(() -> f.service().book(mentee, input(daysAhead(3, 10), 60, AGENDA)))).isEqualTo("MENTOR_SUSPENDED");
        givenMentor(mentor("PAUSED", null, null, null));
        assertThat(code(() -> f.service().book(mentee, input(daysAhead(3, 10), 60, AGENDA)))).isEqualTo("OK");
    }

    @Test
    void exceptionDayIsRejected() {
        givenMentor(mentor(null, null, null, List.of(new AvailabilityException(LocalDate.now(VN).plusDays(3), null, null))));
        assertThat(code(() -> f.service().book(mentee, input(daysAhead(3, 10), 60, AGENDA)))).isEqualTo("MENTOR_NOT_AVAILABLE");
    }

    @Test
    void bufferAfterExistingMentorSessionIsEnforced() {
        givenMentor(mentor(null, null, null, null)); // buffer mặc định 15 phút
        MentoringSession existing = new MentoringSession();
        existing.setMentorId(mentorId);
        existing.setMenteeId(UUID.randomUUID());
        existing.setScheduledAt(daysAhead(3, 10));
        existing.setDurationMinutes(60);
        existing.setStatus(MentoringSession.Status.CONFIRMED);
        when(f.sessionRepo.findActiveAround(eq(mentorId), any(), any())).thenReturn(List.of(existing));
        assertThat(code(() -> f.service().book(mentee, input(daysAhead(3, 11), 30, AGENDA)))).isEqualTo("MENTOR_NOT_AVAILABLE");
        assertThat(code(() -> f.service().book(mentee, input(daysAhead(3, 11).plusMinutes(15), 30, AGENDA)))).isEqualTo("OK");
    }

    private static MentoringSession argThatSession(java.util.function.Predicate<MentoringSession> p) {
        return org.mockito.ArgumentMatchers.argThat(p::test);
    }
}
