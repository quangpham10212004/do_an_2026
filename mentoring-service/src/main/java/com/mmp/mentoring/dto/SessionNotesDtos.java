package com.mmp.mentoring.dto;

import com.mmp.mentoring.entity.ActionItem;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** US-40 (PRD-SES-10..12) — ghi chú phiên, action item, ghi chú riêng của mentor. */
public final class SessionNotesDtos {

    private SessionNotesDtos() {
    }

    /** version = 0 khi chưa ai lưu; gửi lại làm baseVersion khi lưu. */
    public record SharedNoteView(String content, int version, UUID updatedBy, String updatedByName, OffsetDateTime updatedAt) {
    }

    /** carriedOver = việc còn mở từ phiên trước của cặp; overdue = quá hạn mà chưa xong. */
    public record ActionItemView(UUID id, UUID sessionId, String text, String owner, LocalDate dueDate, boolean done,
                                 OffsetDateTime doneAt, UUID createdBy, OffsetDateTime createdAt, boolean carriedOver,
                                 boolean overdue) {

        public static ActionItemView from(ActionItem a, UUID currentSessionId, LocalDate today) {
            return new ActionItemView(a.getId(), a.getSessionId(), a.getText(), a.getOwner().name(), a.getDueDate(), a.isDone(),
                    a.getDoneAt(), a.getCreatedBy(), a.getCreatedAt(),
                    currentSessionId != null && !currentSessionId.equals(a.getSessionId()),
                    !a.isDone() && a.getDueDate() != null && a.getDueDate().isBefore(today));
        }
    }

    public record PrivateNoteView(String content, OffsetDateTime updatedAt) {
    }

    /** privateNote chỉ có khi người xem là mentor của phiên (mentee luôn null). */
    public record SessionNotesView(UUID sessionId, SharedNoteView shared, List<ActionItemView> actionItems,
                                   PrivateNoteView privateNote, boolean editable, String viewerRole, int maxActionItems) {
    }

    public record SaveNoteInput(@NotNull @Size(max = 20000) String content, @NotNull @Min(0) Integer baseVersion) {
    }

    public record SavePrivateNoteInput(@NotNull @Size(max = 10000) String content) {
    }

    public record ActionItemInput(@NotNull @Size(max = 1000) String text, @NotNull ActionItem.Owner owner, LocalDate dueDate) {
    }

    /** Cập nhật một phần; clearDueDate = true để bỏ hạn. */
    public record ActionItemUpdate(@Size(max = 1000) String text, ActionItem.Owner owner, LocalDate dueDate,
                                   Boolean clearDueDate, Boolean done) {
    }
}
