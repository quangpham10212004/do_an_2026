package com.mmp.payment.service;

import com.mmp.payment.client.MentoringClient;
import com.mmp.payment.dto.PaymentDtos.CardInput;
import com.mmp.payment.dto.PaymentDtos.ChargeRequest;
import com.mmp.payment.dto.PaymentDtos.TransactionResponse;
import com.mmp.payment.entity.ChargeIdempotencyKey;
import com.mmp.payment.entity.Refund;
import com.mmp.payment.entity.Transaction;
import com.mmp.payment.exception.ApiException;
import com.mmp.payment.gateway.PaymentGateway;
import com.mmp.payment.repository.ChargeIdempotencyKeyRepository;
import com.mmp.payment.repository.RefundRepository;
import com.mmp.payment.repository.TransactionRepository;
import com.mmp.payment.security.AuthUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.*;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** Thanh toán gói buổi: charge theo packageId, Idempotency-Key theo mục tiêu, hoàn tiền theo tổng luỹ kế. */
class PackagePaymentTest {

    private final TransactionRepository txRepo = mock(TransactionRepository.class);
    private final RefundRepository refundRepo = mock(RefundRepository.class);
    private final ChargeIdempotencyKeyRepository idemRepo = mock(ChargeIdempotencyKeyRepository.class);
    private final PaymentGateway gateway = mock(PaymentGateway.class);
    private final MentoringClient mentoring = mock(MentoringClient.class);
    private final TransactionTemplate tx = mock(TransactionTemplate.class);

    private final Map<UUID, Transaction> transactions = new HashMap<>();
    private final Map<String, ChargeIdempotencyKey> keys = new HashMap<>();
    private final List<Refund> refunds = new ArrayList<>();

    private final UUID mentee = UUID.randomUUID();
    private final UUID mentor = UUID.randomUUID();
    private final UUID packageId = UUID.randomUUID();
    private final AuthUser payer = new AuthUser(mentee, "m@test.local", "MENTEE");
    private final CardInput card = new CardInput("4242424242424242", "A", "12/30", "123");
    private final ChargeRequest request = new ChargeRequest(null, packageId, null, card);

    private PaymentService service;

    @BeforeEach
    void setUp() {
        when(tx.execute(any())).thenAnswer(inv -> inv.<TransactionCallback<?>>getArgument(0).doInTransaction(null));
        doAnswer(inv -> {
            inv.<Consumer<TransactionStatus>>getArgument(0).accept(null);
            return null;
        }).when(tx).executeWithoutResult(any());

        when(txRepo.save(any())).thenAnswer(inv -> store(inv.getArgument(0)));
        when(txRepo.saveAndFlush(any())).thenAnswer(inv -> store(inv.getArgument(0)));
        when(txRepo.findById(any())).thenAnswer(inv -> Optional.ofNullable(transactions.get(inv.<UUID>getArgument(0))));
        when(txRepo.existsByPackageIdAndStatusIn(any(), any())).thenAnswer(inv -> transactions.values().stream()
                .anyMatch(t -> inv.getArgument(0).equals(t.getPackageId()) && inv.<Collection<?>>getArgument(1).contains(t.getStatus())));
        when(txRepo.lockByPackageIdAndStatusIn(any(), any())).thenAnswer(inv -> transactions.values().stream()
                .filter(t -> inv.getArgument(0).equals(t.getPackageId()) && inv.<Collection<?>>getArgument(1).contains(t.getStatus()))
                .toList());

        when(idemRepo.findByUserIdAndIdemKey(any(), any())).thenAnswer(inv ->
                Optional.ofNullable(keys.get(inv.getArgument(0) + "/" + inv.getArgument(1))));
        when(idemRepo.saveAndFlush(any())).thenAnswer(inv -> {
            ChargeIdempotencyKey k = inv.getArgument(0);
            ReflectionTestUtils.setField(k, "id", UUID.randomUUID());
            keys.put(k.getUserId() + "/" + k.getIdemKey(), k);
            return k;
        });
        when(refundRepo.save(any())).thenAnswer(inv -> {
            Refund r = inv.getArgument(0);
            refunds.add(r);
            return r;
        });
        when(refundRepo.sumByTransactionId(any())).thenAnswer(inv -> refunds.stream()
                .filter(r -> r.getTransactionId().equals(inv.getArgument(0))).map(Refund::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add));
        when(refundRepo.findByTransactionIdInOrderByCreatedAtAsc(any())).thenAnswer(inv -> refunds.stream()
                .filter(r -> inv.<Collection<?>>getArgument(0).contains(r.getTransactionId())).toList());

        when(mentoring.getPackage(packageId)).thenReturn(new MentoringClient.PackageInfo(packageId, mentee, mentor,
                new BigDecimal("1080000"), "PENDING_PAYMENT"));
        when(gateway.charge(any(), any(), any(), any())).thenAnswer(inv ->
                new PaymentGateway.ChargeResult(true, "sbx_ch_" + inv.getArgument(0), null));
        when(gateway.refund(any(), any())).thenReturn(new PaymentGateway.ChargeResult(true, "sbx_re_1", null));

        service = new PaymentService(txRepo, refundRepo, idemRepo, gateway, mentoring, mock(ReferralService.class), tx,
                new BigDecimal("0.15"), Duration.ofHours(24));
    }

