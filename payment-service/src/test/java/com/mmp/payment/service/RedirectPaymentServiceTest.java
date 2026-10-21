package com.mmp.payment.service;

import com.mmp.payment.client.AuditClient;
import com.mmp.payment.client.MentoringClient;
import com.mmp.payment.entity.Transaction;
import com.mmp.payment.exception.ApiException;
import com.mmp.payment.gateway.RedirectGateway;
import com.mmp.payment.gateway.RedirectGateway.Callback;
import com.mmp.payment.gateway.RedirectGateway.QueryOutcome;
import com.mmp.payment.gateway.RedirectGateway.QueryResult;
import com.mmp.payment.repository.TransactionRepository;
import com.mmp.payment.security.AuthUser;
import com.mmp.payment.service.RedirectPaymentService.IpnResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** US-56 — checkout, IPN (PRD-PAY-11), trang return + truy vấn (PRD-PAY-12, 14), xử lý đúng một lần — chung cho mọi cổng. */
class RedirectPaymentServiceTest {

    private final PaymentService payments = mock(PaymentService.class);
    private final RedirectGateway gateway = mock(RedirectGateway.class);
    private final TransactionRepository txRepo = mock(TransactionRepository.class);
    private final EarningService earnings = mock(EarningService.class);
    private final TransactionTemplate tx = mock(TransactionTemplate.class);
    private final Map<UUID, Transaction> rows = new HashMap<>();

    private final UUID mentee = UUID.randomUUID();
    private final AuthUser user = new AuthUser(mentee, "m@test.local", "MENTEE");
    private RedirectPaymentService service;
    private Transaction pending;

    @BeforeEach
    void setUp() {
        when(tx.execute(any())).thenAnswer(inv -> inv.<TransactionCallback<?>>getArgument(0).doInTransaction(null));
        when(txRepo.lockById(any())).thenAnswer(inv -> Optional.ofNullable(rows.get(inv.<UUID>getArgument(0))));
        when(txRepo.findById(any())).thenAnswer(inv -> Optional.ofNullable(rows.get(inv.<UUID>getArgument(0))));
        when(txRepo.saveAndFlush(any())).thenAnswer(inv -> {
            Transaction t = inv.getArgument(0);
            if (t.getId() == null) {
                ReflectionTestUtils.setField(t, "id", UUID.randomUUID());
                ReflectionTestUtils.setField(t, "createdAt", OffsetDateTime.now());
            }
            rows.put(t.getId(), t);
            return t;
        });
        when(txRepo.findByProviderTxnRef(any())).thenAnswer(inv -> rows.values().stream()
                .filter(t -> inv.getArgument(0).equals(t.getProviderTxnRef())).findFirst());
        when(gateway.provider()).thenReturn("MOMO");
        when(gateway.configured()).thenReturn(true);
        when(gateway.linkTtl()).thenReturn(Duration.ofMinutes(100));
        when(gateway.txnRef(any())).thenAnswer(inv -> "MH" + inv.getArgument(0).toString().replace("-", ""));

        pending = new Transaction();
        ReflectionTestUtils.setField(pending, "id", UUID.randomUUID());
        ReflectionTestUtils.setField(pending, "createdAt", OffsetDateTime.now());
        pending.setSessionId(UUID.randomUUID());
        pending.setPayerId(mentee);
        pending.setMentorId(UUID.randomUUID());
        pending.setAmount(new BigDecimal("200000.00"));
        pending.applyFee(new BigDecimal("0.15"), new BigDecimal("30000"), new BigDecimal("170000"));
        pending.setProvider("MOMO");
        pending.setProviderTxnRef("MHpending");
        rows.put(pending.getId(), pending);

        service = new RedirectPaymentService(payments, List.of(gateway), "momo", txRepo, mock(ReferralService.class), earnings,
                mock(AuditClient.class), tx, mock(JdbcTemplate.class),
                mock(WalletLedger.class), mock(WalletService.class));
    }

    private void callback(String amount, boolean paid, String reason) {
        when(gateway.verifyCallback(any())).thenReturn(Optional.of(new Callback("MHpending", new BigDecimal(amount), paid, "4860449956", reason)));
    }

    @Test
    void activeGatewayFollowsConfig() {
        assertThat(service.active()).contains(gateway);
        RedirectPaymentService sandbox = new RedirectPaymentService(payments, List.of(gateway), "sandbox", txRepo,
                mock(ReferralService.class), earnings, mock(AuditClient.class), tx, mock(JdbcTemplate.class),
                mock(WalletLedger.class), mock(WalletService.class));
        assertThat(sandbox.active()).isEmpty();
    }

    @Test
    void checkoutCreatesPendingTransactionWithGatewayOrderId() {
        UUID sessionId = UUID.randomUUID();
        when(payments.payableSession(any(), eq(sessionId), any())).thenReturn(new MentoringClient.SessionInfo(sessionId, mentee,
                UUID.randomUUID(), OffsetDateTime.now().plusDays(1), 60, new BigDecimal("300000"), "PENDING"));
        when(payments.feeSplit(any())).thenReturn(new PaymentRules.FeeSplit(new BigDecimal("0.15"), new BigDecimal("45000"), new BigDecimal("255000")));
        when(gateway.createPaymentUrl(any(), any())).thenReturn("https://test-payment.momo.vn/pay?t=x");

        var res = service.checkout(user, sessionId, null, "1.2.3.4");
        Transaction t = rows.get(res.transactionId());
        assertThat(res.provider()).isEqualTo("MOMO");
        assertThat(res.paymentUrl()).startsWith("https://test-payment.momo.vn");
        assertThat(t.getStatus()).isEqualTo(Transaction.Status.PENDING);
        assertThat(t.getProvider()).isEqualTo("MOMO");
        assertThat(t.getProviderTxnRef()).isEqualTo("MH" + t.getId().toString().replace("-", ""));
    }

