package com.mmp.mentoring.service;

import com.mmp.mentoring.client.PaymentClient;
import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.MentoringDtos.BookSessionInput;
import com.mmp.mentoring.dto.MentoringDtos.ReviewInput;
import com.mmp.mentoring.entity.MentoringRequest;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.MentoringRequestRepository;
import com.mmp.mentoring.repository.ReviewRepository;
import com.mmp.mentoring.repository.SessionRepository;
import com.mmp.mentoring.security.AuthUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static com.mmp.mentoring.service.TestSupport.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/** Đặt lịch lẻ và đặt bằng gói, huỷ trả lại buổi, và buổi làm quen không tính vào đánh giá. */
class SessionServiceTest {

    private final UUID menteeId = UUID.randomUUID();
    private final UUID mentorId = UUID.randomUUID();
    private final AuthUser mentee = user(menteeId, "MENTEE");

    private SessionRepository sessionRepo;
    private MentoringRequestRepository requestRepo;
    private ReviewRepository reviewRepo;
    private ProfileClient profileClient;
    private PaymentClient paymentClient;
    private NotificationService notifications;
    private PackageService packageService;
    private SessionService service;

    @BeforeEach
    void setUp() {
        sessionRepo = mock(SessionRepository.class);
        requestRepo = mock(MentoringRequestRepository.class);
        reviewRepo = mock(ReviewRepository.class);
        profileClient = mock(ProfileClient.class);
        paymentClient = mock(PaymentClient.class);
        notifications = mock(NotificationService.class);
        packageService = mock(PackageService.class);
        when(profileClient.findMentor(mentorId)).thenReturn(Optional.of(mentor(mentorId, BigDecimal.valueOf(300_000), 3)));
        when(requestRepo.findFirstByMenteeIdAndMentorIdAndStatus(menteeId, mentorId, MentoringRequest.Status.ACCEPTED))
                .thenReturn(Optional.of(request(menteeId, mentorId, MentoringRequest.Status.ACCEPTED)));
        when(sessionRepo.save(any(MentoringSession.class))).thenAnswer(inv -> inv.getArgument(0));
        service = new SessionService(sessionRepo, requestRepo, reviewRepo, profileClient, paymentClient, notifications,
                packageService, validator(sessionRepo), mock(SessionViewMapper.class), tx());
    }

    private MentoringSession booked() {
        ArgumentCaptor<MentoringSession> saved = ArgumentCaptor.forClass(MentoringSession.class);
        verify(sessionRepo).save(saved.capture());
        return saved.getValue();
    }

    @Test
    void aSingleSessionIsPricedFromTheHourlyRateAndWaitsForPayment() {
        service.book(mentee, new BookSessionInput(menteeId, mentorId, at(3, 10), 60, "CV", null));

        MentoringSession s = booked();
        assertThat(s.getPrice()).isEqualByComparingTo("300000");
        assertThat(s.getStatus()).isEqualTo(MentoringSession.Status.PENDING);
        assertThat(s.getType()).isEqualTo(MentoringSession.Type.REGULAR);
        assertThat(s.getPackageId()).isNull();
        verifyNoInteractions(packageService);
    }

    @Test
    void usingAPackageCreditConfirmsTheSessionImmediatelyAtNoExtraCost() {
        UUID packageId = UUID.randomUUID();

        service.book(mentee, new BookSessionInput(menteeId, mentorId, at(3, 10), 60, null, packageId));

        MentoringSession s = booked();
        assertThat(s.getStatus()).isEqualTo(MentoringSession.Status.CONFIRMED);
        assertThat(s.getPrice()).isEqualByComparingTo("0");
        assertThat(s.getPackageId()).isEqualTo(packageId);
        verify(packageService).consume(packageId, menteeId, mentorId, 60);
        verify(notifications, atLeastOnce()).notifyUser(any(), eq("SESSION_CONFIRMED"), anyString(), anyString(), anyString());
    }