    private Transaction store(Transaction t) {
        if (t.getId() == null) ReflectionTestUtils.setField(t, "id", UUID.randomUUID());
        transactions.put(t.getId(), t);
        return t;
    }

    private static String code(Runnable r) {
        try {
            r.run();
        } catch (ApiException e) {
            return e.getCode();
        }
        return null;
    }

    @Test
    void chargingAPackageCreatesAPackageTransactionWithFeeAndConfirmsIt() {
        TransactionResponse res = service.charge(payer, "pk-1", request);

        assertThat(res.status()).isEqualTo("SUCCESS");
        assertThat(res.packageId()).isEqualTo(packageId);
        assertThat(res.sessionId()).isNull();
        assertThat(res.amount()).isEqualByComparingTo("1080000");
        assertThat(res.fee()).isEqualByComparingTo("162000");
        assertThat(res.mentorEarning()).isEqualByComparingTo("918000");
        verify(mentoring).notifyPackagePaid(eq(packageId), any());
        verify(mentoring, never()).notifyPaymentSucceeded(any(), any());
    }

    @Test
    void exactlyOneTargetIsRequired() {
        assertThat(code(() -> service.charge(payer, "k", new ChargeRequest(null, null, null, card)))).isEqualTo("CHARGE_TARGET_REQUIRED");
        assertThat(code(() -> service.charge(payer, "k", new ChargeRequest(UUID.randomUUID(), packageId, null, card))))
                .isEqualTo("CHARGE_TARGET_REQUIRED");
        verifyNoInteractions(gateway);
    }

    @Test
    void onlyThePurchaserCanPayAndOnlyPendingPackagesArePayable() {
        AuthUser other = new AuthUser(UUID.randomUUID(), "o@test.local", "MENTEE");
        assertThat(code(() -> service.charge(other, "k1", request))).isEqualTo("FORBIDDEN");

        when(mentoring.getPackage(packageId)).thenReturn(new MentoringClient.PackageInfo(packageId, mentee, mentor,
                new BigDecimal("1080000"), "ACTIVE"));
        assertThat(code(() -> service.charge(payer, "k2", request))).isEqualTo("PACKAGE_NOT_PAYABLE");

        when(mentoring.getPackage(packageId)).thenReturn(new MentoringClient.PackageInfo(packageId, mentee, mentor,
                BigDecimal.ZERO, "PENDING_PAYMENT"));
        assertThat(code(() -> service.charge(payer, "k3", request))).isEqualTo("FREE_PACKAGE");

        when(mentoring.getPackage(packageId)).thenReturn(new MentoringClient.PackageInfo(packageId, mentee, mentor,
                new BigDecimal("1080000"), "PENDING_PAYMENT"));
        assertThat(code(() -> service.charge(payer, "k4", new ChargeRequest(null, packageId, new BigDecimal("5"), card))))
                .isEqualTo("AMOUNT_MISMATCH");
        verifyNoInteractions(gateway);
    }

    @Test
    void aPaidPackageCannotBePaidTwice() {
        service.charge(payer, "pk-1", request);
        assertThat(code(() -> service.charge(payer, "pk-2", request))).isEqualTo("ALREADY_PAID");
        verify(gateway, times(1)).charge(any(), any(), any(), any());
    }

