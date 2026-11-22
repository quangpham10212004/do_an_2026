package com.mmp.mentoring.controller;

import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.security.CurrentUser;
import com.mmp.mentoring.service.NotificationService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Admin yêu cầu thêm bằng chứng từ một hoặc hai bên của tranh chấp; tranh chấp giữ nguyên trạng thái. */
@RestController
@RequestMapping("/api/mentoring/admin/disputes/{id}")
@PreAuthorize("hasRole('ADMIN')")
public class AdminDisputeEvidenceController {

    public record EvidenceInput(@NotBlank @Pattern(regexp = "MENTEE|MENTOR|BOTH") String from,
                                @Size(max = 1000) String message) {}

    private static final String LINK = "/mentoring/sessions";

    private final JdbcTemplate jdbc;
    private final NotificationService notifications;

    public AdminDisputeEvidenceController(JdbcTemplate jdbc, NotificationService notifications) {
        this.jdbc = jdbc;
        this.notifications = notifications;
    }

    /** { evidenceRequestedFrom: ["MENTEE" | "MENTOR"] } */
    @GetMapping("/context")
    public Map<String, Object> context(@PathVariable UUID id) {
        requireDispute(id);
        return Map.of("evidenceRequestedFrom",
                jdbc.queryForList("SELECT party FROM dispute_evidence_requests WHERE dispute_id = ? ORDER BY requested_at", String.class, id));
    }

    @PostMapping("/request-evidence")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void requestEvidence(@PathVariable UUID id, @Valid @RequestBody EvidenceInput in) {
        UUID sessionId = requireDispute(id);
        Map<String, Object> s = jdbc.queryForMap("SELECT mentee_id, mentor_id FROM sessions WHERE id = ?", sessionId);
        List<String> parties = "BOTH".equals(in.from()) ? List.of("MENTEE", "MENTOR") : List.of(in.from());
        String text = in.message() == null || in.message().isBlank()
                ? "Quản trị viên cần thêm bằng chứng cho báo cáo sự cố của phiên học này."
                : "Quản trị viên cần thêm bằng chứng: " + in.message().trim();
        UUID admin = CurrentUser.get().userId();
        List<UUID> recipients = new ArrayList<>();
        for (String party : parties) {
            jdbc.update("""
                    INSERT INTO dispute_evidence_requests (dispute_id, party, message, requested_by) VALUES (?, ?, ?, ?)
                    ON CONFLICT (dispute_id, party) DO UPDATE SET message = EXCLUDED.message, requested_by = EXCLUDED.requested_by,
                        requested_at = now()
                    """, id, party, in.message(), admin);
            recipients.add((UUID) s.get("MENTEE".equals(party) ? "mentee_id" : "mentor_id"));
        }
        recipients.forEach(user -> notifications.notifyUser(user, "DISPUTE_EVIDENCE_REQUESTED", "Cần bổ sung bằng chứng", text, LINK + "/" + sessionId));
    }

    private UUID requireDispute(UUID id) {
        List<UUID> rows = jdbc.query("SELECT session_id FROM disputes WHERE id = ?", (rs, i) -> rs.getObject(1, UUID.class), id);
        if (rows.isEmpty()) throw ApiException.notFound("DISPUTE_NOT_FOUND", "Không tìm thấy tranh chấp");
        return rows.get(0);
    }
}
