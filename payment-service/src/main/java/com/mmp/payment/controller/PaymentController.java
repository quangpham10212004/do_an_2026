package com.mmp.payment.controller;

import com.mmp.payment.dto.PaymentDtos.*;
import com.mmp.payment.dto.PayoutDtos;
import com.mmp.payment.service.PayoutService;
import com.mmp.payment.service.ReceiptService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import com.mmp.payment.security.CurrentUser;
import com.mmp.payment.service.EarningService;
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
    private final EarningService earningService;
    private final PayoutService payoutService;
    private final ReceiptService receiptService;
    private final com.mmp.payment.service.MentorReferralService mentorReferrals;

    public PaymentController(PaymentService paymentService, ReferralService referralService, EarningService earningService,
                             PayoutService payoutService, ReceiptService receiptService,
                             com.mmp.payment.service.MentorReferralService mentorReferrals) {
        this.mentorReferrals = mentorReferrals;
        this.payoutService = payoutService;
        this.receiptService = receiptService;
        this.paymentService = paymentService;
        this.referralService = referralService;
        this.earningService = earningService;
    }

    @PostMapping("/charge")
    @PreAuthorize("hasAnyRole('MENTEE','ADMIN')")
    public TransactionResponse charge(@RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
                                      @Valid @RequestBody ChargeRequest req) {
        return paymentService.charge(CurrentUser.get(), idempotencyKey, req);
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

    /** Bản chốt v2.0 §11 — mã giới thiệu theo mentor (chỉ mentor đã hoàn thành ≥ 1 buổi thường đã trả), lượt giới thiệu, tiền thưởng. */
    @GetMapping("/referrals/me")
    public MyMentorReferrals myReferral() {
        return mentorReferrals.overview(CurrentUser.get().userId());
    }

    /** Lấy (hoặc tạo lần đầu) mã giới thiệu của cặp (tôi, mentor); 409 REFERRAL_NOT_ELIGIBLE nếu chưa hoàn thành buổi nào với mentor. */
    @PostMapping("/referrals/codes")
    @PreAuthorize("hasRole('MENTEE')")
    public MentorReferralCodeView referralCode(@Valid @RequestBody ReferralCodeRequest req) {
        return mentorReferrals.codeFor(CurrentUser.get().userId(), req.mentorId());
    }

    // ---- US-25: thu nhập mentor ----

    @GetMapping("/earnings/summary")
    @PreAuthorize("hasRole('MENTOR')")
    public EarningSummary earningSummary() {
        return earningService.summary(CurrentUser.get().userId());
    }

    @GetMapping("/earnings")
    @PreAuthorize("hasRole('MENTOR')")
    public List<EarningRow> earnings() {
        return earningService.rows(CurrentUser.get().userId());
    }

    // ---- US-42: rút tiền, biên lai, CSV ----

    @GetMapping("/payouts/overview")
    @PreAuthorize("hasRole('MENTOR')")
    public PayoutDtos.PayoutOverview payoutOverview() {
        return payoutService.overview(CurrentUser.get().userId());
    }

    @PutMapping("/bank-account")
    @PreAuthorize("hasRole('MENTOR')")
    public PayoutDtos.BankAccountView saveBankAccount(@Valid @RequestBody PayoutDtos.BankAccountInput in) {
        return payoutService.saveBankAccount(CurrentUser.get().userId(), in);
    }

    @PostMapping("/payouts")
    @PreAuthorize("hasRole('MENTOR')")
    @ResponseStatus(HttpStatus.CREATED)
    public PayoutDtos.PayoutView requestPayout() {
        return payoutService.request(CurrentUser.get());
    }

    /** Biên lai (PRD-PAY-6) — người trả, mentor của giao dịch, admin. */
    @GetMapping("/transactions/{id}/receipt")
    public PayoutDtos.Receipt receipt(@PathVariable UUID id) {
        return receiptService.receipt(CurrentUser.get(), id);
    }

    /** CSV thu nhập theo tháng (yyyy-MM, giờ Việt Nam). */
    @GetMapping(value = "/earnings/export", produces = "text/csv")
    @PreAuthorize("hasRole('MENTOR')")
    public ResponseEntity<byte[]> exportEarnings(@RequestParam String month) {
        java.time.YearMonth ym;
        try {
            ym = java.time.YearMonth.parse(month);
        } catch (java.time.format.DateTimeParseException e) {
            throw com.mmp.payment.exception.ApiException.badRequest("INVALID_MONTH", "month có dạng yyyy-MM");
        }
        byte[] body = receiptService.earningsCsv(CurrentUser.get().userId(), ym).getBytes(java.nio.charset.StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .contentType(new org.springframework.http.MediaType("text", "csv", java.nio.charset.StandardCharsets.UTF_8))
                .header(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"earnings-" + ym + ".csv\"")
                .body(body);
    }

    @GetMapping("/admin/payouts")
    @PreAuthorize("hasRole('ADMIN')")
    public List<PayoutDtos.PayoutView> adminPayouts(@RequestParam(required = false) String status) {
        return payoutService.adminList(status);
    }

    @PostMapping("/admin/payouts/{id}/paid")
    @PreAuthorize("hasRole('ADMIN')")
    public PayoutDtos.PayoutView markPaid(@PathVariable UUID id, @Valid @RequestBody PayoutDtos.MarkPaidInput in) {
        return payoutService.markPaid(CurrentUser.get(), id, in);
    }

    @PostMapping("/admin/payouts/{id}/reject")
    @PreAuthorize("hasRole('ADMIN')")
    public PayoutDtos.PayoutView rejectPayout(@PathVariable UUID id, @Valid @RequestBody PayoutDtos.RejectInput in) {
        return payoutService.reject(CurrentUser.get(), id, in);
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

    @GetMapping("/admin/mentor-referrals")
    @PreAuthorize("hasRole('ADMIN')")
    public List<MentorReferralView> adminMentorReferrals(@RequestParam(required = false) String status) {
        return mentorReferrals.adminList(status);
    }

    @PostMapping("/admin/mentor-referrals/{id}/decide")
    @PreAuthorize("hasRole('ADMIN')")
    public MentorReferralView decideReferral(@PathVariable UUID id, @Valid @RequestBody ReferralDecision body) {
        return mentorReferrals.decide(CurrentUser.get().userId(), id, "APPROVE".equals(body.decision()), body.reason());
    }

    @GetMapping("/admin/referrals")
    @PreAuthorize("hasRole('ADMIN')")
    public List<ReferralResponse> allReferrals() {
        return referralService.all();
    }
}
