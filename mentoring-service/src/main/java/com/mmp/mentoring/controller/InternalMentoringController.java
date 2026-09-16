package com.mmp.mentoring.controller;

import com.mmp.mentoring.dto.MentoringDtos.*;
import com.mmp.mentoring.service.SessionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/** Endpoint nội bộ cho payment-service. */
@RestController
@RequestMapping("/internal/sessions")
public class InternalMentoringController {

    private final SessionService sessionService;

    public InternalMentoringController(SessionService sessionService) {
        this.sessionService = sessionService;
    }

    @GetMapping("/{id}")
    public SessionInternalView session(@PathVariable UUID id) {
        return sessionService.getInternal(id);
    }

    @PostMapping("/{id}/payment-succeeded")
    public SessionInternalView paymentSucceeded(@PathVariable UUID id, @Valid @RequestBody PaymentSucceededInput in) {
        return sessionService.markPaid(id, in.transactionId());
    }
}
