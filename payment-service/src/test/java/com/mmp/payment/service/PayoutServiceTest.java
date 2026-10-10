package com.mmp.payment.service;

import com.mmp.payment.client.AuditClient;
import com.mmp.payment.client.MentoringClient;
import com.mmp.payment.client.ProfileClient;
import com.mmp.payment.dto.PayoutDtos.*;
import com.mmp.payment.entity.*;
import com.mmp.payment.exception.ApiException;
import com.mmp.payment.repository.*;
import com.mmp.payment.security.AuthUser;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** US-42 (PRD-PAY-5) — tối thiểu 200.000đ, 1 yêu cầu mở, che số tài khoản, PAID ghi dòng PAYOUT phân bổ FIFO. */
class PayoutServiceTest {

    private final BankAccountRepository banks = mock(BankAccountRepository.class);
    private final PayoutRepository payouts = mock(PayoutRepository.class);
    private final LedgerRepository ledgerRepo = mock(LedgerRepository.class);
    private final TransactionRepository txRepo = mock(TransactionRepository.class);
    private final MentoringClient mentoring = mock(MentoringClient.class);
    private final ProfileClient profiles = mock(ProfileClient.class);
    private final AuditClient audit = mock(AuditClient.class);
    private final TransactionTemplate tx = mock(TransactionTemplate.class);
    private final List<LedgerEntry> ledger = new ArrayList<>();
    private final List<Payout> stored = new ArrayList<>();
    private final Map<UUID, BankAccount> bankStore = new HashMap<>();
    private final Map<UUID, Transaction> txStore = new HashMap<>();
    private final UUID mentorId = UUID.randomUUID();
    private final AuthUser mentor = new AuthUser(mentorId, "m@x", "MENTOR");
    private final AuthUser admin = new AuthUser(UUID.randomUUID(), "a@x", "ADMIN");
    private final PayoutService service;

    @SuppressWarnings("unchecked")
    PayoutServiceTest() {
        when(tx.execute(any())).thenAnswer(inv -> ((TransactionCallback<Object>) inv.getArgument(0)).doInTransaction(null));
        when(ledgerRepo.save(any())).thenAnswer(inv -> {
            ledger.add(inv.getArgument(0));
            return inv.getArgument(0);
        });
        when(ledgerRepo.findByMentorIdOrderByCreatedAtAsc(any())).thenAnswer(inv -> new ArrayList<>(ledger));
        when(banks.findById(mentorId)).thenAnswer(inv -> Optional.ofNullable(bankStore.get(mentorId)));
        when(banks.save(any())).thenAnswer(inv -> {
            BankAccount b = inv.getArgument(0);
            bankStore.put(b.getMentorId(), b);
            return b;
        });
        when(payouts.save(any())).thenAnswer(inv -> {
            Payout p = inv.getArgument(0);
            if (p.getId() == null) {
                ReflectionTestUtils.setField(p, "id", UUID.randomUUID());
                stored.add(p);
            }
            return p;
        });
        when(payouts.findFirstByMentorIdAndStatus(eq(mentorId), eq(Payout.Status.REQUESTED)))
                .thenAnswer(inv -> stored.stream().filter(p -> p.getStatus() == Payout.Status.REQUESTED).findFirst());
        when(payouts.findForUpdate(any())).thenAnswer(inv -> stored.stream().filter(p -> p.getId().equals(inv.getArgument(0))).findFirst());
        when(txRepo.findAllById(any())).thenAnswer(inv -> {
            List<Transaction> out = new ArrayList<>();
            ((Iterable<UUID>) inv.getArgument(0)).forEach(id -> out.add(txStore.get(id)));
            return out;
        });
        when(profiles.displayName(any())).thenReturn("Mentor A");
        EarningService earnings = new EarningService(ledgerRepo, mock(EarningScheduleRepository.class), txRepo, tx, audit,
                Duration.ofHours(48));
        service = new PayoutService(banks, payouts, ledgerRepo, txRepo, earnings, mentoring, profiles, audit, tx);
    }

    /** Một giao dịch đã giải phóng {@code available}đ thu nhập. */
    private Transaction released(long earning) {
        Transaction t = new Transaction();
        ReflectionTestUtils.setField(t, "id", UUID.randomUUID());
        ReflectionTestUtils.setField(t, "mentorId", mentorId);
        ReflectionTestUtils.setField(t, "sessionId", UUID.randomUUID());
        txStore.put(t.getId(), t);
        ledger.add(new LedgerEntry(t, LedgerEntry.Type.EARNING_PENDING, BigDecimal.valueOf(earning), null));
        ledger.add(new LedgerEntry(t, LedgerEntry.Type.EARNING_AVAILABLE, BigDecimal.valueOf(earning), null));
        return t;
    }

