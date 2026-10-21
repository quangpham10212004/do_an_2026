package com.mmp.payment.controller;

import com.mmp.payment.dto.PaymentDtos.*;
import com.mmp.payment.exception.ApiException;
import com.mmp.payment.security.CurrentUser;
import com.mmp.payment.service.RedirectPaymentService;
import com.mmp.payment.service.WalletLedger;
import com.mmp.payment.service.WalletService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Bản chốt v2.0 §8 — ví VND. Mọi endpoint của người học cần đăng nhập; nạp ví, trả học phí và hoàn tiền nạp chỉ dành cho
 * MENTEE (admin dùng các endpoint /admin). Số tiền học phí KHÔNG lấy từ client mà từ mentoring-service.
 */
@RestController
@RequestMapping("/api/payment/wallet")
public class WalletController {

    private final WalletService wallet;
    private final RedirectPaymentService redirect;

    public WalletController(WalletService wallet, RedirectPaymentService redirect) {
        this.wallet = wallet;
        this.redirect = redirect;
    }

    @GetMapping
    public WalletView view() {
        return wallet.view(CurrentUser.get());
    }

    @GetMapping("/entries")
    public PageResponse<WalletLedger.EntryView> entries(@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return wallet.entries(CurrentUser.get(), page, size);
    }

    /**
     * Nạp ví. provider trống / SANDBOX + card → kết quả ngay (TransactionResponse); MOMO / VNPAY → CheckoutResponse có link
     * chuyển hướng, ví được cộng khi cổng xác nhận (IPN / return).
     */
    @PostMapping("/topups")
    @PreAuthorize("hasRole('MENTEE')")
    public Object topup(@Valid @RequestBody TopupRequest req, HttpServletRequest http) {
        String provider = req.provider() == null ? "" : req.provider().trim().toUpperCase();
        if (provider.isEmpty() || "SANDBOX".equals(provider)) {
            if (req.card() == null) throw ApiException.badRequest("CARD_REQUIRED", "Thiếu thông tin thẻ");
            return wallet.topupWithCard(CurrentUser.get(), req.amount(), req.card());
        }
        return redirect.checkoutTopup(CurrentUser.get(), provider, req.amount(), clientIp(http));
    }

    /** Trả học phí của phiên đang chờ thanh toán từ ví (thay cho thanh toán thẻ trực tiếp từng phiên). */
    @PostMapping("/pay")
    @PreAuthorize("hasRole('MENTEE')")
    public TransactionResponse pay(@Valid @RequestBody PayFromWalletRequest req) {
        return wallet.pay(CurrentUser.get(), req.sessionId(), req.amount());
    }

    @PostMapping("/reactivate")
    @PreAuthorize("hasRole('MENTEE')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void reactivate() {
        wallet.reactivate(CurrentUser.get());
    }

    @GetMapping("/topup-refund/eligibility")
    @PreAuthorize("hasRole('MENTEE')")
    public RefundEligibility eligibility() {
        return wallet.refundEligibility(CurrentUser.get().userId(), java.time.OffsetDateTime.now());
    }

    @GetMapping("/topup-refund")
    @PreAuthorize("hasRole('MENTEE')")
    public List<TopupRefundView> myRefundRequests() {
        return wallet.mineRequests(CurrentUser.get());
    }

    @PostMapping("/topup-refund")
    @PreAuthorize("hasRole('MENTEE')")
    @ResponseStatus(HttpStatus.CREATED)
    public TopupRefundView requestRefund(@Valid @RequestBody TopupRefundBody body) {
        return wallet.requestTopupRefund(CurrentUser.get(), body.amount(), body.exceptionReason());
    }

    // ---------------------------------------------------------------- admin

    @GetMapping("/admin/topup-refunds")
    @PreAuthorize("hasRole('ADMIN')")
    public List<TopupRefundView> adminRefunds(@RequestParam(required = false) String status) {
        return wallet.adminRequests(status);
    }

    @PostMapping("/admin/topup-refunds/{id}/decide")
    @PreAuthorize("hasRole('ADMIN')")
    public TopupRefundView decide(@PathVariable UUID id, @Valid @RequestBody TopupRefundDecision body) {
        return wallet.decide(CurrentUser.get(), id, body.decision(), body.reason());
    }

    @PostMapping("/admin/{userId}/promo")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> grantPromo(@PathVariable UUID userId, @Valid @RequestBody PromoGrantRequest body) {
        return Map.of("lotId", wallet.grantPromo(CurrentUser.get(), userId, body.amount(), body.reason()));
    }

    private static String clientIp(HttpServletRequest http) {
        String forwarded = http.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) return forwarded.split(",")[0].trim();
        return http.getRemoteAddr();
    }
}
