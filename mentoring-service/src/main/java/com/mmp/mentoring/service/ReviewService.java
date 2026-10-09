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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.OffsetDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * US-41 (PRD-REV-1..5) — đánh giá có cấu trúc.
 *
 * - Mentee đánh giá phiên COMPLETED trong 14 ngày (1 đánh giá / phiên), sửa được trong 48 giờ.
 * - Mentor phản hồi công khai 1 lần / đánh giá; mentor nhận xét riêng về mentee (chỉ dùng tổng hợp thành huy hiệu).
 * - Điểm đồng bộ sang profile-service = trung bình Bayes (prior 3 đánh giá ở mức trung bình nền tảng) + số đánh giá thật;
 *   giao diện chỉ hiện sao khi ≥ 3 đánh giá. Trung bình nền tảng thay đổi theo thời gian nên job mỗi đêm tính lại cho mọi
 *   mentor. Gọi profile-service NGOÀI transaction.
 */
@Service
public class ReviewService {

    private static final Logger log = LoggerFactory.getLogger(ReviewService.class);

    private final SessionRepository sessionRepo;
    private final ReviewRepository reviewRepo;
    private final MenteeFeedbackRepository feedbackRepo;
    private final ProfileClient profileClient;
    private final NotificationService notifications;
    private final TransactionTemplate tx;

    public ReviewService(SessionRepository sessionRepo, ReviewRepository reviewRepo, MenteeFeedbackRepository feedbackRepo,
                         ProfileClient profileClient, NotificationService notifications, TransactionTemplate tx) {
        this.sessionRepo = sessionRepo;
        this.reviewRepo = reviewRepo;
        this.feedbackRepo = feedbackRepo;
        this.profileClient = profileClient;
        this.notifications = notifications;
        this.tx = tx;
    }

    // ------------------------------------------------------------------ mentee đánh giá

    public ReviewDetail create(AuthUser mentee, UUID sessionId, StructuredReviewInput in) {
        String comment = ReviewRules.validateComment(in.rating(), in.comment());
        String[] tags = ReviewRules.normalizeTags(in.tags());
        OffsetDateTime now = OffsetDateTime.now();
        Review saved = tx.execute(s -> {
            MentoringSession session = findSession(sessionId);
            if (!session.getMenteeId().equals(mentee.userId())) {
                throw ApiException.forbidden("Chỉ mentee của phiên mới được đánh giá");
            }
            if (session.getStatus() != MentoringSession.Status.COMPLETED) {
                throw ApiException.conflict("SESSION_NOT_COMPLETED", "Chỉ đánh giá được sau khi phiên kết thúc");
            }
            ReviewRules.requireInWindow(session.getResolvedAt(), session.endsAt(), now);
            if (reviewRepo.existsBySessionId(sessionId)) {
                throw ApiException.conflict("ALREADY_REVIEWED", "Bạn đã đánh giá phiên này");
            }
            Review r = new Review(sessionId, session.getMenteeId(), session.getMentorId(), in.rating(), comment);
            r.write(in.rating(), in.knowledge(), in.clarity(), in.preparation(), comment, tags, now, false);
            return reviewRepo.save(r);
        });
        syncRating(saved.getMentorId());
        notifications.notifyUser(saved.getMentorId(), "REVIEW_RECEIVED", "Bạn nhận được đánh giá mới",
                "Mentee đã đánh giá " + saved.getRating() + "/5 sao. Bạn có thể phản hồi công khai một lần.",
                "/mentors/" + saved.getMentorId() + "#reviews");
        return detail(saved, mentee);
    }