    private void bank() {
        service.saveBankAccount(mentorId, new BankAccountInput("Vietcombank", "0011 0023 45678", "nguyen van a"));
    }

    @Test
    void accountNumberIsMaskedAndValidated() {
        bank();
        BankAccountView v = service.overview(mentorId).bankAccount();
        assertThat(v.accountNumberMasked()).isEqualTo("••••5678");
        assertThat(v.holderName()).isEqualTo("NGUYEN VAN A");
        assertThat(bankStore.get(mentorId).getAccountNumber()).isEqualTo("001100234 5678".replace(" ", ""));
        assertThatThrownBy(() -> service.saveBankAccount(mentorId, new BankAccountInput("VCB", "12ab", "A B")))
                .hasFieldOrPropertyWithValue("code", "INVALID_BANK_ACCOUNT");
    }

    @Test
    void belowMinimumIs400() {
        bank();
        released(150000);
        assertThatThrownBy(() -> service.request(mentor))
                .isInstanceOf(ApiException.class)
                .hasFieldOrPropertyWithValue("status", HttpStatus.BAD_REQUEST)
                .hasFieldOrPropertyWithValue("code", "PAYOUT_BELOW_MINIMUM");
    }

    @Test
    void bankAccountRequired() {
        released(300000);
        assertThatThrownBy(() -> service.request(mentor)).hasFieldOrPropertyWithValue("code", "BANK_ACCOUNT_REQUIRED");
    }

    @Test
    void requestWholeAvailableOnlyOneOpen() {
        bank();
        released(150000);
        released(100000);
        PayoutView p = service.request(mentor);
        assertThat(p.amount()).isEqualByComparingTo("250000");
        assertThat(p.accountNumber()).isNull();
        assertThatThrownBy(() -> service.request(mentor)).hasFieldOrPropertyWithValue("code", "PAYOUT_ALREADY_OPEN");
        assertThat(service.overview(mentorId).canRequest()).isFalse();
    }

    @Test
    void markPaidWritesPayoutLedgerFifoAndZeroesAvailable() {
        bank();
        Transaction a = released(150000);
        Transaction b = released(100000);
        PayoutView p = service.request(mentor);
        PayoutView paid = service.markPaid(admin, p.id(), new MarkPaidInput("FT2611ABC", null));
        assertThat(paid.status()).isEqualTo("PAID");
        assertThat(paid.accountNumber()).isNotNull(); // admin thấy đủ số để chuyển khoản
        assertThat(ledger).filteredOn(e -> e.getType() == LedgerEntry.Type.PAYOUT)
                .extracting(LedgerEntry::getTransactionId, e -> e.getAmount().longValue())
                .containsExactly(org.assertj.core.groups.Tuple.tuple(a.getId(), 150000L),
                        org.assertj.core.groups.Tuple.tuple(b.getId(), 100000L));
        PayoutOverview o = service.overview(mentorId);
        assertThat(o.available()).isEqualByComparingTo("0");
        verify(mentoring).notify(eq(mentorId), isNull(), eq("PAYOUT_PAID"), any(), any(), any());
        assertThatThrownBy(() -> service.markPaid(admin, p.id(), new MarkPaidInput("x", null)))
                .hasFieldOrPropertyWithValue("code", "PAYOUT_NOT_OPEN");
    }

    @Test
    void clawbackAfterRequestBlocksPaid() {
        bank();
        Transaction a = released(300000);
        PayoutView p = service.request(mentor);
        ledger.add(new LedgerEntry(a, LedgerEntry.Type.REVERSAL, BigDecimal.valueOf(200000), UUID.randomUUID()));
        assertThatThrownBy(() -> service.markPaid(admin, p.id(), new MarkPaidInput("FT1", null)))
                .hasFieldOrPropertyWithValue("code", "PAYOUT_EXCEEDS_AVAILABLE");
        PayoutView rejected = service.reject(admin, p.id(), new RejectInput("Số dư bị thu hồi do tranh chấp"));
        assertThat(rejected.status()).isEqualTo("REJECTED");
    }
}
