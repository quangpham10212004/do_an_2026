package com.mmp.payment.service;

import com.mmp.payment.client.AuditClient;
import com.mmp.payment.dto.PaymentDtos.FinalStateRequest;
import com.mmp.payment.dto.PaymentDtos.FinalStateResponse;
import com.mmp.payment.entity.EarningSchedule;
import com.mmp.payment.entity.LedgerEntry;
import com.mmp.payment.entity.Refund;
import com.mmp.payment.entity.Transaction;
import com.mmp.payment.exception.ApiException;
import com.mmp.payment.repository.EarningScheduleRepository;
import com.mmp.payment.repository.LedgerRepository;
import com.mmp.payment.repository.TransactionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/** US-25 — ghi sổ, lịch giải phóng 48 giờ, chặn khi tranh chấp, idempotent. */
class EarningServiceTest {

    private final LedgerRepository ledgerRepo = mock(LedgerRepository.class);
    private final EarningScheduleRepository scheduleRepo = mock(EarningScheduleRepository.class);
    private final TransactionRepository txRepo = mock(TransactionRepository.class);
    private final TransactionTemplate tx = mock(TransactionTemplate.class);
    private final AuditClient audit = mock(AuditClient.class);

    private final List<LedgerEntry> ledger = new ArrayList<>();
    private final Map<UUID, EarningSchedule> schedules = new HashMap<>();
    private Transaction t;
    private EarningService service;

    @BeforeEach
    void setUp() {
        when(tx.execute(any())).thenAnswer(inv -> inv.<TransactionCallback<?>>getArgument(0).doInTransaction(null));
        when(ledgerRepo.save(any())).thenAnswer(inv -> {
            ledger.add(inv.getArgument(0));
            return inv.getArgument(0);
        });
        when(ledgerRepo.findByTransactionIdOrderByCreatedAtAsc(any())).thenAnswer(inv ->
                ledger.stream().filter(e -> e.getTransactionId().equals(inv.getArgument(0))).toList());
        when(ledgerRepo.findByMentorIdOrderByCreatedAtAsc(any())).thenAnswer(inv ->
                ledger.stream().filter(e -> e.getMentorId().equals(inv.getArgument(0))).toList());
        when(scheduleRepo.findById(any())).thenAnswer(inv -> Optional.ofNullable(schedules.get(inv.<UUID>getArgument(0))));
        when(scheduleRepo.save(any())).thenAnswer(inv -> {
            EarningSchedule e = inv.getArgument(0);
            schedules.put(e.getTransactionId(), e);
            return e;
        });
        when(scheduleRepo.findDueTransactionIds(any())).thenAnswer(inv -> schedules.values().stream()
                .filter(e -> e.getSettledAt() == null && !e.getReleaseAt().isAfter(inv.getArgument(0)))
                .map(EarningSchedule::getTransactionId).toList());

        t = new Transaction();
        ReflectionTestUtils.setField(t, "id", UUID.randomUUID());
        t.setSessionId(UUID.randomUUID());
        t.setPayerId(UUID.randomUUID());
        t.setMentorId(UUID.randomUUID());
        t.setAmount(new BigDecimal("300000"));
        t.applyFee(new BigDecimal("0.15"), new BigDecimal("45000"), new BigDecimal("255000"));
        t.setStatus(Transaction.Status.SUCCESS);
        when(txRepo.lockById(t.getId())).thenAnswer(inv -> Optional.of(t));
        when(txRepo.lockBySessionIdAndStatusIn(eq(t.getSessionId()), any())).thenAnswer(inv ->
                inv.<Collection<?>>getArgument(1).contains(t.getStatus()) ? List.of(t) : List.of());

        service = new EarningService(ledgerRepo, scheduleRepo, txRepo, tx, audit, Duration.ofHours(48));
    }

    private BigDecimal pending() {
        return service.summary(t.getMentorId()).pending();
    }

    private BigDecimal available() {
        return service.summary(t.getMentorId()).available();
    }

    @Test
    void pendingWrittenOnceOnCharge() {
        service.recordPending(t);
        service.recordPending(t);
        assertThat(ledger).hasSize(1);
        assertThat(pending()).isEqualByComparingTo("255000");
    }

