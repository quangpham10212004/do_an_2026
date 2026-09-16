package com.mmp.mentoring.dto;

import com.mmp.mentoring.client.AiModels.ParsedCv;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class MentoringDtos {

    private MentoringDtos() {
    }

    // ---------- Mentoring requests ----------

    public record CreateRequestInput(@NotNull UUID mentorId, @Size(max = 1000) String message) {
    }

    public record RespondRequestInput(@NotNull @Pattern(regexp = "ACCEPT|REJECT") String decision, @Size(max = 1000) String note) {
    }

    public record RequestView(UUID id, UUID menteeId, String menteeName, UUID mentorId, String mentorName, String message,
                              String status, String responseNote, OffsetDateTime createdAt, OffsetDateTime respondedAt) {
    }

    // ---------- Sessions ----------

    public record BookSessionInput(
            @NotNull UUID menteeId,
            @NotNull UUID mentorId,
            @NotNull @Future OffsetDateTime scheduledAt,
            @Min(30) @Max(180) Integer durationMinutes,
            @Size(max = 300) String topic) {
    }

    public record SlotView(OffsetDateTime startAt, OffsetDateTime endAt) {
    }

    public record AvailableSlotsView(String timezone, int durationMinutes, BigDecimal price, List<SlotView> slots) {
    }

    public record CancelSessionInput(@Size(max = 300) String reason) {
    }

    public record SessionView(UUID id, UUID requestId, UUID menteeId, String menteeName, UUID mentorId, String mentorName,
                              OffsetDateTime scheduledAt, int durationMinutes, BigDecimal price, String topic,
                              String status, boolean reviewed, Integer reviewRating, OffsetDateTime createdAt) {
    }

    /** Dạng rút gọn cho payment-service gọi nội bộ. */
    public record SessionInternalView(UUID id, UUID menteeId, UUID mentorId, OffsetDateTime scheduledAt,
                                      int durationMinutes, BigDecimal price, String status) {
    }

    public record PaymentSucceededInput(@NotNull UUID transactionId) {
    }

    public record ReviewInput(@NotNull @Min(1) @Max(5) Integer rating, @Size(max = 2000) String comment) {
    }

    public record ReviewView(UUID id, UUID sessionId, UUID menteeId, String menteeName, UUID mentorId, int rating,
                             String comment, OffsetDateTime createdAt) {
    }

    // ---------- Notifications ----------

    public record NotificationView(UUID id, String type, String title, String message, String link, boolean read,
                                   OffsetDateTime createdAt) {
    }

    public record NotificationList(long unreadCount, List<NotificationView> items) {
    }

    // ---------- AI Interview ----------

    public record AnswerInput(@NotBlank @Size(max = 5000) String answer) {
    }

    public record InterviewTurnView(int turnNo, String topic, String strategy, String question, String answer,
                                    Float score, String feedback, OffsetDateTime askedAt, OffsetDateTime answeredAt) {
    }

    public record InterviewView(UUID id, UUID mentorId, String mentorName, String domain, List<String> skills,
                                String status, String engine, int maxTurns, int currentTurn,
                                InterviewTurnView currentQuestion, List<InterviewTurnView> turns,
                                Float overallScore, String summary, List<String> strengths, List<String> weaknesses,
                                String recommendation, String reviewNote, OffsetDateTime createdAt,
                                OffsetDateTime completedAt, OffsetDateTime reviewedAt) {
    }

    public record ReviewInterviewInput(@NotNull @Pattern(regexp = "APPROVE|REJECT") String decision,
                                       @Size(max = 2000) String note) {
    }

    // ---------- CV + Enrichment ----------

    public record CvView(UUID id, String fileName, String engine, ParsedCv parsed, OffsetDateTime createdAt) {
    }

    public record EnrichmentMessageView(int turnNo, String slot, String slotLabel, String question, String answer) {
    }

    public record ConversationView(UUID id, UUID menteeId, UUID cvId, String status, String engine, int maxTurns,
                                   int currentTurn, EnrichmentMessageView currentQuestion,
                                   List<EnrichmentMessageView> messages, String enrichedGoal, boolean profileSynced,
                                   OffsetDateTime createdAt, OffsetDateTime completedAt) {
    }

    public record CvUploadResult(CvView cv, ConversationView conversation) {
    }

    public record AdminStats(long pendingSessions, long confirmedSessions, long completedSessions, long cancelledSessions,
                             long interviewsInProgress, long interviewsPendingReview, long mentorsApproved,
                             long mentorsRejected) {
    }
}
