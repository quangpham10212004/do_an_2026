package com.mmp.mentoring.dto;

import com.mmp.mentoring.entity.Review;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

/** US-41 (PRD-REV-1..5) — đánh giá có cấu trúc, phản hồi của mentor, nhận xét riêng về mentee. */
public final class ReviewDtos {

    private ReviewDtos() {
    }

    /** Điểm thành phần bắt buộc với đánh giá mới (null chỉ có ở đánh giá trước US-41). */
    public record StructuredReviewInput(@NotNull @Min(1) @Max(5) Integer rating, @NotNull @Min(1) @Max(5) Integer knowledge,
                                        @NotNull @Min(1) @Max(5) Integer clarity, @NotNull @Min(1) @Max(5) Integer preparation,
                                        @Size(max = 2000) String comment, @Size(max = 10) List<String> tags) {
    }

    public record ReplyInput(@NotNull @Size(max = 2000) String reply) {
    }

    public record MenteeFeedbackInput(@NotNull @Min(1) @Max(5) Integer preparation, @NotNull @Min(1) @Max(5) Integer engagement,
                                      @Size(max = 1000) String comment) {
    }

    /** editableUntil = createdAt + 48 giờ; canEdit/canReply theo người xem. */
    public record ReviewDetail(UUID id, UUID sessionId, UUID menteeId, String menteeName, UUID mentorId, int rating,
                               Integer knowledge, Integer clarity, Integer preparation, String comment, List<String> tags,
                               OffsetDateTime createdAt, OffsetDateTime updatedAt, OffsetDateTime editableUntil,
                               String mentorReply, OffsetDateTime mentorRepliedAt, boolean canEdit, boolean canReply) {

        public static ReviewDetail from(Review r, String menteeName, boolean canEdit, boolean canReply) {
            return new ReviewDetail(r.getId(), r.getSessionId(), r.getMenteeId(), menteeName, r.getMentorId(), r.getRating(),
                    r.getKnowledge(), r.getClarity(), r.getPreparation(), r.getComment(), Arrays.asList(r.getTags()),
                    r.getCreatedAt(), r.getUpdatedAt(), r.getCreatedAt().plus(com.mmp.mentoring.service.ReviewRules.EDIT_WINDOW),
                    r.getMentorReply(), r.getMentorRepliedAt(), canEdit, canReply);
        }
    }

    /**
     * Tổng hợp công khai của mentor: rating (Bayes) chỉ có khi reviewCount ≥ 3 (newMentor = false); trung bình các điểm
     * thành phần; số lần mỗi thẻ được chọn.
     */
    public record MentorReviewSummary(UUID mentorId, long reviewCount, boolean newMentor, Double rating,
                                      Double knowledge, Double clarity, Double preparation,
                                      java.util.Map<String, Long> tags, List<ReviewDetail> reviews) {
    }

    /** PRD-REV-4 — chỉ dạng tổng hợp; badge = RELIABLE hoặc null. */
    public record MenteeReliability(UUID menteeId, long feedbackCount, String badge) {
    }
}