    @Test
    void completedSessionReleasesAfter48Hours() {
        service.recordPending(t);
        OffsetDateTime ended = OffsetDateTime.now().minusHours(1);
        FinalStateResponse r = service.finalState(t.getSessionId(), new FinalStateRequest("COMPLETED", ended, null));
        assertThat(r.releaseAt()).isEqualTo(ended.plusHours(48));

        assertThat(service.releaseDue(OffsetDateTime.now())).isZero();
        assertThat(pending()).isEqualByComparingTo("255000");

        assertThat(service.releaseDue(ended.plusHours(48).plusMinutes(1))).isEqualTo(1);
        assertThat(pending()).isEqualByComparingTo("0");
        assertThat(available()).isEqualByComparingTo("255000");

        // idempotent: chạy lại không ghi thêm
        assertThat(service.releaseDue(ended.plusHours(49))).isZero();
        assertThat(ledger.stream().filter(e -> e.getType() == LedgerEntry.Type.EARNING_AVAILABLE)).hasSize(1);
        verify(audit).system(eq("EARNING_RELEASED"), eq("TRANSACTION"), eq(t.getId()), any());
    }

    @Test
    void finalStateLongAgoReleasesImmediately() {
        service.recordPending(t);
        service.finalState(t.getSessionId(), new FinalStateRequest("NO_SHOW_MENTEE", OffsetDateTime.now().minusHours(50), null));
        assertThat(available()).isEqualByComparingTo("255000");
    }

    @Test
    void onHoldTransactionIsNotReleasedUntilResolved() {
        service.recordPending(t);
        service.finalState(t.getSessionId(), new FinalStateRequest("COMPLETED", OffsetDateTime.now().minusHours(1), null));
        t.setStatus(Transaction.Status.ON_HOLD);
        assertThat(service.releaseDue(OffsetDateTime.now().plusHours(48))).isZero();
        assertThat(available()).isEqualByComparingTo("0");

        t.setStatus(Transaction.Status.SUCCESS);
        assertThat(service.releaseDue(OffsetDateTime.now().plusHours(48))).isEqualTo(1);
        assertThat(available()).isEqualByComparingTo("255000");
    }

    @Test
    void fullRefundBeforeReleaseMeansNothingBecomesAvailable() {
        service.recordPending(t);
        Refund refund = refund("300000");
        service.recordReversal(t, refund, BigDecimal.ZERO);
        t.setStatus(Transaction.Status.REFUNDED);
        service.finalState(t.getSessionId(), new FinalStateRequest("COMPLETED", OffsetDateTime.now().minusHours(49), null));
        assertThat(pending()).isEqualByComparingTo("0");
        assertThat(available()).isEqualByComparingTo("0");
        assertThat(service.summary(t.getMentorId()).reversed()).isEqualByComparingTo("255000");
        assertThat(ledger.stream().noneMatch(e -> e.getType() == LedgerEntry.Type.EARNING_AVAILABLE)).isTrue();
    }

    @Test
    void partialRefundThenImmediateReleaseOfRemainder() {
        service.recordPending(t);
        service.recordReversal(t, refund("150000"), BigDecimal.ZERO);
        t.setStatus(Transaction.Status.PARTIALLY_REFUNDED);
        service.finalState(t.getSessionId(), new FinalStateRequest("COMPLETED", OffsetDateTime.now().minusMinutes(5), true));
        assertThat(available()).isEqualByComparingTo("127500");
        assertThat(pending()).isEqualByComparingTo("0");
    }

    @Test
    void nonReleasableStateIsSettledWithoutRelease() {
        service.recordPending(t);
        FinalStateResponse r = service.finalState(t.getSessionId(),
                new FinalStateRequest("NO_SHOW_MENTOR", OffsetDateTime.now().minusHours(60), null));
        assertThat(r.settledAt()).isNotNull();
        assertThat(service.releaseDue(OffsetDateTime.now())).isZero();
        assertThat(available()).isEqualByComparingTo("0");
    }

    @Test
    void finalStateForSessionWithoutPaidTransactionIs404() {
        assertThatThrownBy(() -> service.finalState(UUID.randomUUID(), new FinalStateRequest("COMPLETED", OffsetDateTime.now(), null)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("NO_SUCCESS_TRANSACTION");
    }

    private Refund refund(String amount) {
        Refund r = new Refund(t.getId(), new BigDecimal(amount), "TEST", null, "ref");
        ReflectionTestUtils.setField(r, "id", UUID.randomUUID());
        return r;
    }
}
