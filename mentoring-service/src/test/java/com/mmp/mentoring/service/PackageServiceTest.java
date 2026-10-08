package com.mmp.mentoring.service;

import com.mmp.mentoring.client.PaymentClient;
import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.MentoringDtos.PackageOptionsView;
import com.mmp.mentoring.dto.MentoringDtos.PackageView;
import com.mmp.mentoring.dto.MentoringDtos.PurchasePackageInput;
import com.mmp.mentoring.entity.MentoringRequest;
import com.mmp.mentoring.entity.SessionPackage;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.MentoringRequestRepository;
import com.mmp.mentoring.repository.SessionPackageRepository;
import com.mmp.mentoring.security.AuthUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.mmp.mentoring.service.TestSupport.mentor;
import static com.mmp.mentoring.service.TestSupport.tx;
import static com.mmp.mentoring.service.TestSupport.user;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/** Gói buổi: mua, dùng/hoàn buổi, huỷ và hoàn tiền (kể cả khi payment-service lỗi). */
class PackageServiceTest {

    private final UUID menteeId = UUID.randomUUID();
    private final UUID mentorId = UUID.randomUUID();
    private final AuthUser mentee = user(menteeId, "MENTEE");

    private SessionPackageRepository packageRepo;
    private MentoringRequestRepository requestRepo;
    private ProfileClient profileClient;
    private PaymentClient paymentClient;
    private NotificationService notifications;
    private PackageService service;

    @BeforeEach
    void setUp() {
        packageRepo = mock(SessionPackageRepository.class);
        requestRepo = mock(MentoringRequestRepository.class);
        profileClient = mock(ProfileClient.class);
        paymentClient = mock(PaymentClient.class);
        notifications = mock(NotificationService.class);
        when(paymentClient.refundPackage(any(), any(), anyString())).thenReturn(true);
        when(profileClient.findMentor(mentorId)).thenReturn(Optional.of(mentor(mentorId, BigDecimal.valueOf(300_000), 3)));
        when(packageRepo.save(any(SessionPackage.class))).thenAnswer(inv -> {
            SessionPackage p = inv.getArgument(0);
            if (p.getId() == null) ReflectionTestUtils.setField(p, "id", UUID.randomUUID());
            return p;
        });
        service = new PackageService(packageRepo, requestRepo, profileClient, paymentClient, notifications, tx(),
                "4:10,8:15", Duration.ofDays(90), 0, Duration.ofMinutes(30));
    }

    private SessionPackage activePackage(int total, int remaining) {
        SessionPackage p = new SessionPackage(menteeId, mentorId, UUID.randomUUID(), total, 60, 10,
                BigDecimal.valueOf(270_000), BigDecimal.valueOf(270_000L * total));
        ReflectionTestUtils.setField(p, "id", UUID.randomUUID());
        p.setStatus(SessionPackage.Status.ACTIVE);
        p.setSessionsRemaining(remaining);
        p.setExpiresAt(OffsetDateTime.now().plusDays(30));
        when(packageRepo.findById(p.getId())).thenReturn(Optional.of(p));
        when(packageRepo.findByIdForUpdate(p.getId())).thenReturn(Optional.of(p));
        return p;
    }

    // ---------------- mua gói ----------------

    @Test
    void optionsListEachTierWithPriceAndSavings() {
        PackageOptionsView view = service.options(mentorId, 60);

        assertThat(view.singlePrice()).isEqualByComparingTo("300000");
        assertThat(view.options()).hasSize(2);
        assertThat(view.options().get(0).sessions()).isEqualTo(4);
        assertThat(view.options().get(0).unitPrice()).isEqualByComparingTo("270000");
        assertThat(view.options().get(0).totalPrice()).isEqualByComparingTo("1080000");
        assertThat(view.options().get(0).savings()).isEqualByComparingTo("120000");
        assertThat(view.options().get(1).unitPrice()).isEqualByComparingTo("255000");
        assertThat(view.options().get(0).validityDays()).isEqualTo(90);
    }

