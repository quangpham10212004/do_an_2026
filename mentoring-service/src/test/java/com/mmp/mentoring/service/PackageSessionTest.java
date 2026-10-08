package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.MentoringDtos.BookSessionInput;
import com.mmp.mentoring.entity.MentoringRequest;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.entity.MentoringSession.Attendance;
import com.mmp.mentoring.entity.SessionType;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.security.AuthUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/** Phiên dùng gói buổi: đặt (trừ buổi), huỷ theo chính sách (trả buổi) và kết luận tham dự (trả buổi khi mentor lỗi). */
class PackageSessionTest {

    static final ZoneId VN = ZoneId.of("Asia/Ho_Chi_Minh");
    static final String AGENDA = "Review kien truc REST API cua du an quan ly kho";

    final UUID menteeId = UUID.randomUUID();
    final UUID mentorId = UUID.randomUUID();
    final UUID packageId = UUID.randomUUID();
    final AuthUser mentee = new AuthUser(menteeId, "e@test", "MENTEE");
    final AuthUser mentor = new AuthUser(mentorId, "m@test", "MENTOR");
    TestFixtures f;

    @BeforeEach
    void setUp() {
        f = new TestFixtures();
        MentoringRequest accepted = new MentoringRequest(menteeId, mentorId, "x".repeat(60), SessionType.CAREER_ADVICE,
                MentoringRequest.Frequency.WEEKLY, 3, null);
        accepted.setStatus(MentoringRequest.Status.ACCEPTED);
        when(f.requestRepo.findFirstByMenteeIdAndMentorIdAndStatus(menteeId, mentorId, MentoringRequest.Status.ACCEPTED))
                .thenReturn(Optional.of(accepted));
        when(f.sessionRepo.findActiveAround(any(), any(), any())).thenReturn(List.of());
        when(f.profileClient.findMentor(mentorId)).thenReturn(Optional.of(TestSupport.mentor(mentorId, new BigDecimal("300000"), 3)));
    }

    static OffsetDateTime daysAhead(int days, int hour) {
        return LocalDate.now(VN).plusDays(days).atTime(hour, 0).atZone(VN).toOffsetDateTime();
    }

    private BookSessionInput viaPackage(OffsetDateTime start) {
        return new BookSessionInput(menteeId, mentorId, start, 60, SessionType.CODE_REVIEW, AGENDA, null, null, packageId);
    }

    private MentoringSession packageSession(MentoringSession.Status status, OffsetDateTime start) {
        MentoringSession s = new MentoringSession();
        ReflectionTestUtils.setField(s, "id", UUID.randomUUID());
        s.setMenteeId(menteeId);
        s.setMentorId(mentorId);
        s.setDurationMinutes(60);
        s.setPrice(BigDecimal.ZERO);
        s.setPackageId(packageId);
        s.setStatus(status);
        s.setScheduledAt(start);
        when(f.sessionRepo.findById(s.getId())).thenReturn(Optional.of(s));
        when(f.sessionRepo.findForUpdate(s.getId())).thenReturn(Optional.of(s));
        return s;
    }

    private static String code(Runnable r) {
        try {
            r.run();
        } catch (ApiException e) {
            return e.getCode();
        }
        return "OK";
    }

    // ---------- đặt phiên bằng gói ----------

