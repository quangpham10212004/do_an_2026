package com.mmp.mentoring.service;

import com.mmp.mentoring.client.PaymentClient;
import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.repository.MentoringRequestRepository;
import com.mmp.mentoring.repository.ReviewRepository;
import com.mmp.mentoring.repository.SessionRepository;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** Mock dùng chung cho các test tầng service — gom chỗ khởi tạo để constructor đổi chỉ phải sửa 1 nơi. */
class TestFixtures {

    final SessionRepository sessionRepo = mock(SessionRepository.class);
    final MentoringRequestRepository requestRepo = mock(MentoringRequestRepository.class);
    final ReviewRepository reviewRepo = mock(ReviewRepository.class);
    final ProfileClient profileClient = mock(ProfileClient.class);
    final PaymentClient paymentClient = mock(PaymentClient.class);
    final NotificationService notifications = mock(NotificationService.class);
    final TransactionTemplate tx = mock(TransactionTemplate.class);

    TestFixtures() {
        when(tx.execute(any())).thenAnswer(inv -> inv.<TransactionCallback<?>>getArgument(0).doInTransaction(null));
        doAnswer(inv -> {
            inv.<java.util.function.Consumer<org.springframework.transaction.TransactionStatus>>getArgument(0).accept(null);
            return null;
        }).when(tx).executeWithoutResult(any());
        when(sessionRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(requestRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(profileClient.displayNames(any())).thenReturn(java.util.Map.of());
    }

    SessionService service() {
        return new SessionService(sessionRepo, requestRepo, reviewRepo, profileClient, paymentClient, notifications, tx,
                "Asia/Ho_Chi_Minh", Duration.ofHours(1), Duration.ofDays(60));
    }
}
