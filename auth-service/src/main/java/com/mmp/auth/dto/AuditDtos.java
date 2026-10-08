package com.mmp.auth.dto;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;
import java.util.UUID;

/** US-30 (PRD-ADM-5) — nhật ký kiểm toán. */
public final class AuditDtos {

    private AuditDtos() {
    }

    /** Body của POST /internal/audit — đúng theo interface chung của Sprint 3. */
    public record AuditRequest(
            UUID actorId,
            @NotNull @Pattern(regexp = "ADMIN|MENTOR|MENTEE|SYSTEM", message = "phải là ADMIN, MENTOR, MENTEE hoặc SYSTEM")
            String actorRole,
            @NotBlank @Size(max = 100) @Pattern(regexp = "[A-Z][A-Z0-9_]*", message = "phải viết dạng UPPER_SNAKE")
            String action,
            @NotBlank @Size(max = 50) String targetType,
            @NotBlank @Size(max = 100) String targetId,
            JsonNode before,
            JsonNode after) {
    }

    public record AuditEntry(
            UUID id,
            UUID actorId,
            String actorEmail,
            String actorRole,
            String action,
            String targetType,
            String targetId,
            JsonNode before,
            JsonNode after,
            OffsetDateTime createdAt) {
    }

    /** Bộ lọc GET /api/auth/admin/audit; mọi trường đều tuỳ chọn. `to` là mốc loại trừ (created_at < to). */
    public record AuditFilter(UUID actorId, String action, String targetType, String targetId,
                              OffsetDateTime from, OffsetDateTime to) {
    }
}
