package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.ReviewDtos.*;
import com.mmp.mentoring.entity.MenteeFeedback;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.entity.Review;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.MenteeFeedbackRepository;
import com.mmp.mentoring.repository.ReviewRepository;
import com.mmp.mentoring.repository.SessionRepository;
import com.mmp.mentoring.security.AuthUser;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.OffsetDateTime;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** US-41 (PRD-REV-1..5) — cửa sổ 14 ngày, sửa 48 giờ, điểm thành phần, phản hồi 1 lần, điểm Bayes, huy hiệu mentee. */
class ReviewServiceTest {

    private final SessionRepository sessionRepo = mock(SessionRepository.class);
    private final ReviewRepository reviewRepo = mock(ReviewRepository.class);
    private final MenteeFeedbackRepository feedbackRepo = mock(MenteeFeedbackRepository.class);
    private final ProfileClient profileClient = mock(ProfileClient.class);
    private final NotificationService notifications = mock(NotificationService.class);
    private final TransactionTemplate tx = mock(TransactionTemplate.class);
    private final ReviewService service = new ReviewService(sessionRepo, reviewRepo, feedbackRepo, profileClient, notifications, tx);

    private final UUID mentorId = UUID.randomUUID();
    private final UUID menteeId = UUID.randomUUID();
    private final AuthUser mentor = new AuthUser(mentorId, "m@x", "MENTOR");
    private final AuthUser mentee = new AuthUser(menteeId, "e@x", "MENTEE");
    private final MentoringSession session = new MentoringSession();
    private final UUID sessionId = UUID.randomUUID();
    private final List<Review> store = new ArrayList<>();
    private final List<MenteeFeedback> feedback = new ArrayList<>();

    @SuppressWarnings("unchecked")
    ReviewServiceTest() {
        ReflectionTestUtils.setField(session, "id", sessionId);
        session.setMentorId(mentorId);
        session.setMenteeId(menteeId);
        session.setScheduledAt(OffsetDateTime.now().minusDays(2));
        session.setStatus(MentoringSession.Status.COMPLETED);
        ReflectionTestUtils.setField(session, "resolvedAt", OffsetDateTime.now().minusDays(1));
        when(sessionRepo.findById(sessionId)).thenReturn(Optional.of(session));
        when(tx.execute(any())).thenAnswer(inv -> ((TransactionCallback<Object>) inv.getArgument(0)).doInTransaction(null));
        when(reviewRepo.save(any())).thenAnswer(inv -> {
            Review r = inv.getArgument(0);
            if (r.getId() == null) {
                ReflectionTestUtils.setField(r, "id", UUID.randomUUID());
                store.add(r);
            }
            return r;
        });
        when(reviewRepo.existsBySessionId(sessionId)).thenAnswer(inv -> store.stream().anyMatch(r -> r.getSessionId().equals(sessionId)));
        when(reviewRepo.findBySessionId(sessionId)).thenAnswer(inv -> store.stream().filter(r -> r.getSessionId().equals(sessionId)).findFirst());
        when(reviewRepo.findById(any())).thenAnswer(inv -> store.stream().filter(r -> r.getId().equals(inv.getArgument(0))).findFirst());
        when(reviewRepo.findByMentorIdOrderByCreatedAtDesc(mentorId)).thenAnswer(inv -> new ArrayList<>(store));
        when(reviewRepo.sumAndCount(mentorId)).thenAnswer(inv -> List.<Object[]>of(new Object[]{
                (long) store.stream().mapToInt(Review::getRating).sum(), (long) store.size()}));
        when(reviewRepo.platformMean()).thenReturn(4.0);
        when(feedbackRepo.save(any())).thenAnswer(inv -> {
            feedback.add(inv.getArgument(0));
            return inv.getArgument(0);
        });
        when(feedbackRepo.aggregate(any())).thenAnswer(inv -> List.<Object[]>of(new Object[]{(long) feedback.size(),
                feedback.stream().mapToInt(MenteeFeedback::getPreparation).average().orElse(0),
                feedback.stream().mapToInt(MenteeFeedback::getEngagement).average().orElse(0)}));
        when(profileClient.displayNames(any())).thenReturn(Map.of(menteeId, "Mentee B"));
    }

    private StructuredReviewInput input(int rating, String comment) {
        return new StructuredReviewInput(rating, 5, 4, 3, comment, List.of("practical_examples", "GOOD_LISTENER"));
    }

    @Test
    void structuredReviewIsStoredAndRatingSynced() {
        ReviewDetail d = service.create(mentee, sessionId, input(5, "Rất hữu ích"));
        assertThat(d.knowledge()).isEqualTo(5);
        assertThat(d.tags()).containsExactly("PRACTICAL_EXAMPLES", "GOOD_LISTENER");
        assertThat(d.canEdit()).isTrue();
        // Bayes: (3·4.0 + 5) / (3 + 1) = 4.25
        verify(profileClient).updateRating(mentorId, 4.25, 1L);
        verify(notifications).notifyUser(eq(mentorId), eq("REVIEW_RECEIVED"), any(), any(), any());
    }

    @Test
    void reviewOnDay15IsRejected() {
        ReflectionTestUtils.setField(session, "resolvedAt", OffsetDateTime.now().minusDays(15));
        assertThatThrownBy(() -> service.create(mentee, sessionId, input(5, null)))
                .hasFieldOrPropertyWithValue("status", HttpStatus.CONFLICT)
                .hasFieldOrPropertyWithValue("code", "REVIEW_WINDOW_CLOSED");
    }

