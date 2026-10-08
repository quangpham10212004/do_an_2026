package com.mmp.mentoring.controller;

import com.mmp.mentoring.dto.MentoringDtos.*;
import com.mmp.mentoring.security.CurrentUser;
import com.mmp.mentoring.service.AttendanceService;
import com.mmp.mentoring.service.DisputeService;
import com.mmp.mentoring.service.MentoringRequestService;
import com.mmp.mentoring.service.NotificationService;
import com.mmp.mentoring.service.RescheduleService;
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
    private final RescheduleService rescheduleService;
    private final AttendanceService attendanceService;
    private final DisputeService disputeService;

    public MentoringController(MentoringRequestService requestService, SessionService sessionService,
                               NotificationService notificationService, RescheduleService rescheduleService,
                               AttendanceService attendanceService, DisputeService disputeService) {
        this.requestService = requestService;
        this.sessionService = sessionService;
        this.notificationService = notificationService;
        this.rescheduleService = rescheduleService;
        this.attendanceService = attendanceService;
        this.disputeService = disputeService;
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

    @GetMapping("/sessions/{id}/cancel-preview")
    public CancelPreviewView cancelPreview(@PathVariable UUID id) {
        return sessionService.cancelPreview(CurrentUser.get(), id);
    }

    @PostMapping("/sessions/{id}/cancel")
    public SessionView cancel(@PathVariable UUID id, @Valid @RequestBody(required = false) CancelSessionInput in) {
        return sessionService.cancel(CurrentUser.get(), id, in);
    }

    @PutMapping("/sessions/{id}/meeting-link")
    @PreAuthorize("hasAnyRole('MENTOR','ADMIN')")
    public SessionView updateMeetingLink(@PathVariable UUID id, @Valid @RequestBody MeetingLinkInput in) {
        return sessionService.updateMeetingLink(CurrentUser.get(), id, in);
    }

    // ---- US-06: dời lịch ----

    @PostMapping("/sessions/{id}/reschedule")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('MENTEE','MENTOR')")
    public RescheduleView proposeReschedule(@PathVariable UUID id, @Valid @RequestBody RescheduleInput in) {
        return rescheduleService.propose(CurrentUser.get(), id, in);
    }

    @PostMapping("/reschedules/{id}/accept")
    @PreAuthorize("hasAnyRole('MENTEE','MENTOR')")
    public SessionView acceptReschedule(@PathVariable UUID id) {
        return rescheduleService.accept(CurrentUser.get(), id);
    }

    @PostMapping("/reschedules/{id}/decline")
    @PreAuthorize("hasAnyRole('MENTEE','MENTOR')")
    public RescheduleView declineReschedule(@PathVariable UUID id) {
        return rescheduleService.decline(CurrentUser.get(), id);
    }

    /** Giữ từ Sprint 1 — US-12: = mentor trả lời HELD (chỉ trong 48 giờ sau giờ kết thúc). */
    @PostMapping("/sessions/{id}/complete")
    @PreAuthorize("hasAnyRole('MENTOR','ADMIN')")
    public SessionView complete(@PathVariable UUID id) {
        attendanceService.completeByMentor(CurrentUser.get(), id);
        return sessionService.get(CurrentUser.get(), id);
    }

    /** US-12 — xác nhận tham dự sau phiên (mentee / mentor của phiên). */
    @PostMapping("/sessions/{id}/attendance")
    @PreAuthorize("hasAnyRole('MENTEE','MENTOR')")
    public SessionView attendance(@PathVariable UUID id, @Valid @RequestBody AttendanceInput in) {
        attendanceService.answer(CurrentUser.get(), id, in.answer());
        return sessionService.get(CurrentUser.get(), id);
    }

    // ---- US-32: tranh chấp ----

    /** "Báo cáo sự cố" — mentee / mentor của phiên, trong 7 ngày sau giờ kết thúc. */
    @PostMapping("/sessions/{id}/disputes")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('MENTEE','MENTOR')")
    public DisputeView openDispute(@PathVariable UUID id, @Valid @RequestBody OpenDisputeInput in) {
        return disputeService.open(CurrentUser.get(), id, in);
    }

    @GetMapping("/sessions/{id}/disputes")
    public List<DisputeView> sessionDisputes(@PathVariable UUID id) {
        return disputeService.forSession(CurrentUser.get(), id);
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
                                             @RequestParam(defaultValue = "14") int days,
                                             @RequestParam(required = false) UUID excludeSessionId) {
        return sessionService.availableSlots(CurrentUser.get(), mentorId, durationMinutes, days, excludeSessionId);
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

    // ---- Admin ----

    /** US-32 — status: OPEN | IN_REVIEW | RESOLVED | ACTIVE (OPEN + IN_REVIEW); trống = tất cả. */
    @GetMapping("/admin/disputes")
    @PreAuthorize("hasRole('ADMIN')")
    public List<DisputeView> disputes(@RequestParam(required = false) String status) {
        return disputeService.list(status);
    }

    @GetMapping("/admin/disputes/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public DisputeView dispute(@PathVariable UUID id) {
        return disputeService.get(id);
    }

    @PostMapping("/admin/disputes/{id}/start-review")
    @PreAuthorize("hasRole('ADMIN')")
    public DisputeView startReview(@PathVariable UUID id) {
        return disputeService.startReview(CurrentUser.get(), id);
    }

    @PostMapping("/admin/disputes/{id}/resolve")
    @PreAuthorize("hasRole('ADMIN')")
    public DisputeView resolveDispute(@PathVariable UUID id, @Valid @RequestBody ResolveDisputeInput in) {
        return disputeService.resolve(CurrentUser.get(), id, in);
    }

    /** Thống kê phiên mentoring; số liệu AI Interview do ai-service cung cấp (GET /api/ai/admin/stats). */
    @GetMapping("/admin/stats")
    @PreAuthorize("hasRole('ADMIN')")
    public AdminStats stats() {
        return sessionService.adminStats();
    }
}
