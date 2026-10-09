package com.mmp.mentoring.dto;

import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.entity.RelationshipGoal;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** US-28 (PRD-REQ-5) — không gian mentoring: DTO tách riêng khỏi MentoringDtos (file của Team A). */
public final class RelationshipDtos {

    private RelationshipDtos() {
    }

    /** Tóm tắt quan hệ (yêu cầu đã chấp nhận). status = trạng thái yêu cầu (ACCEPTED, COMPLETED, ENDED, ...). */
    public record RelationshipSummary(UUID id, UUID mentorId, String mentorName, UUID menteeId, String menteeName,
                                      String goal, String sessionType, String frequency, int expectedDurationMonths,
                                      String status, OffsetDateTime createdAt, OffsetDateTime respondedAt) {
    }

    public record GoalView(UUID id, String text, String status, int position, UUID createdBy,
                           OffsetDateTime createdAt, OffsetDateTime updatedAt) {

        public static GoalView from(RelationshipGoal g) {
            return new GoalView(g.getId(), g.getText(), g.getStatus().name(), g.getPosition(), g.getCreatedBy(),
                    g.getCreatedAt(), g.getUpdatedAt());
        }
    }

    /** Phiên của cặp mentor–mentee (mới nhất trước) — bản rút gọn, không gồm link họp. */
    public record WorkspaceSession(UUID id, OffsetDateTime scheduledAt, OffsetDateTime endsAt, int durationMinutes,
                                   String status, String sessionType, String topic) {

        public static WorkspaceSession from(MentoringSession s) {
            return new WorkspaceSession(s.getId(), s.getScheduledAt(), s.endsAt(), s.getDurationMinutes(),
                    s.getStatus().name(), s.getSessionType() == null ? null : s.getSessionType().name(), s.getTopic());
        }
    }

    /**
     * readOnly = yêu cầu không còn ACCEPTED (vd. ENDED/COMPLETED); canEdit = người xem là một bên tham gia và
     * workspace không chỉ đọc (admin luôn false). openActionItems = US-40 việc còn mở của cặp (admin: rỗng).
     */
    public record WorkspaceView(RelationshipSummary request, List<GoalView> goals, List<WorkspaceSession> sessions,
                                boolean readOnly, boolean canEdit, int maxGoals,
                                List<SessionNotesDtos.ActionItemView> openActionItems) {
    }

    /** text 5–300 ký tự sau khi trim (kiểm tra ở GoalRules). */
    public record GoalInput(@NotNull @Size(max = 1000) String text) {
    }

    /** Cập nhật một phần: ít nhất một trong text / status. */
    public record GoalUpdate(@Size(max = 1000) String text, RelationshipGoal.Status status) {
    }

    /** Thứ tự mới — phải gồm đúng toàn bộ id mục tiêu hiện có. */
    public record GoalOrder(@NotNull @Size(max = 20) List<UUID> goalIds) {
    }
}