    @Test
    void lowRatingNeedsComment() {
        assertThatThrownBy(() -> service.create(mentee, sessionId, input(2, "Tệ")))
                .hasFieldOrPropertyWithValue("code", "COMMENT_REQUIRED");
        service.create(mentee, sessionId, input(2, "Mentor đến muộn 20 phút và không chuẩn bị"));
    }

    @Test
    void unknownTagIsRejected() {
        assertThatThrownBy(() -> service.create(mentee, sessionId,
                new StructuredReviewInput(4, 4, 4, 4, null, List.of("BORING"))))
                .hasFieldOrPropertyWithValue("code", "INVALID_REVIEW_TAG");
    }

    @Test
    void editableFor48Hours() {
        service.create(mentee, sessionId, input(4, null));
        ReviewDetail d = service.update(mentee, sessionId, input(5, null));
        assertThat(d.rating()).isEqualTo(5);
        assertThat(d.updatedAt()).isNotNull();
        ReflectionTestUtils.setField(store.get(0), "createdAt", OffsetDateTime.now().minusHours(49));
        assertThatThrownBy(() -> service.update(mentee, sessionId, input(3, null)))
                .hasFieldOrPropertyWithValue("code", "REVIEW_EDIT_WINDOW_CLOSED");
    }

    @Test
    void mentorRepliesOnce() {
        ReviewDetail d = service.create(mentee, sessionId, input(4, null));
        ReviewDetail replied = service.reply(mentor, d.id(), new ReplyInput("Cảm ơn em, hẹn buổi sau!"));
        assertThat(replied.mentorReply()).isEqualTo("Cảm ơn em, hẹn buổi sau!");
        assertThatThrownBy(() -> service.reply(mentor, d.id(), new ReplyInput("Lần 2")))
                .hasFieldOrPropertyWithValue("code", "ALREADY_REPLIED");
        assertThatThrownBy(() -> service.reply(mentee, d.id(), new ReplyInput("x")))
                .hasFieldOrPropertyWithValue("status", HttpStatus.FORBIDDEN);
        assertThatThrownBy(() -> service.reply(mentor, d.id(), new ReplyInput("a".repeat(501))))
                .hasFieldOrPropertyWithValue("code", "INVALID_REPLY");
    }

    @Test
    void twoReviewsShowNewMentorNoStars() {
        store.add(review(5));
        store.add(review(5));
        MentorReviewSummary s = service.summary(mentee, mentorId);
        assertThat(s.newMentor()).isTrue();
        assertThat(s.rating()).isNull();
        store.add(review(2));
        s = service.summary(mentee, mentorId);
        assertThat(s.newMentor()).isFalse();
        // (3·4 + 12) / 6 = 4.0
        assertThat(s.rating()).isEqualTo(4.0);
    }

    @Test
    void bayesianShrinksTowardsPlatformMean() {
        assertThat(ReviewRules.bayesian(15, 3, 4.0)).isEqualTo(4.5);
        assertThat(ReviewRules.bayesian(5, 1, null)).isEqualTo(4.25);
    }

    @Test
    void menteeReliabilityNeedsThreeGoodFeedbacks() {
        for (int i = 0; i < 3; i++) {
            UUID sid = UUID.randomUUID();
            MentoringSession s = new MentoringSession();
            ReflectionTestUtils.setField(s, "id", sid);
            s.setMentorId(mentorId);
            s.setMenteeId(menteeId);
            s.setScheduledAt(OffsetDateTime.now().minusDays(1));
            s.setStatus(MentoringSession.Status.COMPLETED);
            when(sessionRepo.findById(sid)).thenReturn(Optional.of(s));
            MenteeReliability r = service.menteeFeedback(mentor, sid, new MenteeFeedbackInput(5, 4, "Chuẩn bị kỹ"));
            assertThat(r.badge()).isEqualTo(i == 2 ? "RELIABLE" : null);
        }
        assertThatThrownBy(() -> service.reliabilityFor(mentee, menteeId)).hasFieldOrPropertyWithValue("status", HttpStatus.FORBIDDEN);
        assertThat(service.reliabilityFor(mentor, menteeId).feedbackCount()).isEqualTo(3);
    }

    @Test
    void menteeFeedbackOncePerSession() {
        service.menteeFeedback(mentor, sessionId, new MenteeFeedbackInput(4, 4, null));
        when(feedbackRepo.existsById(sessionId)).thenReturn(true);
        assertThatThrownBy(() -> service.menteeFeedback(mentor, sessionId, new MenteeFeedbackInput(4, 4, null)))
                .hasFieldOrPropertyWithValue("code", "FEEDBACK_EXISTS");
        assertThatThrownBy(() -> service.menteeFeedback(mentee, sessionId, new MenteeFeedbackInput(4, 4, null)))
                .isInstanceOf(ApiException.class).hasFieldOrPropertyWithValue("status", HttpStatus.FORBIDDEN);
    }

    private Review review(int rating) {
        Review r = new Review(UUID.randomUUID(), menteeId, mentorId, rating, null);
        ReflectionTestUtils.setField(r, "id", UUID.randomUUID());
        return r;
    }
}
