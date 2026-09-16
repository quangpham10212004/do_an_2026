package com.mmp.mentoring.controller;

import com.mmp.mentoring.dto.MentoringDtos.*;
import com.mmp.mentoring.entity.Interview;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.repository.SessionRepository;
import com.mmp.mentoring.security.CurrentUser;
import com.mmp.mentoring.service.InterviewService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/** AI Interview (FR-7.x) — phía mentor và phía admin. */
@RestController
@RequestMapping("/api/mentoring")
public class InterviewController {

    private final InterviewService interviewService;
    private final SessionRepository sessionRepository;

    public InterviewController(InterviewService interviewService, SessionRepository sessionRepository) {
        this.interviewService = interviewService;
        this.sessionRepository = sessionRepository;
    }

    @PostMapping("/interviews")
    @PreAuthorize("hasRole('MENTOR')")
    public InterviewView start() {
        return interviewService.start(CurrentUser.get());
    }

    @GetMapping("/interviews/me")
    @PreAuthorize("hasRole('MENTOR')")
    public ResponseEntity<InterviewView> mine() {
        return interviewService.latestFor(CurrentUser.get()).map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @GetMapping("/interviews/{id}")
    public InterviewView get(@PathVariable UUID id) {
        return interviewService.get(CurrentUser.get(), id);
    }

    @PostMapping("/interviews/{id}/answers")
    @PreAuthorize("hasRole('MENTOR')")
    public InterviewView answer(@PathVariable UUID id, @Valid @RequestBody AnswerInput in) {
        return interviewService.answer(CurrentUser.get(), id, in.answer());
    }

    @GetMapping("/admin/interviews")
    @PreAuthorize("hasRole('ADMIN')")
    public List<InterviewView> list(@RequestParam(required = false) String status) {
        return interviewService.list(status);
    }

    @PostMapping("/admin/interviews/{id}/review")
    @PreAuthorize("hasRole('ADMIN')")
    public InterviewView review(@PathVariable UUID id, @Valid @RequestBody ReviewInterviewInput in) {
        return interviewService.review(CurrentUser.get(), id, in);
    }

    @GetMapping("/admin/stats")
    @PreAuthorize("hasRole('ADMIN')")
    public AdminStats stats() {
        return new AdminStats(
                sessionRepository.countByStatus(MentoringSession.Status.PENDING),
                sessionRepository.countByStatus(MentoringSession.Status.CONFIRMED),
                sessionRepository.countByStatus(MentoringSession.Status.COMPLETED),
                sessionRepository.countByStatus(MentoringSession.Status.CANCELLED),
                interviewService.countByStatus(Interview.Status.IN_PROGRESS),
                interviewService.countByStatus(Interview.Status.PENDING_REVIEW),
                interviewService.countByStatus(Interview.Status.APPROVED),
                interviewService.countByStatus(Interview.Status.REJECTED));
    }
}
