package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.MentoringDtos.BookSessionInput;
import com.mmp.mentoring.entity.MentoringRequest;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.entity.SessionType;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.security.AuthUser;
import com.mmp.mentoring.client.ProfileClient.AvailabilitySlot;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/** Bản chốt v2.0 §10 — buổi trải nghiệm 15 phút, 30.000đ, mỗi cặp một lần, không cần quan hệ mentoring. */
class SessionTrialTest {

    static final ZoneId VN = ZoneId.of("Asia/Ho_Chi_Minh");
    static final String AGENDA = "Lam quen va hoi ve lo trinh hoc backend Java";

    final UUID menteeId = UUID.randomUUID();
    final UUID mentorId = UUID.randomUUID();
    final AuthUser mentee = new AuthUser(menteeId, "e@test", "MENTEE");
    TestFixtures f;

    @BeforeEach
    void setUp() {
        f = new TestFixtures();
        when(f.requestRepo.findFirstByMenteeIdAndMentorIdAndStatus(any(), any(), any())).thenReturn(Optional.empty());
        when(f.sessionRepo.findActiveAround(any(), any(), any())).thenReturn(List.of());
    }

    static List<AvailabilitySlot> allWeek() {
        return IntStream.rangeClosed(1, 7).mapToObj(d -> new AvailabilitySlot(UUID.randomUUID(), d, LocalTime.of(6, 0), LocalTime.of(23, 0))).toList();
    }

    ProfileClient.MentorInfo mentor(Boolean trialEnabled, String verification) {
        return new ProfileClient.MentorInfo(mentorId, "Mentor", List.of(), "backend", "", 5, new BigDecimal("300000"), 3, 0,
                true, 0, 0, verification, allWeek(), null, null, null, null, null, "Asia/Ho_Chi_Minh", null, trialEnabled);
    }

    static OffsetDateTime daysAhead(int days, int hour) {
        return LocalDate.now(VN).plusDays(days).atTime(hour, 0).atZone(VN).toOffsetDateTime();
    }

