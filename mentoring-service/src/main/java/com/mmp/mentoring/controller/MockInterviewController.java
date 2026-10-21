package com.mmp.mentoring.controller;

import com.mmp.mentoring.dto.MockInterviewDtos.MockHistoryItem;
import com.mmp.mentoring.dto.MockInterviewDtos.MockInterviewView;
import com.mmp.mentoring.dto.MockInterviewDtos.ScorecardInput;
import com.mmp.mentoring.security.CurrentUser;
import com.mmp.mentoring.service.MockInterviewService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/** US-58 — phỏng vấn thử với mentor: intake + phiếu đánh giá + lịch sử tiến bộ của mentee. */
@RestController
@RequestMapping("/api/mentoring")
public class MockInterviewController {

    private final MockInterviewService mock;

    public MockInterviewController(MockInterviewService mock) {
        this.mock = mock;
    }

    @GetMapping("/sessions/{id}/mock")
    public MockInterviewView get(@PathVariable UUID id) {
        return mock.get(CurrentUser.get(), id);
    }

    @PutMapping("/sessions/{id}/scorecard")
    @PreAuthorize("hasRole('MENTOR')")
    public MockInterviewView submit(@PathVariable UUID id, @Valid @RequestBody ScorecardInput in) {
        return mock.submit(CurrentUser.get(), id, in);
    }

    @GetMapping("/mock-interviews/history")
    @PreAuthorize("hasRole('MENTEE')")
    public List<MockHistoryItem> history() {
        return mock.history(CurrentUser.get());
    }
}