    @Test
    void bookingWithAPackageConsumesOneSessionAndIsConfirmedWithoutPayment() {
        var view = f.service().book(mentee, viaPackage(daysAhead(3, 10)));

        verify(f.packages).consume(packageId, menteeId, mentorId, 60);
        assertThat(view.status()).isEqualTo("CONFIRMED");
        assertThat(view.price()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(view.packageId()).isEqualTo(packageId);
        assertThat(view.kind()).isEqualTo("REGULAR");
    }

    @Test
    void anUnusablePackageBlocksTheBookingAndSavesNothing() {
        when(f.packages.consume(any(), any(), any(), anyInt()))
                .thenThrow(ApiException.conflict("PACKAGE_NOT_USABLE", "Gói đã hết buổi"));

        assertThat(code(() -> f.service().book(mentee, viaPackage(daysAhead(3, 10))))).isEqualTo("PACKAGE_NOT_USABLE");
        verify(f.sessionRepo, never()).save(any());
    }

    @Test
    void aRegularBookingStillChargesTheMentorsRateAndSkipsPackages() {
        var view = f.service().book(mentee, new BookSessionInput(menteeId, mentorId, daysAhead(3, 10), 60, SessionType.CODE_REVIEW,
                AGENDA, null, null));

        assertThat(view.status()).isEqualTo("PENDING");
        assertThat(view.price()).isEqualByComparingTo("300000");
        assertThat(view.packageId()).isNull();
        verifyNoInteractions(f.packages);
    }

    // ---------- huỷ phiên dùng gói ----------

    @Test
    void earlyMenteeCancelReturnsTheSessionToThePackageWithoutAMoneyRefund() {
        MentoringSession s = packageSession(MentoringSession.Status.CONFIRMED, OffsetDateTime.now().plusDays(4));

        var preview = f.service().cancelPreview(mentee, s.getId());
        assertThat(preview.refundPercent()).isEqualTo(100);
        assertThat(preview.refundAmount()).isEqualByComparingTo("0");
        assertThat(preview.policyText()).contains("trả lại vào gói");

        var view = f.service().cancel(mentee, s.getId(), null);

        assertThat(view.status()).isEqualTo("CANCELLED");
        verify(f.packages).restoreCredit(packageId);
        verify(f.packages).settleRefundNow(packageId);
        verify(f.paymentClient, never()).refund(any(), anyString(), anyInt());
    }

    @Test
    void lateMenteeCancelKeepsTheSessionConsumed() {
        MentoringSession s = packageSession(MentoringSession.Status.CONFIRMED, OffsetDateTime.now().plusHours(20));

        var preview = f.service().cancelPreview(mentee, s.getId());
        assertThat(preview.refundPercent()).isZero();
        assertThat(preview.policyText()).contains("vẫn bị tính là đã dùng");

        f.service().cancel(mentee, s.getId(), null);

        verify(f.packages, never()).restoreCredit(any());
        verify(f.paymentClient, never()).refund(any(), anyString(), anyInt());
    }

    @Test
    void mentorCancelAlwaysReturnsTheSessionAndPaysApologyPointsAndStrike() {
        MentoringSession s = packageSession(MentoringSession.Status.CONFIRMED, OffsetDateTime.now().plusHours(3));

        f.service().cancel(mentor, s.getId(), null);

        verify(f.packages).restoreCredit(packageId);
        verify(f.outbox).enqueueReward(eq(menteeId), eq(20), eq(PaymentOutboxService.MENTOR_CANCEL_APOLOGY), any());
        verify(f.strikes).record(eq(mentorId), eq(s.getId()), any());
        verify(f.paymentClient, never()).refund(any(), anyString(), anyInt());
    }

    @Test
    void aPlainPaidSessionStillRefundsThroughPaymentAndTouchesNoPackage() {
        MentoringSession s = packageSession(MentoringSession.Status.CONFIRMED, OffsetDateTime.now().plusDays(4));
        s.setPackageId(null);
        s.setPrice(new BigDecimal("200000"));

        f.service().cancel(mentee, s.getId(), null);

        verify(f.paymentClient).refund(any(), eq("SESSION_CANCELLED_BY_MENTEE"), eq(100));
        verifyNoInteractions(f.packages);
    }

    // ---------- kết luận tham dự ----------

    private AttendanceService attendance() {
        return new AttendanceService(f.sessionRepo, f.outbox, f.strikes, f.packages, f.notifications, mock(DisputeHook.class), f.tx,
                Duration.ofHours(48), "Asia/Ho_Chi_Minh");
    }

    /** Hết cửa sổ 48 giờ: job kết luận phiên (bên chưa trả lời coi là im lặng). */
    private void windowCloses(MentoringSession s) {
        when(f.sessionRepo.findIdsEndedBefore(eq("AWAITING_ATTENDANCE"), any())).thenReturn(List.of(s.getId().toString()));
        attendance().resolveExpired(OffsetDateTime.now().plusDays(3));
    }

    @Test
    void mentorNoShowReturnsTheSessionToThePackage() {
        MentoringSession s = packageSession(MentoringSession.Status.AWAITING_ATTENDANCE, OffsetDateTime.now().minusMinutes(70));

        attendance().answer(mentee, s.getId(), Attendance.MENTOR_NO_SHOW);
        windowCloses(s);

        assertThat(s.getStatus()).isEqualTo(MentoringSession.Status.NO_SHOW_MENTOR);
        verify(f.packages).restoreCredit(packageId);
        verify(f.packages).settleRefundNow(packageId);
        verify(f.outbox, never()).enqueueRefund(any(), anyInt(), any());
    }

    @Test
    void menteeNoShowAndNormalCompletionKeepTheSessionConsumed() {
        MentoringSession noShow = packageSession(MentoringSession.Status.AWAITING_ATTENDANCE, OffsetDateTime.now().minusMinutes(70));
        attendance().answer(mentor, noShow.getId(), Attendance.MENTEE_NO_SHOW);
        windowCloses(noShow);
        assertThat(noShow.getStatus()).isEqualTo(MentoringSession.Status.NO_SHOW_MENTEE);

        MentoringSession held = packageSession(MentoringSession.Status.AWAITING_ATTENDANCE, OffsetDateTime.now().minusMinutes(70));
        attendance().answer(mentee, held.getId(), Attendance.HELD);
        attendance().completeByMentor(mentor, held.getId());
        assertThat(held.getStatus()).isEqualTo(MentoringSession.Status.COMPLETED);

        verify(f.packages, never()).restoreCredit(any());
    }
}
