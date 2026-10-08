package com.mmp.mentoring.controller;

import com.mmp.mentoring.dto.MentoringDtos.*;
import com.mmp.mentoring.security.CurrentUser;
import com.mmp.mentoring.service.IntroService;
import com.mmp.mentoring.service.MentoringRequestService;
import com.mmp.mentoring.service.NotificationService;
import com.mmp.mentoring.service.PackageService;
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
    private final IntroService introService;
    private final RescheduleService rescheduleService;
    private final PackageService packageService;

    public MentoringController(MentoringRequestService requestService, SessionService sessionService,
                               NotificationService notificationService, IntroService introService,
                               RescheduleService rescheduleService, PackageService packageService) {
        this.requestService = requestService;
        this.sessionService = sessionService;
        this.notificationService = notificationService;
        this.introService = introService;
        this.rescheduleService = rescheduleService;
        this.packageService = packageService;
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

    // ---- Buổi làm quen: mentor đồng ý INTRO → mentee đặt buổi → mỗi bên chọn tiếp tục hay dừng ----

    @PostMapping("/requests/{id}/intro-session")
    @PreAuthorize("hasAnyRole('MENTEE','ADMIN')")
    public RequestView bookIntro(@PathVariable UUID id, @Valid @RequestBody IntroSessionInput in) {
        return introService.bookIntro(CurrentUser.get(), id, in);
    }

    @PostMapping("/requests/{id}/decision")
    @PreAuthorize("hasAnyRole('MENTEE','MENTOR')")
    public RequestView decide(@PathVariable UUID id, @Valid @RequestBody DecisionInput in) {
        return introService.decide(CurrentUser.get(), id, in);
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

    /** Dời lịch: áp dụng ngay nếu đủ điều kiện, ngược lại gửi đề xuất cho bên còn lại. */
    @PostMapping("/sessions/{id}/reschedule")
    public SessionView reschedule(@PathVariable UUID id, @Valid @RequestBody RescheduleInput in) {
        return rescheduleService.reschedule(CurrentUser.get(), id, in);
    }

    /** Đồng ý/từ chối đề xuất đổi lịch (người đề xuất gọi với accept=false để rút lại). */
    @PostMapping("/sessions/{id}/reschedule/respond")
    public SessionView respondReschedule(@PathVariable UUID id, @Valid @RequestBody RescheduleResponseInput in) {
        return rescheduleService.respond(CurrentUser.get(), id, in);
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
                                             @RequestParam(defaultValue = "14") int days,
                                             @RequestParam(required = false) UUID excludeSessionId) {
        return sessionService.availableSlots(CurrentUser.get(), mentorId, durationMinutes, days, excludeSessionId);
    }

    // ---- Gói buổi (combo) ----

    @GetMapping("/mentors/{mentorId}/package-options")
    public PackageOptionsView packageOptions(@PathVariable UUID mentorId, @RequestParam(required = false) Integer durationMinutes) {
        return packageService.options(mentorId, durationMinutes);
    }

    @PostMapping("/packages")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('MENTEE')")
    public PackageView purchasePackage(@Valid @RequestBody PurchasePackageInput in) {
        return packageService.purchase(CurrentUser.get(), in);
    }

    @GetMapping("/packages")
    public List<PackageView> myPackages() {
        return packageService.mine(CurrentUser.get());
    }

    @PostMapping("/packages/{id}/cancel")
    @PreAuthorize("hasAnyRole('MENTEE','ADMIN')")
    public PackageView cancelPackage(@PathVariable UUID id) {
        return packageService.cancel(CurrentUser.get(), id);
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

    /** Thống kê phiên mentoring; số liệu AI Interview do ai-service cung cấp (GET /api/ai/admin/stats). */
    @GetMapping("/admin/stats")
    @PreAuthorize("hasRole('ADMIN')")
    public AdminStats stats() {
        return sessionService.adminStats();
    }
}
