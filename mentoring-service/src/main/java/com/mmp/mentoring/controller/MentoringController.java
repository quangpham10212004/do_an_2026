package com.mmp.mentoring.controller;

import com.mmp.mentoring.dto.MentoringDtos.*;
import com.mmp.mentoring.security.CurrentUser;
import com.mmp.mentoring.service.MentoringRequestService;
import com.mmp.mentoring.service.NotificationService;
import com.mmp.mentoring.service.SessionService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/mentoring")
public class MentoringController {

    private final MentoringRequestService requestService;
    private final SessionService sessionService;
    private final NotificationService notificationService;

    public MentoringController(MentoringRequestService requestService, SessionService sessionService,
                               NotificationService notificationService) {
        this.requestService = requestService;
        this.sessionService = sessionService;
        this.notificationService = notificationService;
    }

    // ---- Mentoring requests (FR-5.2, FR-5.3) ----

    @PostMapping("/requests")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('MENTEE')")
    public RequestView createRequest(@Valid @RequestBody CreateRequestInput in) {
        return requestService.create(CurrentUser.get(), in);
    }

    @GetMapping("/requests")
    public List<RequestView> myRequests() {
        return requestService.mine(CurrentUser.get());
    }

    @PostMapping("/requests/{id}/respond")
    @PreAuthorize("hasAnyRole('MENTOR','ADMIN')")
    public RequestView respond(@PathVariable UUID id, @Valid @RequestBody RespondRequestInput in) {
        return requestService.respond(CurrentUser.get(), id, in);
    }

    @PostMapping("/requests/{id}/cancel")
    @PreAuthorize("hasAnyRole('MENTEE','ADMIN')")
    public RequestView cancelRequest(@PathVariable UUID id) {
        return requestService.cancel(CurrentUser.get(), id);
    }

    @PostMapping("/requests/{id}/complete")
    public RequestView completeRequest(@PathVariable UUID id) {
        return requestService.complete(CurrentUser.get(), id);
    }

    // ---- Sessions (FR-5.4 → FR-5.7) ----

    @PostMapping("/sessions")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('MENTEE','ADMIN')")
    public SessionView book(@Valid @RequestBody BookSessionInput in) {
        return sessionService.book(CurrentUser.get(), in);
    }

    @GetMapping("/sessions")
    public List<SessionView> mySessions(@RequestParam(required = false) String status) {
        return sessionService.mine(CurrentUser.get(), status);
    }

    @GetMapping("/sessions/{id}")
    public SessionView session(@PathVariable UUID id) {
        return sessionService.get(CurrentUser.get(), id);
    }

    @PostMapping("/sessions/{id}/cancel")
    public SessionView cancel(@PathVariable UUID id, @Valid @RequestBody(required = false) CancelSessionInput in) {
        return sessionService.cancel(CurrentUser.get(), id, in);
    }

    @PostMapping("/sessions/{id}/complete")
    @PreAuthorize("hasAnyRole('MENTOR','ADMIN')")
    public SessionView complete(@PathVariable UUID id) {
        return sessionService.complete(CurrentUser.get(), id);
    }

    @PostMapping("/sessions/{id}/review")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('MENTEE')")
    public ReviewView review(@PathVariable UUID id, @Valid @RequestBody ReviewInput in) {
        return sessionService.review(CurrentUser.get(), id, in);
    }

    @GetMapping("/mentors/{mentorId}/reviews")
    public List<ReviewView> mentorReviews(@PathVariable UUID mentorId) {
        return sessionService.mentorReviews(mentorId);
    }

    @GetMapping("/mentors/{mentorId}/available-slots")
    public AvailableSlotsView availableSlots(@PathVariable UUID mentorId,
                                             @RequestParam(defaultValue = "60") int durationMinutes,
                                             @RequestParam(defaultValue = "14") int days) {
        return sessionService.availableSlots(CurrentUser.get(), mentorId, durationMinutes, days);
    }

    // ---- Notifications (FR-5.5) ----

    @GetMapping("/notifications")
    public NotificationList notifications(@RequestParam(defaultValue = "30") int limit) {
        return notificationService.list(CurrentUser.get(), limit);
    }

    @PostMapping("/notifications/{id}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void markRead(@PathVariable UUID id) {
        notificationService.markRead(CurrentUser.get(), id);
    }

    @PostMapping("/notifications/read-all")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void markAllRead() {
        notificationService.markAllRead(CurrentUser.get());
    }
}
