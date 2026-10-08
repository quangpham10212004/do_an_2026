package com.mmp.payment.service;

import com.mmp.payment.client.MentoringClient;
import com.mmp.payment.client.MentoringClient.PackageInfo;
import com.mmp.payment.client.MentoringClient.SessionInfo;
import com.mmp.payment.dto.PaymentDtos.CardInput;
import com.mmp.payment.dto.PaymentDtos.ChargeRequest;
import com.mmp.payment.dto.PaymentDtos.TransactionResponse;
import com.mmp.payment.entity.Transaction;
import com.mmp.payment.exception.ApiException;
import com.mmp.payment.gateway.PaymentGateway;
import com.mmp.payment.repository.TransactionRepository;
import com.mmp.payment.security.AuthUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/** Thanh toán phiên lẻ và gói buổi, hoàn tiền một phần idempotent, doanh thu ròng. */
class PaymentServiceTest {

    private static final CardInput CARD = new CardInput("4242 4242 4242 4242", "A", "12/30", "123");

    private final UUID menteeId = UUID.randomUUID();
    private final UUID mentorId = UUID.randomUUID();
    private final UUID packageId = UUID.randomUUID();
    private final AuthUser mentee = new AuthUser(menteeId, "m@test.local", "MENTEE");

    private final Map<UUID, Transaction> store = new HashMap<>();
    private TransactionRepository repo;
    private PaymentGateway gateway;
    private MentoringClient mentoringClient;
    private ReferralService referralService;
    private PaymentService service;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        repo = mock(TransactionRepository.class);
        gateway = mock(PaymentGateway.class);
        mentoringClient = mock(MentoringClient.class);
        referralService = mock(ReferralService.class);
        TransactionTemplate tx = mock(TransactionTemplate.class);
        when(tx.execute(any())).thenAnswer(inv -> ((TransactionCallback<?>) inv.getArgument(0)).doInTransaction(null));
        doAnswer(inv -> {
            ((Consumer<Object>) inv.getArgument(0)).accept(null);
            return null;
        }).when(tx).executeWithoutResult(any());

