package com.mmp.profile.controller;

import com.mmp.profile.dto.ProfileDtos.AdminMentorRow;
import com.mmp.profile.dto.ProfileDtos.PageResponse;
import com.mmp.profile.dto.ProfileDtos.SuspendInput;
import com.mmp.profile.dto.ProfileDtos.SuspensionResult;
import com.mmp.profile.security.CurrentUser;
import com.mmp.profile.service.MentorSuspensionService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/** US-27 (PRD-ADM-3) — admin quản lý mentor: danh sách, đình chỉ, gỡ đình chỉ. Chỉ role ADMIN. */
@RestController
@RequestMapping("/api/profile/admin/mentors")
@PreAuthorize("hasRole('ADMIN')")
public class AdminMentorController {

    private final MentorSuspensionService suspensions;

    public AdminMentorController(MentorSuspensionService suspensions) {
        this.suspensions = suspensions;
    }

    @GetMapping
    public PageResponse<AdminMentorRow> list(@RequestParam(required = false) String q,
                                             @RequestParam(required = false) String status,
                                             @RequestParam(required = false) String verification,
                                             @RequestParam(defaultValue = "0") int page,
                                             @RequestParam(defaultValue = "20") int size) {
        return suspensions.list(q, status, verification, page, size);
    }

    @PostMapping("/{mentorId}/suspend")
    public SuspensionResult suspend(@PathVariable UUID mentorId, @Valid @RequestBody SuspendInput input) {
        return suspensions.suspend(mentorId, input.reason(), CurrentUser.get().userId());
    }

    @PostMapping("/{mentorId}/unsuspend")
    public SuspensionResult unsuspend(@PathVariable UUID mentorId) {
        return suspensions.unsuspend(mentorId, CurrentUser.get().userId());
    }
}
