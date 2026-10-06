package com.mmp.profile.controller;

import com.mmp.profile.dto.ProfileDtos.*;
import com.mmp.profile.service.ProfileService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/** Endpoint nội bộ cho service khác gọi (yêu cầu header X-Internal-Token). */
@RestController
@RequestMapping("/internal")
public class InternalProfileController {

    private final ProfileService profileService;

    public InternalProfileController(ProfileService profileService) {
        this.profileService = profileService;
    }

    @GetMapping("/profile-summary/{userId}")
    public ProfileSummary summary(@PathVariable UUID userId) {
        return profileService.summary(userId);
    }

    @GetMapping("/mentor/{mentorId}")
    public MentorProfileResponse mentor(@PathVariable UUID mentorId) {
        return profileService.getMentor(mentorId);
    }

    @PutMapping("/mentor/{mentorId}/verification")
    public MentorProfileResponse verification(@PathVariable UUID mentorId, @Valid @RequestBody VerificationUpdate body) {
        return profileService.updateVerification(mentorId, body.status());
    }

    /**
     * Interface 2 — mentoring-service đặt PAUSED (3 lần vi phạm) / SUSPENDED (tranh chấp) / ACCEPTING.
     * profile-service KHÔNG gọi lại mentoring-service ở luồng này (bên gọi tự huỷ phiên nếu cần).
     */
    @PutMapping("/mentor/{mentorId}/status")
    public MentorProfileResponse status(@PathVariable UUID mentorId, @Valid @RequestBody InternalStatusUpdate body) {
        return profileService.setStatusInternal(mentorId, body);
    }

    @PutMapping("/mentor/{mentorId}/rating")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void rating(@PathVariable UUID mentorId, @Valid @RequestBody RatingUpdate body) {
        profileService.updateRating(mentorId, body.rating(), body.ratingCount());
    }

    @PutMapping("/mentor/{mentorId}/active-mentees")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void activeMentees(@PathVariable UUID mentorId, @Valid @RequestBody ActiveMenteeUpdate body) {
        profileService.updateActiveMentees(mentorId, body.activeMenteeCount());
    }

    /** ai-service gọi sau khi người dùng xoá CV: gỡ cvFileUrl nếu hồ sơ còn trỏ tới đúng file đó. */
    @DeleteMapping("/profile/{userId}/cv-file")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void clearCvFile(@PathVariable UUID userId, @RequestParam String cvFileUrl) {
        profileService.clearCvFileUrl(userId, cvFileUrl);
    }
}
