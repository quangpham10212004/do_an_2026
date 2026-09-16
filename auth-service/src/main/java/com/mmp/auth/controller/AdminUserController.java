package com.mmp.auth.controller;

import com.mmp.auth.dto.AuthDtos.*;
import com.mmp.auth.security.CurrentUser;
import com.mmp.auth.service.UserAdminService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth/admin/users")
@PreAuthorize("hasRole('ADMIN')")
public class AdminUserController {

    private final UserAdminService userAdminService;

    public AdminUserController(UserAdminService userAdminService) {
        this.userAdminService = userAdminService;
    }

    @GetMapping
    public PageResponse<UserResponse> list(@RequestParam(required = false) String role,
                                           @RequestParam(required = false) String q,
                                           @RequestParam(defaultValue = "0") int page,
                                           @RequestParam(defaultValue = "20") int size) {
        return userAdminService.list(role, q, page, size);
    }

    @GetMapping("/stats")
    public Map<String, Long> stats() {
        return userAdminService.stats();
    }

    @PatchMapping("/{userId}/status")
    public UserResponse updateStatus(@PathVariable UUID userId, @Valid @RequestBody UpdateStatusRequest req) {
        return userAdminService.updateStatus(CurrentUser.get().userId(), userId, req.status());
    }
}