    @Test
    void ifThePackageCannotBeUsedNoSessionIsCreated() {
        UUID packageId = UUID.randomUUID();
        when(packageService.consume(any(), any(), any(), anyInt()))
                .thenThrow(ApiException.conflict("PACKAGE_NOT_USABLE", "Gói đã hết buổi"));

        assertThatThrownBy(() -> service.book(mentee, new BookSessionInput(menteeId, mentorId, at(3, 10), 60, null, packageId)))
                .isInstanceOf(ApiException.class).hasMessageContaining("hết buổi");
        verify(sessionRepo, never()).save(any());
    }

    @Test
    void bookingStillRequiresAnAcceptedRelationship() {
        when(requestRepo.findFirstByMenteeIdAndMentorIdAndStatus(menteeId, mentorId, MentoringRequest.Status.ACCEPTED))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.book(mentee, new BookSessionInput(menteeId, mentorId, at(3, 10), 60, null, null)))
                .isInstanceOf(ApiException.class).hasMessageContaining("chấp nhận");
    }

    @Test
    void cancellingAPackageSessionGivesTheCreditBackAndDoesNotRefundMoney() {
        MentoringSession s = session(menteeId, mentorId, MentoringSession.Status.CONFIRMED, at(3, 10));
        UUID packageId = UUID.randomUUID();
        s.setPackageId(packageId);
        s.setPrice(BigDecimal.ZERO);
        when(sessionRepo.findById(s.getId())).thenReturn(Optional.of(s));

        service.cancel(mentee, s.getId(), null);

        assertThat(s.getStatus()).isEqualTo(MentoringSession.Status.CANCELLED);
        verify(packageService).restoreCredit(packageId);
        verify(packageService).settleRefundNow(packageId);
        verifyNoInteractions(paymentClient);
    }

    @Test
    void cancellingAPaidSingleSessionRefundsTheMoneyAndLeavesPackagesAlone() {
        MentoringSession s = session(menteeId, mentorId, MentoringSession.Status.CONFIRMED, at(3, 10));
        when(sessionRepo.findById(s.getId())).thenReturn(Optional.of(s));

        service.cancel(mentee, s.getId(), null);

        verify(paymentClient).refund(s.getId(), "SESSION_CANCELLED");
        verifyNoInteractions(packageService);
    }

    @Test
    void cancellingAnUnpaidPendingPackageSessionNeverReturnsACredit() {
        MentoringSession s = session(menteeId, mentorId, MentoringSession.Status.PENDING, at(3, 10));
        when(sessionRepo.findById(s.getId())).thenReturn(Optional.of(s));

        service.cancel(mentee, s.getId(), null);

        verifyNoInteractions(packageService);
        verifyNoInteractions(paymentClient);
    }

    @Test
    void cancellingClearsAPendingRescheduleProposal() {
        MentoringSession s = session(menteeId, mentorId, MentoringSession.Status.CONFIRMED, at(3, 10));
        s.setProposedAt(at(4, 10));
        s.setProposedBy(mentorId);
        when(sessionRepo.findById(s.getId())).thenReturn(Optional.of(s));

        service.cancel(mentee, s.getId(), null);

        assertThat(s.hasPendingProposal()).isFalse();
    }

    @Test
    void anIntroSessionCannotBeReviewed() {
        MentoringSession s = session(menteeId, mentorId, MentoringSession.Status.COMPLETED, OffsetDateTime.now().minusDays(1));
        s.setType(MentoringSession.Type.INTRO);
        when(sessionRepo.findById(s.getId())).thenReturn(Optional.of(s));

        assertThatThrownBy(() -> service.review(mentee, s.getId(), new ReviewInput(5, "ok")))
                .isInstanceOf(ApiException.class).hasMessageContaining("làm quen");
        verify(reviewRepo, never()).save(any());
    }

    @Test
    void completingAnIntroDoesNotAskTheMenteeForAReview() {
        MentoringSession s = session(menteeId, mentorId, MentoringSession.Status.CONFIRMED, OffsetDateTime.now().minusHours(1));
        s.setType(MentoringSession.Type.INTRO);
        when(sessionRepo.findById(s.getId())).thenReturn(Optional.of(s));

        service.complete(user(mentorId, "MENTOR"), s.getId());

        assertThat(s.getStatus()).isEqualTo(MentoringSession.Status.COMPLETED);
        verifyNoInteractions(notifications);
    }
}
