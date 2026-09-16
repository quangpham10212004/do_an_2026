package com.mmp.payment.controller;

import com.mmp.payment.dto.PaymentDtos.*;
import com.mmp.payment.security.CurrentUser;
import com.mmp.payment.service.PaymentService;
import com.mmp.payment.service.ReferralService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/payment")
public class PaymentController {

    private final PaymentService paymentService;
    private final ReferralService referralService;

    public PaymentController(PaymentService paymentService, ReferralService referralService) {
        this.paymentService = paymentService;
        this.referralService = referralService;
    }

    @PostMapping("/charge")
    @PreAuthorize("hasAnyRole('MENTEE','ADMIN')")
    public TransactionResponse charge(@Valid @RequestBody ChargeRequest req) {
        return paymentService.charge(CurrentUser.get(), req);
    }

    @GetMapping("/transactions")
    public List<TransactionResponse> myTransactions() {
        return paymentService.mine(CurrentUser.get());
    }

    @GetMapping("/transactions/{id}")
    public TransactionResponse transaction(@PathVariable UUID id) {
        return paymentService.get(CurrentUser.get(), id);
    }

    @GetMapping("/sessions/{sessionId}/transactions")
    public List<TransactionResponse> sessionTransactions(@PathVariable UUID sessionId) {
        return paymentService.bySession(CurrentUser.get(), sessionId);
    }

    @GetMapping("/referrals/me")
    public MyReferralOverview myReferral() {
        return referralService.overview(CurrentUser.get().userId());
    }

    // ---- Admin (giám sát giao dịch/referral) ----

    @GetMapping("/admin/transactions")
    @PreAuthorize("hasRole('ADMIN')")
    public PageResponse<TransactionResponse> allTransactions(@RequestParam(required = false) String status,
                                                             @RequestParam(defaultValue = "0") int page,
                                                             @RequestParam(defaultValue = "20") int size) {
        return paymentService.search(status, page, size);
    }

    @GetMapping("/admin/stats")
    @PreAuthorize("hasRole('ADMIN')")
    public PaymentStats stats() {
        return paymentService.stats();
    }

    @GetMapping("/admin/referrals")
    @PreAuthorize("hasRole('ADMIN')")
    public List<ReferralResponse> allReferrals() {
        return referralService.all();
    }
}