    BookSessionInput trial(int minutes) {
        return new BookSessionInput(menteeId, mentorId, daysAhead(3, 10), minutes, SessionType.CAREER_ADVICE, AGENDA, null, null, "TRIAL");
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
    void trialIsFifteenMinutesAtTheFlatFeeWithoutAnAcceptedRequest() {
        when(f.profileClient.findMentor(mentorId)).thenReturn(Optional.of(mentor(null, "APPROVED")));

        f.service().book(mentee, trial(15));

        assertThat(f.lastSaved.getKind()).isEqualTo(MentoringSession.Kind.TRIAL);
        assertThat(f.lastSaved.getDurationMinutes()).isEqualTo(15);
        assertThat(f.lastSaved.getPrice()).isEqualByComparingTo("30000");   // không phụ thuộc giá 300.000 của mentor
        assertThat(f.lastSaved.getRequestId()).isNull();
        assertThat(f.lastSaved.getStatus()).isEqualTo(MentoringSession.Status.PENDING);
        verify(f.trials).claim(eq(menteeId), eq(mentorId), any());
        verify(f.paymentClient).payFromWallet(eq(menteeId), any());
    }

    @Test
    void trialDurationIsFixed() {
        when(f.profileClient.findMentor(mentorId)).thenReturn(Optional.of(mentor(null, "APPROVED")));
        assertThat(code(() -> f.service().book(mentee, trial(60)))).isEqualTo("INVALID_DURATION");
        assertThat(code(() -> f.service().book(mentee, trial(30)))).isEqualTo("INVALID_DURATION");
        verify(f.trials, never()).claim(any(), any(), any());
    }

    @Test
    void mentorCanSwitchTrialsOff() {
        when(f.profileClient.findMentor(mentorId)).thenReturn(Optional.of(mentor(false, "APPROVED")));
        assertThat(code(() -> f.service().book(mentee, trial(15)))).isEqualTo("TRIAL_DISABLED");
    }

    @Test
    void unapprovedMentorCannotTakeTrials() {
        when(f.profileClient.findMentor(mentorId)).thenReturn(Optional.of(mentor(null, "PENDING_REVIEW")));
        assertThat(code(() -> f.service().book(mentee, trial(15)))).isEqualTo("MENTOR_NOT_AVAILABLE");
    }

    @Test
    void trialIsRefusedOnceAlreadyAcceptedByThatMentor() {
        MentoringRequest accepted = new MentoringRequest(menteeId, mentorId, "x".repeat(60), SessionType.CAREER_ADVICE,
                MentoringRequest.Frequency.WEEKLY, 3, null);
        accepted.setStatus(MentoringRequest.Status.ACCEPTED);
        when(f.requestRepo.findFirstByMenteeIdAndMentorIdAndStatus(menteeId, mentorId, MentoringRequest.Status.ACCEPTED))
                .thenReturn(Optional.of(accepted));
        when(f.profileClient.findMentor(mentorId)).thenReturn(Optional.of(mentor(null, "APPROVED")));
        assertThat(code(() -> f.service().book(mentee, trial(15)))).isEqualTo("TRIAL_NOT_ALLOWED");
    }

    @Test
    void secondTrialWithTheSameMentorIsRefused() {
        when(f.profileClient.findMentor(mentorId)).thenReturn(Optional.of(mentor(null, "APPROVED")));
        doThrow(ApiException.conflict("TRIAL_ALREADY_USED", "x")).when(f.trials).claim(any(), any(), any());
        assertThat(code(() -> f.service().book(mentee, trial(15)))).isEqualTo("TRIAL_ALREADY_USED");
    }

    @Test
    void openTrialLimitIsEnforced() {
        when(f.profileClient.findMentor(mentorId)).thenReturn(Optional.of(mentor(null, "APPROVED")));
        doThrow(ApiException.conflict("TRIAL_LIMIT", "x")).when(f.trials).requireBelowOpenLimit(any(), any());
        assertThat(code(() -> f.service().book(mentee, trial(15)))).isEqualTo("TRIAL_LIMIT");
    }

    // ---- hoàn lại lượt ----

    private MentoringSession trialSession(MentoringSession.Status status, OffsetDateTime start) {
        MentoringSession s = new MentoringSession();
        s.setMentorId(mentorId);
        s.setMenteeId(menteeId);
        s.setDurationMinutes(15);
        s.setKind(MentoringSession.Kind.TRIAL);
        s.setPrice(new BigDecimal("30000"));
        s.setStatus(status);
        s.setScheduledAt(start);
        ReflectionTestUtils.setField(s, "id", UUID.randomUUID());
        when(f.sessionRepo.findById(s.getId())).thenReturn(Optional.of(s));
        return s;
    }

    @Test
    void earlyCancellationGivesTheTrialBack() {
        MentoringSession s = trialSession(MentoringSession.Status.CONFIRMED, OffsetDateTime.now().plusHours(5));
        f.service().cancel(mentee, s.getId(), null);
        assertThat(s.getRefundPercent()).isEqualTo(100);
        verify(f.trials).restore(s.getId());
    }

    @Test
    void lateCancellationBurnsTheTrial() {
        MentoringSession s = trialSession(MentoringSession.Status.CONFIRMED, OffsetDateTime.now().plusMinutes(90));
        f.service().cancel(mentee, s.getId(), null);
        assertThat(s.getRefundPercent()).isZero();
        verify(f.trials, never()).restore(any());
    }

    @Test
    void mentorDecliningGivesTheTrialBack() {
        MentoringSession s = trialSession(MentoringSession.Status.AWAITING_MENTOR, OffsetDateTime.now().plusDays(2));
        f.service().decline(new AuthUser(mentorId, "m@test", "MENTOR"), s.getId(), null);
        verify(f.trials).restore(s.getId());
    }
}
