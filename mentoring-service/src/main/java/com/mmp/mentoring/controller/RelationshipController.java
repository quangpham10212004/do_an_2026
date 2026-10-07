package com.mmp.mentoring.controller;

import com.mmp.mentoring.dto.RelationshipDtos.*;
import com.mmp.mentoring.security.CurrentUser;
import com.mmp.mentoring.service.RelationshipWorkspaceService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * US-28 (PRD-REQ-5) — không gian mentoring: tóm tắt quan hệ, mục tiêu (1–5) và các phiên của cặp mentor–mentee.
 * Xem: hai bên tham gia + ADMIN; sửa: chỉ hai bên tham gia, khi yêu cầu còn ACCEPTED.
 */
@RestController
@RequestMapping("/api/mentoring/relationships/{relationshipId}")
public class RelationshipController {

    private final RelationshipWorkspaceService workspace;

    public RelationshipController(RelationshipWorkspaceService workspace) {
        this.workspace = workspace;
    }

    @GetMapping
    public WorkspaceView get(@PathVariable UUID relationshipId) {
        return workspace.get(CurrentUser.get(), relationshipId);
    }

    @PostMapping("/goals")
    @ResponseStatus(HttpStatus.CREATED)
    public GoalView addGoal(@PathVariable UUID relationshipId, @Valid @RequestBody GoalInput in) {
        return workspace.addGoal(CurrentUser.get(), relationshipId, in);
    }

    /** Thứ tự mới của toàn bộ mục tiêu. Khai báo trước /goals/{goalId} để "order" không bị hiểu là goalId. */
    @PutMapping("/goals/order")
    public List<GoalView> reorder(@PathVariable UUID relationshipId, @Valid @RequestBody GoalOrder in) {
        return workspace.reorder(CurrentUser.get(), relationshipId, in);
    }

    @PutMapping("/goals/{goalId}")
    public GoalView updateGoal(@PathVariable UUID relationshipId, @PathVariable UUID goalId, @Valid @RequestBody GoalUpdate in) {
        return workspace.updateGoal(CurrentUser.get(), relationshipId, goalId, in);
    }

    @DeleteMapping("/goals/{goalId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteGoal(@PathVariable UUID relationshipId, @PathVariable UUID goalId) {
        workspace.deleteGoal(CurrentUser.get(), relationshipId, goalId);
    }
}