    @Test
    void aFreeMentorHasNoPackages() {
        when(profileClient.findMentor(mentorId)).thenReturn(Optional.of(mentor(mentorId, BigDecimal.ZERO, 3)));

        assertThat(service.options(mentorId, 60).options()).isEmpty();
        assertThatThrownBy(() -> service.purchase(mentee, new PurchasePackageInput(mentorId, 4, 60)))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void purchaseCreatesAPackageWaitingForPayment() {
        when(requestRepo.findFirstByMenteeIdAndMentorIdAndStatus(menteeId, mentorId, MentoringRequest.Status.ACCEPTED))
                .thenReturn(Optional.of(TestSupport.request(menteeId, mentorId, MentoringRequest.Status.ACCEPTED)));

        PackageView view = service.purchase(mentee, new PurchasePackageInput(mentorId, 4, 60));

        assertThat(view.status()).isEqualTo("PENDING_PAYMENT");
        assertThat(view.sessionsTotal()).isEqualTo(4);
        assertThat(view.sessionsRemaining()).isEqualTo(4);
        assertThat(view.totalPrice()).isEqualByComparingTo("1080000");
    }

    @Test
    void purchaseRequiresAnAcceptedMentoringRelationship() {
        assertThatThrownBy(() -> service.purchase(mentee, new PurchasePackageInput(mentorId, 4, 60)))
                .isInstanceOf(ApiException.class).hasMessageContaining("nhận chính thức");
    }

    @Test
    void purchaseRejectsATierThatIsNotOffered() {
        assertThatThrownBy(() -> service.purchase(mentee, new PurchasePackageInput(mentorId, 5, 60)))
                .isInstanceOf(ApiException.class).hasMessageContaining("Mức gói");
    }

    @Test
    void onlyOneUnpaidPackageAtATimePerMentor() {
        when(requestRepo.findFirstByMenteeIdAndMentorIdAndStatus(menteeId, mentorId, MentoringRequest.Status.ACCEPTED))
                .thenReturn(Optional.of(TestSupport.request(menteeId, mentorId, MentoringRequest.Status.ACCEPTED)));
        SessionPackage unpaid = activePackage(4, 4);
        unpaid.setStatus(SessionPackage.Status.PENDING_PAYMENT);
        when(packageRepo.findByMenteeIdAndMentorIdAndStatusIn(eq(menteeId), eq(mentorId), any()))
                .thenReturn(List.of(unpaid));

        assertThatThrownBy(() -> service.purchase(mentee, new PurchasePackageInput(mentorId, 4, 60)))
                .isInstanceOf(ApiException.class).hasMessageContaining("chờ thanh toán");
    }

    // ---------------- thanh toán xong ----------------

    @Test
    void paymentActivatesThePackageAndSetsItsExpiry() {
        SessionPackage p = activePackage(4, 4);
        p.setStatus(SessionPackage.Status.PENDING_PAYMENT);
        p.setExpiresAt(null);

        service.markPaid(p.getId(), UUID.randomUUID());

        assertThat(p.getStatus()).isEqualTo(SessionPackage.Status.ACTIVE);
        assertThat(p.getExpiresAt()).isAfter(OffsetDateTime.now().plusDays(89));
        verify(notifications, atLeastOnce()).notifyUser(eq(menteeId), eq("PACKAGE_ACTIVATED"), anyString(), anyString(), anyString());
    }

    @Test
    void paymentArrivingAfterTheHoldExpiredIsRefundedInFull() {
        SessionPackage p = activePackage(4, 4);
        p.setStatus(SessionPackage.Status.CANCELLED);

        service.markPaid(p.getId(), UUID.randomUUID());

        verify(paymentClient).refundPackage(eq(p.getId()), argThat(a -> a.compareTo(BigDecimal.valueOf(1_080_000)) == 0), anyString());
        assertThat(p.isRefundPending()).isFalse();
        assertThat(p.getRefundedAmount()).isEqualByComparingTo("1080000");
    }

    // ---------------- dùng và hoàn buổi ----------------

    @Test
    void consumingDecrementsAndTheLastSessionExhaustsThePackage() {
        SessionPackage p = activePackage(4, 2);

        service.consume(p.getId(), menteeId, mentorId, 60);
        assertThat(p.getSessionsRemaining()).isEqualTo(1);
        assertThat(p.getStatus()).isEqualTo(SessionPackage.Status.ACTIVE);

        service.consume(p.getId(), menteeId, mentorId, 60);
        assertThat(p.getSessionsRemaining()).isZero();
        assertThat(p.getStatus()).isEqualTo(SessionPackage.Status.EXHAUSTED);
    }

    @Test
    void consumingFailsForAnExhaustedExpiredOrUnpaidPackage() {
        SessionPackage exhausted = activePackage(4, 0);
        exhausted.setStatus(SessionPackage.Status.EXHAUSTED);
        SessionPackage expired = activePackage(4, 2);
        expired.setExpiresAt(OffsetDateTime.now().minusMinutes(1));
        SessionPackage unpaid = activePackage(4, 4);
        unpaid.setStatus(SessionPackage.Status.PENDING_PAYMENT);

        for (SessionPackage p : List.of(exhausted, expired, unpaid)) {
            assertThatThrownBy(() -> service.consume(p.getId(), menteeId, mentorId, 60))
                    .isInstanceOf(ApiException.class).hasMessageContaining("hết buổi, hết hạn");
        }
    }

    @Test
    void consumingChecksOwnerMentorAndDuration() {
        SessionPackage p = activePackage(4, 4);

        assertThatThrownBy(() -> service.consume(p.getId(), UUID.randomUUID(), mentorId, 60)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> service.consume(p.getId(), menteeId, UUID.randomUUID(), 60)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> service.consume(p.getId(), menteeId, mentorId, 90))
                .isInstanceOf(ApiException.class).hasMessageContaining("60 phút");
        assertThat(p.getSessionsRemaining()).isEqualTo(4);
    }

    @Test
    void cancellingASessionGivesBackTheCreditAndReactivatesAnExhaustedPackage() {
        SessionPackage p = activePackage(4, 0);
        p.setStatus(SessionPackage.Status.EXHAUSTED);

        service.restoreCredit(p.getId());

        assertThat(p.getSessionsRemaining()).isEqualTo(1);
        assertThat(p.getStatus()).isEqualTo(SessionPackage.Status.ACTIVE);
    }

    @Test
    void creditNeverExceedsTheOriginalSessionCount() {
        SessionPackage p = activePackage(4, 4);

        service.restoreCredit(p.getId());

        assertThat(p.getSessionsRemaining()).isEqualTo(4);
    }

    @Test
    void creditReturnedToAClosedPackageBecomesARefundInstead() {
        SessionPackage p = activePackage(4, 0);
        p.setStatus(SessionPackage.Status.CANCELLED);

        service.restoreCredit(p.getId());

        assertThat(p.getSessionsRemaining()).isZero();
        assertThat(p.getRefundDue()).isEqualByComparingTo("270000");
        assertThat(p.isRefundPending()).isTrue();
    }

    @Test
    void settlingNowRefundsAClosedPackageForACreditReturnedAfterClosing() {
        SessionPackage p = activePackage(4, 0);
        p.setStatus(SessionPackage.Status.CANCELLED);
        p.setRefundDue(BigDecimal.valueOf(540_000));
        p.setRefundedAmount(BigDecimal.valueOf(540_000));
        service.restoreCredit(p.getId());

        service.settleRefundNow(p.getId());

        verify(paymentClient).refundPackage(eq(p.getId()), argThat(a -> a.compareTo(BigDecimal.valueOf(810_000)) == 0), anyString());
        assertThat(p.getRefundedAmount()).isEqualByComparingTo("810000");
        assertThat(p.isRefundPending()).isFalse();
    }

    // ---------------- huỷ gói và hoàn tiền ----------------

    @Test
    void cancellingAnActivePackageRefundsTheUnusedSessions() {
        SessionPackage p = activePackage(4, 3);

        PackageView view = service.cancel(mentee, p.getId());

        assertThat(view.status()).isEqualTo("CANCELLED");
        assertThat(p.getSessionsRemaining()).isZero();
        verify(paymentClient).refundPackage(eq(p.getId()), argThat(a -> a.compareTo(BigDecimal.valueOf(810_000)) == 0), anyString());
        assertThat(p.getRefundedAmount()).isEqualByComparingTo("810000");
        assertThat(p.isRefundPending()).isFalse();
    }

    @Test
    void ifThePaymentServiceFailsTheRefundStaysPendingAndIsRetriedLater() {
        SessionPackage p = activePackage(4, 3);
        doThrow(new ApiException(org.springframework.http.HttpStatus.BAD_GATEWAY, "REFUND_FAILED", "lỗi"))
                .doReturn(true).when(paymentClient).refundPackage(any(), any(), anyString());

        service.cancel(mentee, p.getId());
        assertThat(p.getStatus()).isEqualTo(SessionPackage.Status.CANCELLED);
        assertThat(p.isRefundPending()).isTrue();
        assertThat(p.getRefundedAmount()).isEqualByComparingTo("0");

        when(packageRepo.findByRefundPendingTrue()).thenReturn(List.of(p));
        service.retryRefunds();

        assertThat(p.isRefundPending()).isFalse();
        assertThat(p.getRefundedAmount()).isEqualByComparingTo("810000");
    }

    @Test
    void retryingSendsTheCumulativeTotalSoANetworkRetryCannotRefundTwice() {
        SessionPackage p = activePackage(4, 3);
        p.setStatus(SessionPackage.Status.CANCELLED);
        p.setSessionsRemaining(0);
        p.setRefundDue(BigDecimal.valueOf(810_000));
        p.setRefundPending(true);

        when(packageRepo.findByRefundPendingTrue()).thenReturn(List.of(p));

        service.retryRefunds();

        verify(paymentClient).refundPackage(eq(p.getId()), argThat(a -> a.compareTo(BigDecimal.valueOf(810_000)) == 0), anyString());
    }

    @Test
    void cancellingAPackageWithNothingLeftDoesNotCallPayment() {
        SessionPackage p = activePackage(4, 0);

        service.cancel(mentee, p.getId());

        verify(paymentClient, never()).refundPackage(any(), any(), anyString());
        assertThat(p.isRefundPending()).isFalse();
    }

    @Test
    void anUnpaidPackageIsCancelledWithoutAnyRefund() {
        SessionPackage p = activePackage(4, 4);
        p.setStatus(SessionPackage.Status.PENDING_PAYMENT);

        service.cancel(mentee, p.getId());

        assertThat(p.getStatus()).isEqualTo(SessionPackage.Status.CANCELLED);
        verify(paymentClient, never()).refundPackage(any(), any(), anyString());
    }

    @Test
    void onlyThePayerCanCancelAPackage() {
        SessionPackage p = activePackage(4, 4);

        assertThatThrownBy(() -> service.cancel(user(UUID.randomUUID(), "MENTEE"), p.getId()))
                .isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> service.cancel(user(mentorId, "MENTOR"), p.getId()))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void anAlreadyClosedPackageCannotBeCancelledAgain() {
        SessionPackage p = activePackage(4, 0);
        p.setStatus(SessionPackage.Status.EXPIRED);

        assertThatThrownBy(() -> service.cancel(mentee, p.getId())).isInstanceOf(ApiException.class);
    }

    // ---------------- hết hạn ----------------

    @Test
    void anExpiredPackageIsClosedAndItsUnusedSessionsRefunded() {
        SessionPackage p = activePackage(8, 5);
        p.setExpiresAt(OffsetDateTime.now().minusDays(1));
        when(packageRepo.findExpired(any())).thenReturn(List.of(p));

        service.expireDue();

        assertThat(p.getStatus()).isEqualTo(SessionPackage.Status.EXPIRED);
        verify(paymentClient).refundPackage(eq(p.getId()), argThat(a -> a.compareTo(BigDecimal.valueOf(1_350_000)) == 0), anyString());
    }

    @Test
    void anUnpaidPackageIsDroppedAfterThePaymentHold() {
        SessionPackage p = activePackage(4, 4);
        p.setStatus(SessionPackage.Status.PENDING_PAYMENT);
        when(packageRepo.findExpiredPendingPayment(any())).thenReturn(List.of(p));

        service.expireUnpaid();

        assertThat(p.getStatus()).isEqualTo(SessionPackage.Status.CANCELLED);
    }

    @Test
    void endingTheMentoringRelationshipClosesActivePackages() {
        SessionPackage p = activePackage(4, 2);
        when(packageRepo.findByMenteeIdAndMentorIdAndStatusIn(eq(menteeId), eq(mentorId), any())).thenReturn(List.of(p));

        service.endForRelationship(menteeId, mentorId);

        assertThat(p.getStatus()).isEqualTo(SessionPackage.Status.CANCELLED);
        verify(paymentClient).refundPackage(eq(p.getId()), argThat(a -> a.compareTo(BigDecimal.valueOf(540_000)) == 0), anyString());
    }

    @Test
    void ifPaymentHasNoPaidTransactionTheRefundFlagIsClearedInsteadOfRetriedForever() {
        SessionPackage p = activePackage(4, 3);
        when(paymentClient.refundPackage(any(), any(), anyString())).thenReturn(false);

        service.cancel(mentee, p.getId());

        assertThat(p.isRefundPending()).isFalse();
        assertThat(p.getRefundedAmount()).isEqualByComparingTo("0");
        verify(notifications, never()).notifyUser(eq(menteeId), eq("PACKAGE_REFUNDED"), anyString(), anyString(), anyString());
    }
}
