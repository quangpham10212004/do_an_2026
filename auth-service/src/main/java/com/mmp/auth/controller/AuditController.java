package com.mmp.auth.controller;

import com.mmp.auth.dto.AuditDtos.AuditEntry;
import com.mmp.auth.dto.AuditDtos.AuditFilter;
import com.mmp.auth.dto.AuditDtos.AuditRequest;
import com.mmp.auth.dto.AuthDtos.PageResponse;
import com.mmp.auth.service.AuditService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * US-30 (PRD-ADM-5) — nhật ký kiểm toán.
 * <ul>
 *   <li>POST /internal/audit (X-Internal-Token) → 202: các service ghi hành động admin và dòng tiền (bắn-rồi-quên).</li>
 *   <li>GET /api/auth/admin/audit (ADMIN): lọc + phân trang. Alias /api/admin/audit theo brief; frontend gọi qua
 *       proxy /api/auth/** nên dùng đường dẫn đầu.</li>
 * </ul>
 * Không có endpoint sửa/xoá — nhật ký chỉ thêm (trigger DB chặn UPDATE/DELETE).
 */
@RestController
public class AuditController {

    private final AuditService auditService;

    public AuditController(AuditService auditService) {
        this.auditService = auditService;
    }

    @PostMapping("/internal/audit")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void record(@Valid @RequestBody AuditRequest request) {
        auditService.record(request);
    }

    @GetMapping({"/api/auth/admin/audit", "/api/admin/audit"})
    @PreAuthorize("hasRole('ADMIN')")
    public PageResponse<AuditEntry> search(@RequestParam(required = false) UUID actorId,
                                           @RequestParam(required = false) String action,
                                           @RequestParam(required = false) String targetType,
                                           @RequestParam(required = false) String targetId,
                                           @RequestParam(required = false) String from,
                                           @RequestParam(required = false) String to,
                                           @RequestParam(defaultValue = "0") int page,
                                           @RequestParam(defaultValue = "20") int size) {
        AuditFilter filter = new AuditFilter(actorId, action, targetType, targetId,
                AuditService.parseBound(from, false), AuditService.parseBound(to, true));
        return auditService.search(filter, page, size);
    }
}
