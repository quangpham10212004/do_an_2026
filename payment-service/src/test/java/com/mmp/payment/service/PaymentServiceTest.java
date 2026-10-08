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
import java.time.OffsetDateTime;
import java.util.*;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** US-13 — charge idempotent + phí chốt lúc charge, hoàn tiền một phần (bảng refunds), tạm giữ/giải phóng. */
class PaymentServiceTest {

    private final TransactionRepository txRepo = mock(TransactionRepository.class);
    private final RefundRepository refundRepo = mock(RefundRepository.class);
    private final ChargeIdempotencyKeyRepository idemRepo = mock(ChargeIdempotencyKeyRepository.class);
    private final PaymentGateway gateway = mock(PaymentGateway.class);
    private final MentoringClient mentoring = mock(MentoringClient.class);
    private final ReferralService referrals = mock(ReferralService.class);
    private final TransactionTemplate tx = mock(TransactionTemplate.class);
    private final EarningService earnings = mock(EarningService.class);
    private final com.mmp.payment.client.AuditClient audit = mock(com.mmp.payment.client.AuditClient.class);

    /** "Bảng" giao dịch / key / refund trong bộ nhớ. */
    private final Map<UUID, Transaction> transactions = new HashMap<>();
    private final Map<String, ChargeIdempotencyKey> keys = new HashMap<>();
    private final List<Refund> refunds = new ArrayList<>();

    private final UUID mentee = UUID.randomUUID();
    private final UUID mentor = UUID.randomUUID();
    private final UUID sessionId = UUID.randomUUID();
    private final AuthUser payer = new AuthUser(mentee, "m@test.local", "MENTEE");
    private final ChargeRequest request = new ChargeRequest(sessionId, null, new CardInput("4242424242424242", "A", "12/30", "123"));

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
        when(txRepo.existsBySessionIdAndStatusIn(any(), any())).thenAnswer(inv -> transactions.values().stream()
                .anyMatch(t -> t.getSessionId().equals(inv.getArgument(0)) && inv.<Collection<?>>getArgument(1).contains(t.getStatus())));
        when(txRepo.lockBySessionIdAndStatusIn(any(), any())).thenAnswer(inv -> transactions.values().stream()
                .filter(t -> t.getSessionId().equals(inv.getArgument(0)) && inv.<Collection<?>>getArgument(1).contains(t.getStatus()))
                .toList());

        when(idemRepo.findByUserIdAndIdemKey(any(), any())).thenAnswer(inv ->
                Optional.ofNullable(keys.get(inv.getArgument(0) + "/" + inv.getArgument(1))));
        when(idemRepo.saveAndFlush(any())).thenAnswer(inv -> {
            ChargeIdempotencyKey k = inv.getArgument(0);
            ReflectionTestUtils.setField(k, "id", UUID.randomUUID());
            keys.put(k.getUserId() + "/" + k.getIdemKey(), k);
            return k;
        });
        doAnswer(inv -> keys.values().removeIf(k -> k == inv.getArgument(0))).when(idemRepo).delete(any());
        doAnswer(inv -> keys.values().removeIf(k -> k.getId().equals(inv.getArgument(0)))).when(idemRepo).deleteById(any());

        when(refundRepo.save(any())).thenAnswer(inv -> {
            Refund r = inv.getArgument(0);
            refunds.add(r);
            return r;
        });
        when(refundRepo.sumByTransactionId(any())).thenAnswer(inv -> refunds.stream()
                .filter(r -> r.getTransactionId().equals(inv.getArgument(0))).map(Refund::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add));
        when(refundRepo.findByTransactionIdInOrderByCreatedAtAsc(any())).thenAnswer(inv -> refunds.stream()
                .filter(r -> inv.<Collection<?>>getArgument(0).contains(r.getTransactionId())).toList());

        when(mentoring.getSession(sessionId)).thenReturn(new MentoringClient.SessionInfo(sessionId, mentee, mentor,
                OffsetDateTime.now().plusDays(5), 90, new BigDecimal("300000"), "PENDING"));
        when(gateway.charge(any(), any(), any(), any())).thenAnswer(inv ->
                new PaymentGateway.ChargeResult(true, "sbx_ch_" + inv.getArgument(0), null));
        when(gateway.refund(any(), any())).thenReturn(new PaymentGateway.ChargeResult(true, "sbx_re_1", null));

