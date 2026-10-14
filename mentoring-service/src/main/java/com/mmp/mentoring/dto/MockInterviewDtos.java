package com.mmp.mentoring.dto;

import com.mmp.mentoring.entity.MockIntake.InterviewType;
import com.mmp.mentoring.entity.MockIntake.Level;
import com.mmp.mentoring.entity.MockScorecard.Verdict;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** US-58 — phỏng vấn thử với mentor (PRD-PREP-1..5, 7). */
public final class MockInterviewDtos {

    private MockInterviewDtos() {
    }

    /** Bắt buộc khi đặt phiên session_type = MOCK_INTERVIEW. */
    public record MockIntakeInput(
            @NotNull InterviewType interviewType,
            @NotNull Level level,
            @NotNull @Size(max = 120) String targetRole,
            @Size(max = 120) String targetCompany,
            LocalDate interviewDate,
            @Size(max = 500) String jdUrl) {
    }

    public record MockIntakeView(InterviewType interviewType, Level level, String targetRole, String targetCompany,
                                 LocalDate interviewDate, String jdUrl) {
    }

    /** Điểm 0–10; liveCoding chỉ khi có bài code trực tiếp; đúng 3 điểm cần sửa. */
    public record ScorecardInput(
            @NotNull Integer technical,
            @NotNull Integer problemSolving,
            @NotNull Integer depth,
            @NotNull Integer communication,
            Integer liveCoding,
            @NotNull Verdict verdict,
            @NotNull List<String> fixes,
            @Size(max = 2000) String privateNote) {
    }

    public record ScorecardView(UUID sessionId, UUID mentorId, String mentorName, InterviewType interviewType,
                                int technical, int problemSolving, int depth, int communication, Integer liveCoding,
                                BigDecimal overall, Verdict verdict, List<String> fixes, String privateNote,
                                OffsetDateTime createdAt, OffsetDateTime updatedAt) {
    }

    /** Trọng số (%) theo dạng phỏng vấn — để form và trang kết quả hiện đúng cách tính điểm tổng. */
    public record WeightsView(int technical, int problemSolving, int depth, int communication) {
    }

    /**
     * Trang phỏng vấn thử của một phiên. canScore = người xem là mentor và phiếu đang mở để điền/sửa;
     * scorecardMissing = đã quá 48 giờ mà mentor chưa nộp phiếu.
     */
    public record MockInterviewView(UUID sessionId, String viewerRole, String sessionStatus, OffsetDateTime scheduledAt,
                                    OffsetDateTime endsAt, MockIntakeView intake, ScorecardView scorecard, boolean canScore,
                                    OffsetDateTime scorecardDueAt, boolean scorecardMissing,
                                    Map<InterviewType, WeightsView> weights) {
    }

    /** PRD-PREP-4 — một điểm trên biểu đồ tiến bộ của mentee (cũ → mới). */
    public record MockHistoryItem(UUID sessionId, OffsetDateTime scheduledAt, UUID mentorId, String mentorName,
                                  InterviewType interviewType, int technical, int problemSolving, int depth,
                                  int communication, Integer liveCoding, BigDecimal overall, Verdict verdict) {
    }
}
