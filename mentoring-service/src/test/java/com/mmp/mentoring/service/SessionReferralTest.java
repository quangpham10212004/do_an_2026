package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.client.ProfileClient.AvailabilitySlot;
import com.mmp.mentoring.dto.MentoringDtos.BookSessionInput;
import com.mmp.mentoring.entity.MentoringRequest;
import com.mmp.mentoring.entity.SessionType;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.security.AuthUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

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

/** Bản chốt v2.0 §11 — mã giới thiệu chỉ dùng ở yêu cầu đặt buổi thường đầu tiên với mentor. */
class SessionReferralTest {

    static final ZoneId VN = ZoneId.of("Asia/Ho_Chi_Minh");
    final UUID menteeId = UUID.randomUUID();
    final UUID mentorId = UUID.randomUUID();
    final AuthUser mentee = new AuthUser(menteeId, "e@test", "MENTEE");
    TestFixtures f;

    @BeforeEach
    void setUp() {
        f = new TestFixtures();
        MentoringRequest accepted = new MentoringRequest(menteeId, mentorId, "x".repeat(60), SessionType.CAREER_ADVICE,
                MentoringRequest.Frequency.WEEKLY, 3, null);
        accepted.setStatus(MentoringRequest.Status.ACCEPTED);
        when(f.requestRepo.findFirstByMenteeIdAndMentorIdAndStatus(menteeId, mentorId, MentoringRequest.Status.ACCEPTED)).thenReturn(Optional.of(accepted));
        when(f.sessionRepo.findActiveAround(any(), any(), any())).thenReturn(List.of());
        List<AvailabilitySlot> week = IntStream.rangeClosed(1, 7).mapToObj(d -> new AvailabilitySlot(UUID.randomUUID(), d, LocalTime.of(6, 0), LocalTime.of(23, 0))).toList();
        when(f.profileClient.findMentor(mentorId)).thenReturn(Optional.of(new ProfileClient.MentorInfo(mentorId, "Mentor", List.of(), "backend", "", 5,
                new BigDecimal("300000"), 3, 0, true, 0, 0, "APPROVED", week, null, null, null, null, null, "Asia/Ho_Chi_Minh", null)));
    }

    private BookSessionInput book(String code) {
        OffsetDateTime start = LocalDate.now(VN).plusDays(3).atTime(10, 0).atZone(VN).toOffsetDateTime();
        return new BookSessionInput(menteeId, mentorId, start, 60, SessionType.CODE_REVIEW, "Review kien truc REST API cua du an", null, null, null, code);
    }

    @Test
    void validCodeIsCheckedBeforeAndRecordedAfterTheSessionIsCreated() {
        when(f.sessionRepo.countRegularWithMentor(menteeId, mentorId)).thenReturn(0L);

        f.service().book(mentee, book("  abcd2345 "));

        verify(f.paymentClient).validateReferral("abcd2345", menteeId, mentorId);
        verify(f.paymentClient).applyReferral(eq("abcd2345"), eq(menteeId), eq(mentorId), any());
    }

    @Test
    void codeIsRefusedWhenThePairAlreadyHasASession() {
        when(f.sessionRepo.countRegularWithMentor(menteeId, mentorId)).thenReturn(1L);

        try {
            f.service().book(mentee, book("ABCD2345"));
            throw new AssertionError("expected ApiException");
        } catch (ApiException e) {
            assertThat(e.getCode()).isEqualTo("REFERRAL_NOT_FIRST_BOOKING");
        }
        verify(f.paymentClient, never()).validateReferral(any(), any(), any());
        verify(f.sessionRepo, never()).save(any());
    }

    @Test
    void invalidCodeStopsTheBookingBeforeAnySessionExists() {
        when(f.sessionRepo.countRegularWithMentor(menteeId, mentorId)).thenReturn(0L);
        doThrow(ApiException.badRequest("REFERRAL_CODE_NOT_FOUND", "x")).when(f.paymentClient).validateReferral(any(), any(), any());

        try {
            f.service().book(mentee, book("NOPE0000"));
            throw new AssertionError("expected ApiException");
        } catch (ApiException e) {
            assertThat(e.getCode()).isEqualTo("REFERRAL_CODE_NOT_FOUND");
        }
        verify(f.sessionRepo, never()).save(any());
        verify(f.paymentClient, never()).applyReferral(any(), any(), any(), any());
    }

    @Test
    void bookingWithoutACodeTouchesNoReferralEndpoint() {
        f.service().book(mentee, book(null));
        verify(f.paymentClient, never()).validateReferral(any(), any(), any());
        verify(f.paymentClient, never()).applyReferral(any(), any(), any(), any());
    }
}