    public ReviewDetail update(AuthUser mentee, UUID sessionId, StructuredReviewInput in) {
        String comment = ReviewRules.validateComment(in.rating(), in.comment());
        String[] tags = ReviewRules.normalizeTags(in.tags());
        OffsetDateTime now = OffsetDateTime.now();
        Review saved = tx.execute(s -> {
            Review r = reviewRepo.findBySessionId(sessionId)
                    .orElseThrow(() -> ApiException.notFound("REVIEW_NOT_FOUND", "Phiên này chưa có đánh giá"));
            if (!r.getMenteeId().equals(mentee.userId())) {
                throw ApiException.forbidden("Chỉ người viết mới sửa được đánh giá");
            }
            ReviewRules.requireEditable(r.getCreatedAt(), now);
            r.write(in.rating(), in.knowledge(), in.clarity(), in.preparation(), comment, tags, now, true);
            return reviewRepo.save(r);
        });
        syncRating(saved.getMentorId());
        return detail(saved, mentee);
    }

    // ------------------------------------------------------------------ mentor

    public ReviewDetail reply(AuthUser mentor, UUID reviewId, ReplyInput in) {
        String text = ReviewRules.validateReply(in.reply());
        Review saved = tx.execute(s -> {
            Review r = reviewRepo.findById(reviewId)
                    .orElseThrow(() -> ApiException.notFound("REVIEW_NOT_FOUND", "Không tìm thấy đánh giá"));
            if (!r.getMentorId().equals(mentor.userId())) {
                throw ApiException.forbidden("Chỉ mentor được đánh giá mới phản hồi được");
            }
            if (r.getMentorReply() != null) {
                throw ApiException.conflict("ALREADY_REPLIED", "Mỗi đánh giá chỉ có một phản hồi");
            }
            r.reply(text, OffsetDateTime.now());
            return reviewRepo.save(r);
        });
        notifications.notifyUser(saved.getMenteeId(), "REVIEW_REPLIED", "Mentor đã phản hồi đánh giá của bạn", text,
                "/mentors/" + saved.getMentorId() + "#reviews");
        return detail(saved, mentor);
    }

    /** PRD-REV-4 — nhận xét riêng về mentee: mentor của phiên COMPLETED, trong 14 ngày, 1 lần / phiên. */
    public MenteeReliability menteeFeedback(AuthUser mentor, UUID sessionId, MenteeFeedbackInput in) {
        String comment = in.comment() == null || in.comment().isBlank() ? null : in.comment().strip();
        OffsetDateTime now = OffsetDateTime.now();
        MenteeFeedback saved = tx.execute(s -> {
            MentoringSession session = findSession(sessionId);
            if (!session.getMentorId().equals(mentor.userId())) {
                throw ApiException.forbidden("Chỉ mentor của phiên mới nhận xét được mentee");
            }
            if (session.getStatus() != MentoringSession.Status.COMPLETED) {
                throw ApiException.conflict("SESSION_NOT_COMPLETED", "Chỉ nhận xét được sau khi phiên kết thúc");
            }
            ReviewRules.requireInWindow(session.getResolvedAt(), session.endsAt(), now);
            if (feedbackRepo.existsById(sessionId)) {
                throw ApiException.conflict("FEEDBACK_EXISTS", "Bạn đã nhận xét mentee cho phiên này");
            }
            return feedbackRepo.save(new MenteeFeedback(session, in.preparation(), in.engagement(), comment, now));
        });
        return reliability(saved.getMenteeId());
    }

    /** Huy hiệu tổng hợp — mentor (xét yêu cầu) và admin; mentee không xem được nhận xét về mình. */
    public MenteeReliability reliabilityFor(AuthUser viewer, UUID menteeId) {
        if (!viewer.isAdmin() && !viewer.isInternal() && !"MENTOR".equals(viewer.role())) {
            throw ApiException.forbidden("Chỉ mentor và quản trị viên xem được huy hiệu của mentee");
        }
        return reliability(menteeId);
    }

    // ------------------------------------------------------------------ công khai

