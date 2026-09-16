package com.mmp.profile.controller;

import com.mmp.profile.dto.ProfileDtos.*;
import com.mmp.profile.exception.ApiException;
import com.mmp.profile.security.AuthUser;
import com.mmp.profile.security.CurrentUser;
import com.mmp.profile.service.ProfileService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/profile")
public class ProfileController {

    private final ProfileService profileService;

    public ProfileController(ProfileService profileService) {
        this.profileService = profileService;
    }

    // ---- Mentor ----

    @GetMapping("/mentors")
    public PageResponse<MentorCard> searchMentors(@RequestParam(required = false) String domain,
                                                  @RequestParam(required = false) String q,
                                                  @RequestParam(defaultValue = "false") boolean includeUnverified,
                                                  @RequestParam(defaultValue = "0") int page,
                                                  @RequestParam(defaultValue = "12") int size) {
        boolean all = includeUnverified && CurrentUser.get().isAdmin();
        return profileService.searchMentors(domain, q, all, page, size);
    }

    @GetMapping("/mentor/{userId}")
    public MentorProfileResponse getMentor(@PathVariable UUID userId) {
        return profileService.getMentor(userId);
    }

    @PutMapping("/mentor/{userId}")
    public MentorProfileResponse upsertMentor(@PathVariable UUID userId, @Valid @RequestBody MentorProfileInput input) {
        requireOwnerWithRole(userId, "MENTOR");
        return profileService.upsertMentor(userId, input);
    }

    @GetMapping("/mentor/{userId}/availability")
    public List<AvailabilitySlot> getAvailability(@PathVariable UUID userId) {
        return profileService.availability(userId);
    }

    @PutMapping("/mentor/{userId}/availability")
    public List<AvailabilitySlot> replaceAvailability(@PathVariable UUID userId, @Valid @RequestBody AvailabilityInput input) {
        requireOwnerWithRole(userId, "MENTOR");
        return profileService.replaceAvailability(userId, input);
    }

    // ---- Mentee ----

    @GetMapping("/mentee/{userId}")
    public MenteeProfileResponse getMentee(@PathVariable UUID userId) {
        AuthUser user = CurrentUser.get();
        // Mentee chỉ xem được hồ sơ của chính mình; mentor/admin xem được hồ sơ mentee (để đánh giá yêu cầu mentoring)
        if ("MENTEE".equals(user.role()) && !user.userId().equals(userId)) {
            throw ApiException.forbidden("Bạn không có quyền xem hồ sơ này");
        }
        return profileService.getMentee(userId);
    }

    @PutMapping("/mentee/{userId}")
    public MenteeProfileResponse upsertMentee(@PathVariable UUID userId, @Valid @RequestBody MenteeProfileInput input) {
        requireOwnerWithRole(userId, "MENTEE");
        return profileService.upsertMentee(userId, input);
    }

    @PostMapping("/mentee/{userId}/enrichment-chat")
    public MenteeProfileResponse applyEnrichment(@PathVariable UUID userId, @Valid @RequestBody EnrichmentInput input) {
        CurrentUser.requireAccess(userId);
        return profileService.applyEnrichment(userId, input);
    }

    // ---- Admin ----

    @PostMapping("/admin/embeddings/rebuild")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Integer> rebuildEmbeddings(@RequestParam(defaultValue = "false") boolean force) {
        return profileService.rebuildAllEmbeddings(force);
    }

    private static void requireOwnerWithRole(UUID ownerId, String role) {
        AuthUser user = CurrentUser.requireAccess(ownerId);
        if (!user.isAdmin() && !user.isInternal() && !role.equals(user.role())) {
            throw ApiException.forbidden("Chức năng này chỉ dành cho " + role.toLowerCase());
        }
    }
}
