package com.mmp.payment.service;

import com.mmp.payment.entity.RewardEntry;
import com.mmp.payment.repository.ReferralCodeRepository;
import com.mmp.payment.repository.ReferralRepository;
import com.mmp.payment.repository.RewardEntryRepository;
import com.mmp.payment.repository.TransactionRepository;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** US-01 — điểm xin lỗi khi mentor huỷ phiên: cộng 1 lần duy nhất cho mỗi (người dùng, lý do, phiên). */
class SessionRewardTest {

    private final RewardEntryRepository rewards = mock(RewardEntryRepository.class);
    private final ReferralService service = new ReferralService(mock(ReferralCodeRepository.class), mock(ReferralRepository.class),
            rewards, mock(TransactionRepository.class), 100, new BigDecimal("50000"), 5, "http://localhost:3000");

    @Test
    void firstCallSavesEntryWithSessionReference() {
        UUID user = UUID.randomUUID();
        UUID session = UUID.randomUUID();
        when(rewards.findFirstByUserIdAndReasonAndSessionId(user, "MENTOR_CANCEL_APOLOGY", session)).thenReturn(Optional.empty());
        when(rewards.save(any(RewardEntry.class))).thenAnswer(inv -> inv.getArgument(0));

        var res = service.grantSessionReward(user, 20, "MENTOR_CANCEL_APOLOGY", session);

        assertThat(res.points()).isEqualTo(20);
        assertThat(res.reason()).isEqualTo("MENTOR_CANCEL_APOLOGY");
        verify(rewards).save(argThat(e -> session.equals(e.getSessionId()) && user.equals(e.getUserId())));
    }

    @Test
    void retryReturnsExistingEntryWithoutDoubleCredit() {
        UUID user = UUID.randomUUID();
        UUID session = UUID.randomUUID();
        RewardEntry existing = RewardEntry.forSession(user, 20, "MENTOR_CANCEL_APOLOGY", session);
        when(rewards.findFirstByUserIdAndReasonAndSessionId(user, "MENTOR_CANCEL_APOLOGY", session)).thenReturn(Optional.of(existing));

        service.grantSessionReward(user, 20, "MENTOR_CANCEL_APOLOGY", session);

        verify(rewards, never()).save(any());
    }
}