        service = new PaymentService(txRepo, refundRepo, idemRepo, gateway, mentoring, referrals, earnings, audit, tx,
                new BigDecimal("0.15"), Duration.ofHours(24));
    }

    private Transaction store(Transaction t) {
        if (t.getId() == null) ReflectionTestUtils.setField(t, "id", UUID.randomUUID());
        transactions.put(t.getId(), t);
        return t;
    }

    private Transaction paid(Transaction.Status status) {
        Transaction t = new Transaction();
        t.setSessionId(sessionId);
        t.setPayerId(mentee);
        t.setMentorId(mentor);
        t.setAmount(new BigDecimal("300000"));
        t.applyFee(new BigDecimal("0.15"), new BigDecimal("45000"), new BigDecimal("255000"));
        t.setStatus(status);
        return store(t);
    }

    private static String code(Runnable r) {
        try {
            r.run();
        } catch (ApiException e) {
            return e.getCode();
        }
        return null;
    }

    // ---------- charge ----------

    @Test
    void chargeRequiresIdempotencyKey() {
        assertThat(code(() -> service.charge(payer, null, request))).isEqualTo("IDEMPOTENCY_KEY_REQUIRED");
        assertThat(code(() -> service.charge(payer, "  ", request))).isEqualTo("IDEMPOTENCY_KEY_REQUIRED");
        assertThat(code(() -> service.charge(payer, "x".repeat(300), request))).isEqualTo("INVALID_IDEMPOTENCY_KEY");
        verifyNoInteractions(gateway);
    }

    @Test
    void chargeStoresFeeAndMentorEarningAtChargeTime() {
        TransactionResponse res = service.charge(payer, "key-1", request);

        assertThat(res.status()).isEqualTo("SUCCESS");
        assertThat(res.amount()).isEqualByComparingTo("300000");
        assertThat(res.fee()).isEqualByComparingTo("45000");
        assertThat(res.mentorEarning()).isEqualByComparingTo("255000");
        assertThat(res.feeRate()).isEqualByComparingTo("0.15");
        assertThat(keys.get(mentee + "/key-1").getTransactionId()).isEqualTo(res.id());
        // US-25 — EARNING_PENDING ghi trong transaction charge
        verify(earnings).recordPending(argThat(t -> t.getId().equals(res.id())));
    }

    @Test
    void failedChargeWritesNoEarning() {
        when(gateway.charge(any(), any(), any(), any())).thenReturn(new PaymentGateway.ChargeResult(false, null, "CARD_DECLINED"));
        service.charge(payer, "key-1", request);
        verify(earnings, never()).recordPending(any());
    }

    @Test
    void laterRateChangeDoesNotAlterExistingTransactions() {
        TransactionResponse first = service.charge(payer, "key-1", request);
        PaymentService raised = new PaymentService(txRepo, refundRepo, idemRepo, gateway, mentoring, referrals, earnings, audit, tx,
                new BigDecimal("0.20"), Duration.ofHours(24));

        TransactionResponse reread = raised.get(payer, first.id());

        assertThat(reread.fee()).isEqualByComparingTo("45000");
        assertThat(reread.mentorEarning()).isEqualByComparingTo("255000");
    }

    @Test
    void sameKeyTwiceChargesOnceAndReturnsFirstResult() {
        TransactionResponse first = service.charge(payer, "key-1", request);
        TransactionResponse second = service.charge(payer, "key-1", request);

        assertThat(second.id()).isEqualTo(first.id());
        assertThat(transactions).hasSize(1);
        verify(gateway, times(1)).charge(any(), any(), any(), any());
    }

    @Test
    void sameKeyReplaysFailedResultToo() {
        when(gateway.charge(any(), any(), any(), any())).thenReturn(new PaymentGateway.ChargeResult(false, null, "CARD_DECLINED"));
        TransactionResponse first = service.charge(payer, "key-1", request);
        TransactionResponse second = service.charge(payer, "key-1", request);

        assertThat(second.id()).isEqualTo(first.id());
        assertThat(second.status()).isEqualTo("FAILED");
        verify(gateway, times(1)).charge(any(), any(), any(), any());
    }

    @Test
    void sameKeyForAnotherSessionIsRejected() {
        service.charge(payer, "key-1", request);
        ChargeRequest other = new ChargeRequest(UUID.randomUUID(), null, request.card());

        assertThat(code(() -> service.charge(payer, "key-1", other))).isEqualTo("IDEMPOTENCY_KEY_REUSED");
    }

    @Test
    void keyOfAnotherUserIsIndependent() {
        AuthUser admin = new AuthUser(UUID.randomUUID(), "a@test.local", "ADMIN");
        service.charge(payer, "key-1", request);

        assertThat(code(() -> service.charge(admin, "key-1", request))).isEqualTo("ALREADY_PAID");
    }

    @Test
    void expiredKeyCanBeReused() {
        service.charge(payer, "key-1", request);
        keys.get(mentee + "/key-1").setCreatedAt(OffsetDateTime.now().minusHours(25));

        // key quá hạn → coi như mới → kiểm tra nghiệp vụ chạy lại (phiên đã thanh toán)
        assertThat(code(() -> service.charge(payer, "key-1", request))).isEqualTo("ALREADY_PAID");
    }

    @Test
    void validationErrorBeforeTransactionReleasesKey() {
        when(mentoring.getSession(sessionId)).thenReturn(new MentoringClient.SessionInfo(sessionId, mentee, mentor,
                OffsetDateTime.now().plusDays(5), 90, new BigDecimal("300000"), "CANCELLED"));

        assertThat(code(() -> service.charge(payer, "key-1", request))).isEqualTo("SESSION_NOT_PAYABLE");
        assertThat(keys).isEmpty();
    }

    @Test
    void keyStillProcessingReturnsInProgress() {
        keys.put(mentee + "/key-1", new ChargeIdempotencyKey(mentee, "key-1", sessionId));

        assertThat(code(() -> service.charge(payer, "key-1", request))).isEqualTo("IDEMPOTENCY_IN_PROGRESS");
        verifyNoInteractions(gateway);
    }

    // ---------- refund ----------

    @Test
    void partialRefundCreatesRefundRowWithoutOverwritingTransaction() {
        Transaction t = paid(Transaction.Status.SUCCESS);

        TransactionResponse res = service.refund(sessionId, "PARTIAL", 50, null, null);

        assertThat(res.status()).isEqualTo("PARTIALLY_REFUNDED");
        assertThat(res.refundedAmount()).isEqualByComparingTo("150000");
        assertThat(res.refunds()).hasSize(1);
        assertThat(t.getFailureReason()).isNull();
        assertThat(t.getAmount()).isEqualByComparingTo("300000");
        assertThat(t.getFee()).isEqualByComparingTo("45000");

        TransactionResponse rest = service.refund(sessionId, "REST", null, new BigDecimal("150000"), UUID.randomUUID());
        assertThat(rest.status()).isEqualTo("REFUNDED");
        assertThat(rest.refunds()).hasSize(2);
        // US-25 — mỗi lần hoàn ghi REVERSAL, kèm số đã hoàn trước đó
        verify(earnings).recordReversal(eq(t), any(), argThat(b -> b.compareTo(BigDecimal.ZERO) == 0));
        verify(earnings).recordReversal(eq(t), any(), argThat(b -> b.compareTo(new BigDecimal("150000")) == 0));
    }

    @Test
    void refundCannotExceedAmount() {
        paid(Transaction.Status.SUCCESS);
        service.refund(sessionId, "PARTIAL", 50, null, null);

        assertThat(code(() -> service.refund(sessionId, "AGAIN", 100, null, null))).isEqualTo("REFUND_EXCEEDS_AMOUNT");
        assertThat(refunds).hasSize(1);
    }

    @Test
    void refundOfFullyRefundedOrUnpaidSessionIsNotFound() {
        assertThat(code(() -> service.refund(sessionId, "X", 100, null, null))).isEqualTo("NO_SUCCESS_TRANSACTION");
        paid(Transaction.Status.REFUNDED);
        assertThat(code(() -> service.refund(sessionId, "X", 100, null, null))).isEqualTo("NO_SUCCESS_TRANSACTION");
    }

    @Test
    void onHoldTransactionCannotBeRefunded() {
        paid(Transaction.Status.ON_HOLD);

        assertThat(code(() -> service.refund(sessionId, "X", 100, null, null))).isEqualTo("TRANSACTION_ON_HOLD");
        verify(gateway, never()).refund(any(), any());
    }

    // ---------- hold / release ----------

    @Test
    void holdAndReleaseAreIdempotent() {
        Transaction t = paid(Transaction.Status.SUCCESS);

        assertThat(service.hold(sessionId, "SESSION_DISPUTED").status()).isEqualTo("ON_HOLD");
        assertThat(service.hold(sessionId, "SESSION_DISPUTED").status()).isEqualTo("ON_HOLD");
        assertThat(t.getHoldReason()).isEqualTo("SESSION_DISPUTED");
        assertThat(service.release(sessionId).status()).isEqualTo("SUCCESS");
        assertThat(service.release(sessionId).status()).isEqualTo("SUCCESS");
    }

    @Test
    void refundedTransactionCannotBeHeld() {
        paid(Transaction.Status.PARTIALLY_REFUNDED);

        assertThat(code(() -> service.hold(sessionId, "X"))).isEqualTo("TRANSACTION_NOT_HOLDABLE");
    }
}