        when(repo.save(any(Transaction.class))).thenAnswer(inv -> persist(inv.getArgument(0)));
        when(repo.saveAndFlush(any(Transaction.class))).thenAnswer(inv -> persist(inv.getArgument(0)));
        when(repo.findById(any(UUID.class))).thenAnswer(inv -> Optional.ofNullable(store.get(inv.<UUID>getArgument(0))));
        when(gateway.charge(any(), any(), anyString(), any())).thenReturn(new PaymentGateway.ChargeResult(true, "sbx_ch_1", null));
        when(gateway.refund(anyString(), any())).thenReturn(new PaymentGateway.ChargeResult(true, "sbx_re_1", null));
        service = new PaymentService(repo, gateway, mentoringClient, referralService, tx);
    }

    private Transaction persist(Transaction t) {
        if (t.getId() == null) ReflectionTestUtils.setField(t, "id", UUID.randomUUID());
        store.put(t.getId(), t);
        return t;
    }

    private void packageIs(String status, BigDecimal price) {
        when(mentoringClient.getPackage(packageId)).thenReturn(new PackageInfo(packageId, menteeId, mentorId, price, status));
    }

    private Transaction paidPackageTransaction(BigDecimal amount) {
        Transaction t = new Transaction();
        t.setPackageId(packageId);
        t.setPayerId(menteeId);
        t.setMentorId(mentorId);
        t.setAmount(amount);
        t.setStatus(Transaction.Status.SUCCESS);
        t.setProviderReference("sbx_ch_1");
        persist(t);
        when(repo.findFirstByPackageIdAndStatusIn(eq(packageId), any())).thenReturn(Optional.of(t));
        return t;
    }

    // ---------------- thanh toán gói ----------------

    @Test
    void chargingAPackageCreatesAPackageTransactionAndActivatesThePackage() {
        packageIs("PENDING_PAYMENT", BigDecimal.valueOf(1_080_000));

        TransactionResponse res = service.charge(mentee, new ChargeRequest(null, packageId, null, CARD));

        assertThat(res.status()).isEqualTo("SUCCESS");
        assertThat(res.packageId()).isEqualTo(packageId);
        assertThat(res.sessionId()).isNull();
        assertThat(res.amount()).isEqualByComparingTo("1080000");
        verify(referralService).onSuccessfulTransaction(any(Transaction.class));
        verify(mentoringClient).notifyPackagePaid(eq(packageId), any(UUID.class));
        verify(mentoringClient, never()).notifyPaymentSucceeded(any(), any());
        assertThat(store.values().iterator().next().isSessionSynced()).isTrue();
    }

    @Test
    void theAmountComesFromTheServerNotTheClient() {
        packageIs("PENDING_PAYMENT", BigDecimal.valueOf(1_080_000));

        assertThatThrownBy(() -> service.charge(mentee, new ChargeRequest(null, packageId, BigDecimal.valueOf(1), CARD)))
                .isInstanceOf(ApiException.class).hasMessageContaining("không khớp");
        verifyNoInteractions(gateway);
    }

    @Test
    void exactlyOneTargetMustBeChosen() {
        assertThatThrownBy(() -> service.charge(mentee, new ChargeRequest(null, null, null, CARD)))
                .isInstanceOf(ApiException.class).hasMessageContaining("một trong");
        assertThatThrownBy(() -> service.charge(mentee, new ChargeRequest(UUID.randomUUID(), packageId, null, CARD)))
                .isInstanceOf(ApiException.class).hasMessageContaining("một trong");
    }

    @Test
    void aPackageNotWaitingForPaymentCannotBeCharged() {
        packageIs("ACTIVE", BigDecimal.valueOf(1_080_000));

        assertThatThrownBy(() -> service.charge(mentee, new ChargeRequest(null, packageId, null, CARD)))
                .isInstanceOf(ApiException.class).hasMessageContaining("chờ thanh toán");
    }

    @Test
    void onlyTheBuyerCanPayForThePackage() {
        packageIs("PENDING_PAYMENT", BigDecimal.valueOf(1_080_000));
        AuthUser stranger = new AuthUser(UUID.randomUUID(), "x@test.local", "MENTEE");

        assertThatThrownBy(() -> service.charge(stranger, new ChargeRequest(null, packageId, null, CARD)))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void aPackageThatWasAlreadyPaidIsRejected() {
        packageIs("PENDING_PAYMENT", BigDecimal.valueOf(1_080_000));
        when(repo.existsByPackageIdAndStatusIn(eq(packageId), any())).thenReturn(true);

        assertThatThrownBy(() -> service.charge(mentee, new ChargeRequest(null, packageId, null, CARD)))
                .isInstanceOf(ApiException.class).hasMessageContaining("đã được thanh toán");
    }

    @Test
    void aDeclinedCardFailsTheTransactionWithoutTouchingThePackage() {
        packageIs("PENDING_PAYMENT", BigDecimal.valueOf(1_080_000));
        when(gateway.charge(any(), any(), anyString(), any())).thenReturn(new PaymentGateway.ChargeResult(false, null, "CARD_DECLINED"));

        TransactionResponse res = service.charge(mentee, new ChargeRequest(null, packageId, null, CARD));

        assertThat(res.status()).isEqualTo("FAILED");
        assertThat(res.failureReason()).isEqualTo("CARD_DECLINED");
        verify(mentoringClient, never()).notifyPackagePaid(any(), any());
        verifyNoInteractions(referralService);
    }

    @Test
    void ifConfirmingThePackageFailsThePaymentStaysSuccessfulAndIsRetriedByTheJob() {
        packageIs("PENDING_PAYMENT", BigDecimal.valueOf(1_080_000));
        doThrow(new RuntimeException("mentoring down")).when(mentoringClient).notifyPackagePaid(any(), any());

        TransactionResponse res = service.charge(mentee, new ChargeRequest(null, packageId, null, CARD));

        assertThat(res.status()).isEqualTo("SUCCESS");
        Transaction t = store.values().iterator().next();
        assertThat(t.isSessionSynced()).isFalse();

        doNothing().when(mentoringClient).notifyPackagePaid(any(), any());
        service.syncSession(t.getId());
        assertThat(t.isSessionSynced()).isTrue();
    }

    @Test
    void chargingASingleSessionStillWorksAsBefore() {
        UUID sessionId = UUID.randomUUID();
        when(mentoringClient.getSession(sessionId)).thenReturn(new SessionInfo(sessionId, menteeId, mentorId,
                OffsetDateTime.now().plusDays(2), 60, BigDecimal.valueOf(300_000), "PENDING"));

        TransactionResponse res = service.charge(mentee, new ChargeRequest(sessionId, null, null, CARD));

        assertThat(res.status()).isEqualTo("SUCCESS");
        assertThat(res.sessionId()).isEqualTo(sessionId);
        assertThat(res.packageId()).isNull();
        verify(mentoringClient).notifyPaymentSucceeded(eq(sessionId), any(UUID.class));
        verify(mentoringClient, never()).notifyPackagePaid(any(), any());
    }

    // ---------------- hoàn tiền ----------------

    @Test
    void refundingPartOfAPackageMarksItPartiallyRefunded() {
        Transaction t = paidPackageTransaction(BigDecimal.valueOf(1_080_000));

        TransactionResponse res = service.refundPackage(packageId, BigDecimal.valueOf(810_000), "PACKAGE_CANCELLED");

        assertThat(res.status()).isEqualTo("PARTIALLY_REFUNDED");
        assertThat(t.getRefundedAmount()).isEqualByComparingTo("810000");
        verify(gateway).refund("sbx_ch_1", BigDecimal.valueOf(810_000));
    }

    @Test
    void repeatingTheSameRefundRequestDoesNotRefundTwice() {
        paidPackageTransaction(BigDecimal.valueOf(1_080_000));

        service.refundPackage(packageId, BigDecimal.valueOf(810_000), "PACKAGE_CANCELLED");
        service.refundPackage(packageId, BigDecimal.valueOf(810_000), "PACKAGE_CANCELLED");

        verify(gateway, times(1)).refund(anyString(), any());
    }

    @Test
    void aLargerCumulativeTotalRefundsOnlyTheDifference() {
        Transaction t = paidPackageTransaction(BigDecimal.valueOf(1_080_000));
        service.refundPackage(packageId, BigDecimal.valueOf(810_000), "PACKAGE_CANCELLED");

        TransactionResponse res = service.refundPackage(packageId, BigDecimal.valueOf(1_080_000), "PACKAGE_CANCELLED");

        verify(gateway).refund("sbx_ch_1", BigDecimal.valueOf(270_000));
        assertThat(res.status()).isEqualTo("REFUNDED");
        assertThat(t.getRefundedAmount()).isEqualByComparingTo("1080000");
    }

    @Test
    void youCannotRefundMoreThanWasPaid() {
        paidPackageTransaction(BigDecimal.valueOf(1_080_000));

        assertThatThrownBy(() -> service.refundPackage(packageId, BigDecimal.valueOf(2_000_000), "x"))
                .isInstanceOf(ApiException.class).hasMessageContaining("không hợp lệ");
        verifyNoInteractions(gateway);
    }

    @Test
    void whenTheGatewayRefusesNothingIsRecorded() {
        Transaction t = paidPackageTransaction(BigDecimal.valueOf(1_080_000));
        when(gateway.refund(anyString(), any())).thenReturn(new PaymentGateway.ChargeResult(false, null, "DENIED"));

        assertThatThrownBy(() -> service.refundPackage(packageId, BigDecimal.valueOf(810_000), "x"))
                .isInstanceOf(ApiException.class);
        assertThat(t.getRefundedAmount()).isEqualByComparingTo("0");
        assertThat(t.getStatus()).isEqualTo(Transaction.Status.SUCCESS);
    }

    @Test
    void aPackageWithoutASuccessfulPaymentCannotBeRefunded() {
        when(repo.findFirstByPackageIdAndStatusIn(eq(packageId), any())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.refundPackage(packageId, BigDecimal.TEN, "x")).isInstanceOf(ApiException.class);
    }

    @Test
    void refundingASessionRecordsTheFullAmountAsRefunded() {
        UUID sessionId = UUID.randomUUID();
        Transaction t = new Transaction();
        t.setSessionId(sessionId);
        t.setPayerId(menteeId);
        t.setMentorId(mentorId);
        t.setAmount(BigDecimal.valueOf(300_000));
        t.setStatus(Transaction.Status.SUCCESS);
        t.setProviderReference("sbx_ch_9");
        persist(t);
        when(repo.findFirstBySessionIdAndStatus(sessionId, Transaction.Status.SUCCESS)).thenReturn(Optional.of(t));

        service.refund(sessionId, "SESSION_CANCELLED");

        assertThat(t.getStatus()).isEqualTo(Transaction.Status.REFUNDED);
        assertThat(t.getRefundedAmount()).isEqualByComparingTo("300000");
    }

    // ---------------- thống kê và đối soát ----------------

    @Test
    void statsCountPartiallyRefundedAsSuccessfulAndReportNetRevenue() {
        when(repo.countByStatus(Transaction.Status.SUCCESS)).thenReturn(5L);
        when(repo.countByStatus(Transaction.Status.PARTIALLY_REFUNDED)).thenReturn(2L);
        when(repo.countByStatus(Transaction.Status.FAILED)).thenReturn(1L);
        when(repo.countByStatus(Transaction.Status.REFUNDED)).thenReturn(3L);
        when(repo.netRevenue()).thenReturn(BigDecimal.valueOf(4_500_000));

        var stats = service.stats();

        assertThat(stats.successCount()).isEqualTo(7);
        assertThat(stats.failedCount()).isEqualTo(1);
        assertThat(stats.refundedCount()).isEqualTo(3);
        assertThat(stats.totalRevenue()).isEqualByComparingTo("4500000");
    }

    @Test
    void reconciliationRetriesBothSuccessfulAndPartiallyRefundedTransactions() {
        service.unsyncedSuccessTransactions();

        verify(repo).findByStatusInAndSessionSyncedFalse(List.of(Transaction.Status.SUCCESS, Transaction.Status.PARTIALLY_REFUNDED));
    }
}