    public MentorReviewSummary summary(AuthUser viewer, UUID mentorId) {
        List<Review> reviews = reviewRepo.findByMentorIdOrderByCreatedAtDesc(mentorId);
        Map<UUID, String> names = profileClient.displayNames(reviews.stream().map(Review::getMenteeId).toList());
        long n = reviews.size();
        Double rating = null;
        if (ReviewRules.isPublic(n)) {
            long sum = reviews.stream().mapToLong(Review::getRating).sum();
            rating = ReviewRules.bayesian(sum, n, reviewRepo.platformMean());
        }
        Map<String, Long> tags = reviews.stream().flatMap(r -> Arrays.stream(r.getTags()))
                .collect(Collectors.groupingBy(t -> t, TreeMap::new, Collectors.counting()));
        return new MentorReviewSummary(mentorId, n, !ReviewRules.isPublic(n), rating,
                avg(reviews, Review::getKnowledge), avg(reviews, Review::getClarity), avg(reviews, Review::getPreparation),
                tags, reviews.stream().map(r -> detail(r, viewer, names.get(r.getMenteeId()))).toList());
    }

    public List<ReviewDetail> list(AuthUser viewer, UUID mentorId) {
        return summary(viewer, mentorId).reviews();
    }

    // ------------------------------------------------------------------ đồng bộ điểm

    /** Điểm Bayes + số đánh giá thật sang profile-service (matching và thẻ mentor đọc từ đó). */
    public void syncRating(UUID mentorId) {
        Object[] row = reviewRepo.sumAndCount(mentorId).get(0);
        long sum = ((Number) row[0]).longValue();
        long count = ((Number) row[1]).longValue();
        double rating = count == 0 ? 0 : ReviewRules.bayesian(sum, count, reviewRepo.platformMean());
        profileClient.updateRating(mentorId, rating, count);
    }

    /** Trung bình nền tảng đổi theo thời gian → mỗi đêm tính lại điểm hiển thị của mọi mentor có đánh giá. */
    @Scheduled(cron = "${app.reviews.resync-cron:0 15 4 * * *}", zone = "${app.timezone}")
    public void resyncAll() {
        List<UUID> mentors = reviewRepo.findReviewedMentorIds();
        mentors.forEach(this::syncRating);
        if (!mentors.isEmpty()) log.info("Re-synced Bayesian rating of {} mentors", mentors.size());
    }

    // ------------------------------------------------------------------

    private MenteeReliability reliability(UUID menteeId) {
        Object[] row = feedbackRepo.aggregate(menteeId).get(0);
        long count = ((Number) row[0]).longValue();
        return new MenteeReliability(menteeId, count,
                ReviewRules.reliabilityBadge(count, ((Number) row[1]).doubleValue(), ((Number) row[2]).doubleValue()));
    }

    private ReviewDetail detail(Review r, AuthUser viewer) {
        return detail(r, viewer, profileClient.displayNames(List.of(r.getMenteeId())).get(r.getMenteeId()));
    }

    private static ReviewDetail detail(Review r, AuthUser viewer, String menteeName) {
        OffsetDateTime now = OffsetDateTime.now();
        UUID me = viewer == null ? null : viewer.userId();
        boolean canEdit = r.getMenteeId().equals(me) && !now.isAfter(r.getCreatedAt().plus(ReviewRules.EDIT_WINDOW));
        boolean canReply = r.getMentorId().equals(me) && r.getMentorReply() == null;
        return ReviewDetail.from(r, menteeName, canEdit, canReply);
    }

    private static Double avg(List<Review> reviews, ToIntFunctionNullable f) {
        OptionalDouble d = reviews.stream().map(f::apply).filter(Objects::nonNull).mapToInt(Integer::intValue).average();
        return d.isPresent() ? Math.round(d.getAsDouble() * 100) / 100.0 : null;
    }

    @FunctionalInterface
    private interface ToIntFunctionNullable {
        Integer apply(Review r);
    }

    private MentoringSession findSession(UUID id) {
        return sessionRepo.findById(id)
                .orElseThrow(() -> ApiException.notFound("SESSION_NOT_FOUND", "Không tìm thấy phiên mentoring"));
    }
}
