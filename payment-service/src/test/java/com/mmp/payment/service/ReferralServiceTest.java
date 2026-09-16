package com.mmp.payment.service;

import com.mmp.payment.entity.Referral;
import com.mmp.payment.entity.ReferralCode;
import com.mmp.payment.entity.RewardEntry;
import com.mmp.payment.entity.Transaction;
import com.mmp.payment.exception.ApiException;
import com.mmp.payment.repository.ReferralCodeRepository;
import com.mmp.payment.repository.ReferralRepository;
import com.mmp.payment.repository.RewardEntryRepository;
import com.mmp.payment.repository.TransactionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class ReferralServiceTest {

    private ReferralCodeRepository codes;
    private ReferralRepository referrals;
    private RewardEntryRepository rewards;
    private TransactionRepository transactions;
    private ReferralService service;

    private final UUID referrer = UUID.randomUUID();
    private final UUID referee = UUID.randomUUID();
    private final UUID mentor = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        codes = mock(ReferralCodeRepository.class);
        referrals = mock(ReferralRepository.class);
        rewards = mock(RewardEntryRepository.class);
        transactions = mock(TransactionRepository.class);
        service = new ReferralService(codes, referrals, rewards, transactions, 100, new BigDecimal("50000"), 2, "http://localhost:3000");
        when(referrals.save(any(Referral.class))).thenAnswer(inv -> inv.getArgument(0));
        when(codes.save(any(ReferralCode.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    private Referral registered() {
        Referral r = new Referral(referrer, referee, "ABCD2345");
        when(referrals.findByRefereeId(referee)).thenReturn(Optional.of(r));
        return r;
    }

    private Transaction tx(String amount) {
        Transaction t = mock(Transaction.class);
        when(t.getId()).thenReturn(UUID.randomUUID());
        when(t.getPayerId()).thenReturn(referee);
        when(t.getMentorId()).thenReturn(mentor);
        when(t.getAmount()).thenReturn(new BigDecimal(amount));
        return t;
    }

    @Test
    void generatedCodesAreEightUnambiguousCharacters() {
        for (int i = 0; i < 50; i++) {
            assertThat(ReferralService.randomCode()).matches("[A-HJ-NP-Z2-9]{8}");
        }
    }

    @Test
    void getOrCreateCodeCreatesOnce() {
        when(codes.findById(referrer)).thenReturn(Optional.empty());
        ReferralCode created = service.getOrCreateCode(referrer);
        assertThat(created.getCode()).hasSize(8);
        verify(codes).save(any());
    }

    @Test
    void cannotReferSelfOrBeReferredTwice() {
        when(codes.findByCode("ABCD2345")).thenReturn(Optional.of(new ReferralCode(referrer, "ABCD2345")));
        assertThatThrownBy(() -> service.registerReferee("abcd2345", referrer))
                .extracting(e -> ((ApiException) e).getCode()).isEqualTo("SELF_REFERRAL");
        registered();
        assertThatThrownBy(() -> service.registerReferee("ABCD2345", referee))
                .extracting(e -> ((ApiException) e).getCode()).isEqualTo("ALREADY_REFERRED");
    }

    @Test
    void unknownCodeIsRejected() {
        when(codes.findByCode("NOPE")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.registerReferee("nope", referee))
                .extracting(e -> ((ApiException) e).getCode()).isEqualTo("REFERRAL_CODE_NOT_FOUND");
    }

    @Test
    void firstQualifyingTransactionAwardsPoints() {
        Referral r = registered();
        when(transactions.countByPayerIdAndStatus(referee, Transaction.Status.SUCCESS)).thenReturn(1L);
        service.onSuccessfulTransaction(tx("200000"));
        assertThat(r.getStatus()).isEqualTo(Referral.Status.QUALIFIED);
        verify(rewards).save(argThat((RewardEntry e) -> e.getUserId().equals(referrer) && e.getPoints() == 100));
    }

    @Test
    void smallTransactionDoesNotQualifyYet() {
        Referral r = registered();
        when(transactions.countByPayerIdAndStatus(referee, Transaction.Status.SUCCESS)).thenReturn(1L);
        service.onSuccessfulTransaction(tx("10000"));
        assertThat(r.getStatus()).isEqualTo(Referral.Status.REGISTERED);
        verifyNoInteractions(rewards);
    }

    @Test
    void notFirstTransactionDoesNotAward() {
        Referral r = registered();
        when(transactions.countByPayerIdAndStatus(referee, Transaction.Status.SUCCESS)).thenReturn(2L);
        service.onSuccessfulTransaction(tx("200000"));
        assertThat(r.getStatus()).isEqualTo(Referral.Status.REGISTERED);
        verifyNoInteractions(rewards);
    }

    @Test
    void referrerPayingThemselvesAsMentorIsRejected() {
        Referral r = new Referral(mentor, referee, "ABCD2345");
        when(referrals.findByRefereeId(referee)).thenReturn(Optional.of(r));
        when(transactions.countByPayerIdAndStatus(referee, Transaction.Status.SUCCESS)).thenReturn(1L);
        service.onSuccessfulTransaction(tx("200000"));
        assertThat(r.getStatus()).isEqualTo(Referral.Status.REJECTED);
        assertThat(r.getRejectReason()).isEqualTo("REFERRER_IS_SESSION_MENTOR");
        verifyNoInteractions(rewards);
    }

    @Test
    void dailyLimitIsEnforced() {
        Referral r = registered();
        when(transactions.countByPayerIdAndStatus(referee, Transaction.Status.SUCCESS)).thenReturn(1L);
        when(referrals.countByReferrerIdAndStatusAndQualifiedAtAfter(eq(referrer), eq(Referral.Status.QUALIFIED), any())).thenReturn(2L);
        service.onSuccessfulTransaction(tx("200000"));
        assertThat(r.getStatus()).isEqualTo(Referral.Status.REJECTED);
        assertThat(r.getRejectReason()).isEqualTo("DAILY_LIMIT_EXCEEDED");
    }
}
