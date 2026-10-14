package com.mmp.payment.controller;

import com.mmp.payment.dto.PaymentDtos.CheckoutRequest;
import com.mmp.payment.dto.PaymentDtos.CheckoutResponse;
import com.mmp.payment.dto.PaymentDtos.PaymentMethods;
import com.mmp.payment.dto.PaymentDtos.TransactionResponse;
import com.mmp.payment.gateway.MomoClient;
import com.mmp.payment.gateway.RedirectGateway;
import com.mmp.payment.gateway.VnpayClient;
import com.mmp.payment.security.CurrentUser;
import com.mmp.payment.service.RedirectPaymentService;
import com.mmp.payment.service.RedirectPaymentService.IpnResult;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/**
 * US-56 — thanh toán qua cổng chuyển hướng (MoMo / VNPay). Hai endpoint IPN công khai (cổng gọi server → server, không có
 * JWT; bảo vệ bằng chữ ký), khai báo trong app.security.public-paths. Các endpoint còn lại cần đăng nhập.
 */
@RestController
@RequestMapping("/api/payment")
public class CheckoutController {

    private final RedirectPaymentService redirect;

    public CheckoutController(RedirectPaymentService redirect) {
        this.redirect = redirect;
    }

    @GetMapping("/methods")
    public PaymentMethods methods() {
        return new PaymentMethods(redirect.active().map(RedirectGateway::provider).orElse(null), true);
    }

    @PostMapping("/checkout")
    @PreAuthorize("hasAnyRole('MENTEE','ADMIN')")
    public CheckoutResponse checkout(@Valid @RequestBody CheckoutRequest req, HttpServletRequest http) {
        return redirect.checkout(CurrentUser.get(), req.sessionId(), req.amount(), clientIp(http));
    }

    /** MoMo: POST JSON, phải trả HTTP 204 trong 15 giây khi đã nhận. */
    @PostMapping("/momo/ipn")
    public ResponseEntity<Void> momoIpn(@RequestBody Map<String, Object> body) {
        Map<String, String> params = new LinkedHashMap<>();
        body.forEach((k, v) -> params.put(k, v == null ? "" : v.toString()));
        IpnResult r = redirect.ipn(MomoClient.PROVIDER, params);
        return switch (r) {
            case OK, ALREADY_CONFIRMED -> ResponseEntity.noContent().build();
            case ERROR -> ResponseEntity.internalServerError().build();
            default -> ResponseEntity.badRequest().build();
        };
    }

    /** VNPay: GET kèm tham số vnp_*; luôn HTTP 200 + {RspCode, Message} theo tài liệu VNPay. */
    @GetMapping("/vnpay/ipn")
    public Map<String, String> vnpayIpn(@RequestParam Map<String, String> params) {
        IpnResult r = redirect.ipn(VnpayClient.PROVIDER, params);
        return switch (r) {
            case OK -> Map.of("RspCode", "00", "Message", "Confirm Success");
            case ALREADY_CONFIRMED -> Map.of("RspCode", "02", "Message", "Order already confirmed");
            case NOT_FOUND -> Map.of("RspCode", "01", "Message", "Order not found");
            case BAD_AMOUNT -> Map.of("RspCode", "04", "Message", "invalid amount");
            case BAD_SIGNATURE -> Map.of("RspCode", "97", "Message", "Invalid signature");
            case ERROR -> Map.of("RspCode", "99", "Message", "Unknown error");
        };
    }

    /** PRD-PAY-12 — trang /payment/return/{momo|vnpay} gửi lại query string cổng trả về để lấy trạng thái giao dịch. */
    @GetMapping("/{provider}/return")
    public TransactionResponse confirmReturn(@PathVariable String provider, @RequestParam Map<String, String> params) {
        return redirect.confirmReturn(CurrentUser.get(), provider.toUpperCase(Locale.ROOT), params);
    }

    private static String clientIp(HttpServletRequest http) {
        String forwarded = http.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) return forwarded.split(",")[0].trim();
        return http.getRemoteAddr();
    }
}
