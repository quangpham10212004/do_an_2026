package com.mmp.profile.controller;

import com.mmp.profile.entity.ProfileAvatar;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;
import java.time.Duration;
import com.mmp.profile.dto.ProfileDtos.*;
import com.mmp.profile.exception.ApiException;
import com.mmp.profile.security.AuthUser;
import com.mmp.profile.security.CurrentUser;
import com.mmp.profile.service.ProfileService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
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
        MentorProfileResponse res = profileService.getMentor(userId);
        // US-04: link họp chỉ chủ hồ sơ/admin thấy; mentee nhận link qua phiên đã xác nhận (mentoring-service).
        // US-27: lý do đình chỉ cũng chỉ chủ hồ sơ/admin thấy.
        return CurrentUser.get().canAccess(userId) ? res : res.forPublicViewer();
    }

    /** US-04 — cài đặt đặt lịch (link họp, buffer, báo trước, ngôn ngữ, loại phiên, múi giờ). */
    @PutMapping("/mentor/{userId}/booking-settings")
    public MentorProfileResponse updateBookingSettings(@PathVariable UUID userId, @Valid @RequestBody BookingSettingsInput input) {
        requireOwnerWithRole(userId, "MENTOR");
        return profileService.updateBookingSettings(userId, input);
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

    /** US-08 — mentor đổi trạng thái nhận mentee (ACCEPTING / PAUSED / ON_LEAVE). */
    @PutMapping("/mentor/{userId}/status")
    public MentorProfileResponse changeStatus(@PathVariable UUID userId, @Valid @RequestBody MentorStatusInput input) {
        requireOwnerWithRole(userId, "MENTOR");
        return profileService.changeOwnStatus(userId, input);
    }

    // ---- US-07: ngoại lệ lịch rảnh ----

    @GetMapping("/mentor/{userId}/exceptions")
    public List<AvailabilityExceptionDto> listExceptions(@PathVariable UUID userId) {
        return profileService.upcomingExceptions(userId);
    }

    @PostMapping("/mentor/{userId}/exceptions")
    @ResponseStatus(HttpStatus.CREATED)
    public AvailabilityExceptionResult createException(@PathVariable UUID userId,
                                                       @Valid @RequestBody AvailabilityExceptionInput input) {
        requireOwnerWithRole(userId, "MENTOR");
        return profileService.createException(userId, input);
    }

    @PutMapping("/mentor/{userId}/exceptions/{exceptionId}")
    public AvailabilityExceptionResult updateException(@PathVariable UUID userId, @PathVariable UUID exceptionId,
                                                       @Valid @RequestBody AvailabilityExceptionInput input) {
        requireOwnerWithRole(userId, "MENTOR");
        return profileService.updateException(userId, exceptionId, input);
    }

    @DeleteMapping("/mentor/{userId}/exceptions/{exceptionId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteException(@PathVariable UUID userId, @PathVariable UUID exceptionId) {
        requireOwnerWithRole(userId, "MENTOR");
        profileService.deleteException(userId, exceptionId);
    }

    // ---- US-37: múi giờ, ảnh đại diện (mentor và mentee) ----

    /** PRD-PROF-6 — múi giờ của chính mình (IANA); mọi giờ hiển thị theo múi giờ người xem. */
    @PutMapping("/{userId}/timezone")
    public ProfileSummary updateTimezone(@PathVariable UUID userId, @Valid @RequestBody TimezoneInput input) {
        CurrentUser.requireAccess(userId);
        return profileService.updateTimezone(userId, input);
    }

    /** PRD-PROF-3 — ảnh đại diện JPG/PNG ≤ 2 MB (multipart, trường "file"). */
    @PutMapping(value = "/{userId}/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public AvatarResult uploadAvatar(@PathVariable UUID userId, @RequestParam("file") MultipartFile file) throws IOException {
        CurrentUser.requireAccess(userId);
        return profileService.uploadAvatar(userId, file.getBytes());
    }

    @DeleteMapping("/{userId}/avatar")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteAvatar(@PathVariable UUID userId) {
        CurrentUser.requireAccess(userId);
        profileService.deleteAvatar(userId);
    }

    /** Công khai (app.security.public-paths) để thẻ &lt;img&gt; tải được không cần token; URL có ?v= nên cache lâu được. */
    @GetMapping("/avatars/{userId}")
    public ResponseEntity<byte[]> avatar(@PathVariable UUID userId) {
        ProfileAvatar a = profileService.avatar(userId);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(a.getContentType()))
                .cacheControl(CacheControl.maxAge(Duration.ofDays(30)).cachePublic())
                .header("X-Content-Type-Options", "nosniff")
                .body(a.getData());
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

    /** US-16 — sở thích tìm mentor (ngày, buổi, ngân sách, ngôn ngữ); matching dùng làm bộ lọc mặc định. */
    @PutMapping("/mentee/{userId}/preferences")
    public MenteeProfileResponse updatePreferences(@PathVariable UUID userId, @Valid @RequestBody MenteePreferencesInput input) {
        requireOwnerWithRole(userId, "MENTEE");
        return profileService.updatePreferences(userId, input);
    }

    @PostMapping("/mentee/{userId}/enrichment-chat")
    public MenteeProfileResponse applyEnrichment(@PathVariable UUID userId, @Valid @RequestBody EnrichmentInput input) {
        CurrentUser.requireAccess(userId);
        return profileService.applyEnrichment(userId, input);
    }

    private static void requireOwnerWithRole(UUID ownerId, String role) {
        AuthUser user = CurrentUser.requireAccess(ownerId);
        if (!user.isAdmin() && !user.isInternal() && !role.equals(user.role())) {
            throw ApiException.forbidden("Chức năng này chỉ dành cho " + role.toLowerCase());
        }
    }
}