    @Test
    void sameKeyReplaysForTheSamePackageButNotForAnotherTarget() {
        TransactionResponse first = service.charge(payer, "pk-1", request);
        TransactionResponse again = service.charge(payer, "pk-1", request);

        assertThat(again.id()).isEqualTo(first.id());
        verify(gateway, times(1)).charge(any(), any(), any(), any());
        assertThat(code(() -> service.charge(payer, "pk-1", new ChargeRequest(UUID.randomUUID(), null, null, card))))
                .isEqualTo("IDEMPOTENCY_KEY_REUSED");
        assertThat(code(() -> service.charge(payer, "pk-1", new ChargeRequest(null, UUID.randomUUID(), null, card))))
                .isEqualTo("IDEMPOTENCY_KEY_REUSED");
    }

    @Test
    void unsyncedPackagePaymentIsRetriedThroughThePackageEndpoint() {
        doThrow(new RuntimeException("mentoring down")).when(mentoring).notifyPackagePaid(any(), any());
        TransactionResponse res = service.charge(payer, "pk-1", request);
        assertThat(transactions.get(res.id()).isSessionSynced()).isFalse();

        doNothing().when(mentoring).notifyPackagePaid(any(), any());
        service.syncSession(res.id());

        assertThat(transactions.get(res.id()).isSessionSynced()).isTrue();
        verify(mentoring, times(2)).notifyPackagePaid(eq(packageId), eq(res.id()));
    }

    // ---------- hoàn tiền theo tổng luỹ kế ----------

    @Test
    void refundByCumulativeTotalIsIdempotent() {
        TransactionResponse paid = service.charge(payer, "pk-1", request);

        TransactionResponse first = service.refundPackage(packageId, new BigDecimal("270000"), "PACKAGE_CANCELLED");
        assertThat(first.status()).isEqualTo("PARTIALLY_REFUNDED");
        assertThat(first.refundedAmount()).isEqualByComparingTo("270000");

        // gọi lại cùng tổng (vd. mất phản hồi): không hoàn thêm
        TransactionResponse retry = service.refundPackage(packageId, new BigDecimal("270000"), "PACKAGE_CANCELLED");
        assertThat(retry.refundedAmount()).isEqualByComparingTo("270000");
        assertThat(refunds).hasSize(1);
        verify(gateway, times(1)).refund(any(), any());

        // tổng mới lớn hơn: chỉ hoàn phần chênh
        TransactionResponse more = service.refundPackage(packageId, new BigDecimal("540000"), "PACKAGE_EXPIRED");
        assertThat(more.refundedAmount()).isEqualByComparingTo("540000");
        assertThat(refunds).hasSize(2);
        assertThat(refunds.get(1).getAmount()).isEqualByComparingTo("270000");
        assertThat(transactions.get(paid.id()).getStatus()).isEqualTo(Transaction.Status.PARTIALLY_REFUNDED);
    }

    @Test
    void refundingEverythingMarksTheTransactionRefunded() {
        TransactionResponse paid = service.charge(payer, "pk-1", request);
        TransactionResponse res = service.refundPackage(packageId, new BigDecimal("1080000"), null);

        assertThat(res.status()).isEqualTo("REFUNDED");
        assertThat(refunds.get(0).getReason()).isEqualTo("PACKAGE_UNUSED_SESSIONS");
        assertThat(transactions.get(paid.id()).getStatus()).isEqualTo(Transaction.Status.REFUNDED);
    }

    @Test
    void refundCannotExceedWhatWasPaidAndNeedsAPaidTransaction() {
        assertThat(code(() -> service.refundPackage(packageId, new BigDecimal("1000"), null))).isEqualTo("NO_SUCCESS_TRANSACTION");

        service.charge(payer, "pk-1", request);
        assertThat(code(() -> service.refundPackage(packageId, new BigDecimal("1080001"), null))).isEqualTo("REFUND_EXCEEDS_AMOUNT");
        assertThat(refunds).isEmpty();
    }

    @Test
    void aGatewayFailureLeavesNothingRefundedSoTheCallerCanRetry() {
        service.charge(payer, "pk-1", request);
        when(gateway.refund(any(), any())).thenReturn(new PaymentGateway.ChargeResult(false, null, "DECLINED"));

        assertThat(code(() -> service.refundPackage(packageId, new BigDecimal("270000"), null))).isEqualTo("REFUND_FAILED");
        assertThat(refunds).isEmpty();
    }
}
