package com.mmp.mentoring.controller;

import com.mmp.mentoring.dto.MentoringDtos.SuspendMentorInput;
import com.mmp.mentoring.dto.MentoringDtos.SuspendMentorResult;
import com.mmp.mentoring.service.MentorSuspensionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * US-27 (interface với profile-service, Team B) — sau khi admin chuyển mentor sang SUSPENDED, profile-service gọi endpoint
 * này (X-Internal-Token): huỷ mọi phiên sắp tới PENDING/CONFIRMED của mentor (cancelledBy SYSTEM, hoàn 100%) và báo mentee.
 * Idempotent: gọi lại trả {@code cancelledSessions: 0}.
 */
@RestController
@RequestMapping("/internal/mentors")
public class InternalMentorController {

    private final MentorSuspensionService suspension;

    public InternalMentorController(MentorSuspensionService suspension) {
        this.suspension = suspension;
    }

    @PostMapping("/{mentorId}/suspend")
    public SuspendMentorResult suspend(@PathVariable UUID mentorId, @Valid @RequestBody(required = false) SuspendMentorInput in) {
        String reason = in == null ? null : in.reason();
        UUID actorId = in == null ? null : in.actorId();
        return new SuspendMentorResult(mentorId, suspension.suspend(mentorId, reason, actorId));
    }
}