    @Test
    void checkoutFailsTheTransactionWhenGatewayIsDown() {
        UUID sessionId = UUID.randomUUID();
        when(payments.payableSession(any(), any(), any())).thenReturn(new MentoringClient.SessionInfo(sessionId, mentee,
                UUID.randomUUID(), OffsetDateTime.now().plusDays(1), 60, new BigDecimal("300000"), "PENDING"));
        when(payments.feeSplit(any())).thenReturn(new PaymentRules.FeeSplit(new BigDecimal("0.15"), new BigDecimal("45000"), new BigDecimal("255000")));
        when(gateway.createPaymentUrl(any(), any())).thenThrow(new IllegalStateException("down"));
        assertThatThrownBy(() -> service.checkout(user, sessionId, null, null)).isInstanceOf(ApiException.class);
        assertThat(rows.values()).filteredOn(t -> t.getSessionId().equals(sessionId))
                .allMatch(t -> t.getStatus() == Transaction.Status.FAILED && "MOMO_UNAVAILABLE".equals(t.getFailureReason()));
    }

    @Test
    void ipnRejectsBadSignatureUnknownOrderAndWrongAmount() {
        when(gateway.verifyCallback(any())).thenReturn(Optional.empty());
        assertThat(service.ipn("MOMO", Map.of())).isEqualTo(IpnResult.BAD_SIGNATURE);
        when(gateway.verifyCallback(any())).thenReturn(Optional.of(new Callback("MHnope", new BigDecimal("200000"), true, "1", null)));
        assertThat(service.ipn("MOMO", Map.of())).isEqualTo(IpnResult.NOT_FOUND);
        callback("1000", true, null);
        assertThat(service.ipn("MOMO", Map.of())).isEqualTo(IpnResult.BAD_AMOUNT);
        assertThat(service.ipn("VNPAY", Map.of())).isEqualTo(IpnResult.BAD_SIGNATURE); // cổng không tồn tại
        assertThat(pending.getStatus()).isEqualTo(Transaction.Status.PENDING);
    }

    @Test
    void successfulIpnConfirmsOnceThenReportsAlreadyConfirmed() {
        callback("200000", true, null);
        assertThat(service.ipn("MOMO", Map.of())).isEqualTo(IpnResult.OK);
        assertThat(pending.getStatus()).isEqualTo(Transaction.Status.SUCCESS);
        assertThat(pending.getProviderReference()).isEqualTo("4860449956");
        verify(earnings).recordPending(pending);
        verify(payments).syncSession(pending.getId());

        assertThat(service.ipn("MOMO", Map.of())).isEqualTo(IpnResult.ALREADY_CONFIRMED);
        verify(earnings, times(1)).recordPending(any());
        verify(payments, times(1)).syncSession(any());
    }

    @Test
    void cancelledIpnFailsTheTransaction() {
        callback("200000", false, "PAYMENT_CANCELLED");
        assertThat(service.ipn("MOMO", Map.of())).isEqualTo(IpnResult.OK);
        assertThat(pending.getStatus()).isEqualTo(Transaction.Status.FAILED);
        assertThat(pending.getFailureReason()).isEqualTo("PAYMENT_CANCELLED");
        verifyNoInteractions(earnings);
    }

    @Test
    void returnPageNeverChangesStateFromItsOwnParamsButQueriesTheGateway() {
        callback("200000", true, null); // trang return nói "đã trả"…
        when(gateway.query(any())).thenReturn(new QueryResult(QueryOutcome.PENDING, "", "7002"));
        service.confirmReturn(user, "MOMO", Map.of());
        assertThat(pending.getStatus()).isEqualTo(Transaction.Status.PENDING); // …nhưng cổng chưa xác nhận

        when(gateway.query(any())).thenReturn(new QueryResult(QueryOutcome.SUCCESS, "4860449956", "0"));
        service.confirmReturn(user, "MOMO", Map.of());
        assertThat(pending.getStatus()).isEqualTo(Transaction.Status.SUCCESS);
        verify(payments).syncSession(pending.getId());
    }

    @Test
    void returnPageRejectsBadSignatureAndOtherUsers() {
        when(gateway.verifyCallback(any())).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.confirmReturn(user, "MOMO", Map.of()))
                .isInstanceOf(ApiException.class).hasMessageContaining("Chữ ký");
        callback("200000", true, null);
        assertThatThrownBy(() -> service.confirmReturn(new AuthUser(UUID.randomUUID(), "x@test.local", "MENTEE"), "MOMO", Map.of()))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void abandonedPaymentExpiresOnlyAfterTheGatewaysLinkTtl() {
        when(txRepo.findByProviderAndStatusAndCreatedAtBefore(any(), any(), any())).thenReturn(List.of(pending));
        when(gateway.query(any())).thenReturn(new QueryResult(QueryOutcome.PENDING, "", "1000"));

        ReflectionTestUtils.setField(pending, "createdAt", OffsetDateTime.now().minusMinutes(60)); // MoMo: link còn hạn 100 phút
        assertThat(service.reconcilePending(Duration.ofMinutes(2))).isZero();
        assertThat(pending.getStatus()).isEqualTo(Transaction.Status.PENDING);

        ReflectionTestUtils.setField(pending, "createdAt", OffsetDateTime.now().minusMinutes(110));
        assertThat(service.reconcilePending(Duration.ofMinutes(2))).isEqualTo(1);
        assertThat(pending.getStatus()).isEqualTo(Transaction.Status.FAILED);
        assertThat(pending.getFailureReason()).isEqualTo("PAYMENT_EXPIRED");
    }
}
