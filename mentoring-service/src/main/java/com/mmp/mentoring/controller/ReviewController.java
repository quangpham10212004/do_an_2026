package com.mmp.mentoring.controller;

import com.mmp.mentoring.dto.ReviewDtos.*;
import com.mmp.mentoring.security.CurrentUser;
import com.mmp.mentoring.service.ReviewService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/** US-41 (PRD-REV-1..5) — đánh giá có cấu trúc, phản hồi của mentor, nhận xét riêng về mentee. */
@RestController
@RequestMapping("/api/mentoring")
public class ReviewController {

    private final ReviewService reviews;

    public ReviewController(ReviewService reviews) {
        this.reviews = reviews;
    }

    @PostMapping("/sessions/{id}/review")
    @ResponseStatus(HttpStatus.CREATED)
    public ReviewDetail create(@PathVariable UUID id, @Valid @RequestBody StructuredReviewInput in) {
        return reviews.create(CurrentUser.get(), id, in);
    }

    /** Sửa trong 48 giờ sau khi đăng. */
    @PutMapping("/sessions/{id}/review")
    public ReviewDetail update(@PathVariable UUID id, @Valid @RequestBody StructuredReviewInput in) {
        return reviews.update(CurrentUser.get(), id, in);
    }

    @PostMapping("/reviews/{reviewId}/reply")
    public ReviewDetail reply(@PathVariable UUID reviewId, @Valid @RequestBody ReplyInput in) {
        return reviews.reply(CurrentUser.get(), reviewId, in);
    }

    @PostMapping("/sessions/{id}/mentee-feedback")
    @ResponseStatus(HttpStatus.CREATED)
    public MenteeReliability menteeFeedback(@PathVariable UUID id, @Valid @RequestBody MenteeFeedbackInput in) {
        return reviews.menteeFeedback(CurrentUser.get(), id, in);
    }

    @GetMapping("/mentees/{menteeId}/reliability")
    public MenteeReliability reliability(@PathVariable UUID menteeId) {
        return reviews.reliabilityFor(CurrentUser.get(), menteeId);
    }

    /** Danh sách đánh giá (mới nhất trước) — giữ đường dẫn cũ, mỗi phần tử có thêm điểm thành phần, thẻ, phản hồi. */
    @GetMapping("/mentors/{mentorId}/reviews")
    public List<ReviewDetail> mentorReviews(@PathVariable UUID mentorId) {
        return reviews.list(CurrentUser.get(), mentorId);
    }

    /** Tổng hợp công khai: điểm Bayes chỉ khi ≥ 3 đánh giá, trung bình điểm thành phần, thẻ. */
    @GetMapping("/mentors/{mentorId}/review-summary")
    public MentorReviewSummary summary(@PathVariable UUID mentorId) {
        return reviews.summary(CurrentUser.get(), mentorId);
    }
}
