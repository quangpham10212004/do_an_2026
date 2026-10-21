package com.mmp.payment.controller;

import com.mmp.payment.dto.PaymentDtos.*;
import com.mmp.payment.service.EarningService;
import com.mmp.payment.service.PaymentService;
import com.mmp.payment.service.ReferralService;
import com.mmp.payment.service.WalletService;
import com.mmp.payment.service.WalletService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/internal")
public class InternalPaymentController {

    private final PaymentService paymentService;
    private final ReferralService referralService;
    private final EarningService earningService;
    private final WalletService walletService;
    private final com.mmp.payment.service.MentorReferralService mentorReferrals;

    public InternalPaymentController(PaymentService paymentService, ReferralService referralService, EarningService earningService,
                                     WalletService walletService, com.mmp.payment.service.MentorReferralService mentorReferrals) {
        this.walletService = walletService;
        this.mentorReferrals = mentorReferrals;
        this.paymentService = paymentService;
        this.referralService = referralService;
        this.earningService = earningService;
    }

    /**
     * US-25 — mentoring-service báo trạng thái cuối của phiên (COMPLETED / NO_SHOW_MENTEE / CANCELLED khi mentee huỷ muộn,
     * hoặc sau khi giải quyết tranh chấp với releaseNow=true). payment-service giữ đồng hồ 72 giờ (bản chốt v2.0). Idempotent (ghi đè lịch).
     */
    @PostMapping("/payments/sessions/{sessionId}/final-state")
    public FinalStateResponse finalState(@PathVariable UUID sessionId, @Valid @RequestBody FinalStateRequest req) {
        return earningService.finalState(sessionId, req);
    }

    /** Gọi bởi auth-service khi người dùng đăng ký kèm mã giới thiệu. */
    @PostMapping("/referrals")
    @ResponseStatus(HttpStatus.CREATED)
    public ReferralResponse registerReferral(@Valid @RequestBody RegisterReferralRequest req) {
        return referralService.registerReferee(req.code(), req.refereeId());
    }

    /** Gọi bởi mentoring-service khi phiên đã thanh toán bị huỷ / mentor vắng mặt (US-13: amount hoặc percent). */
    @PostMapping("/payments/refund")
    public TransactionResponse refund(@Valid @RequestBody RefundRequest req) {
        return paymentService.refund(req.sessionId(), req.reason(), req.percent(), req.amount(), req.actorId());
    }

    /** US-12 — phiên tranh chấp: tạm giữ giao dịch (SUCCESS → ON_HOLD). Idempotent. */
    @PostMapping("/payments/hold")
    public TransactionResponse hold(@Valid @RequestBody HoldRequest req) {
        return paymentService.hold(req.sessionId(), req.reason());
    }

    /** US-12 — giải phóng giao dịch tạm giữ (ON_HOLD → SUCCESS). Idempotent. */
    @PostMapping("/payments/release")
    public TransactionResponse release(@Valid @RequestBody HoldRequest req) {
        return paymentService.release(req.sessionId());
    }

    /**
     * Bản chốt v2.0 §5 — mentoring-service nhờ tạm giữ học phí của phiên từ ví mentee ngay sau khi đặt lịch. Giá lấy từ
     * mentoring-service; 402 INSUFFICIENT_FUNDS khi ví thiếu tiền (phiên giữ PENDING để mentee nạp thêm).
     */
    @PostMapping("/wallet/pay")
    public TransactionResponse walletPay(@Valid @RequestBody WalletPayInternalRequest req) {
        return walletService.pay(new com.mmp.payment.security.AuthUser(req.userId(), null, "MENTEE", true), req.sessionId(), null);
    }

    /** Bản chốt v2.0 §11 — mentoring kiểm tra mã giới thiệu trước khi tạo buổi: 400 (mã lỗi cụ thể) nếu không dùng được. */
    @PostMapping("/referrals/validate")
    public Map<String, Object> validateReferral(@Valid @RequestBody ReferralApplyRequest req) {
        mentorReferrals.validate(req.code(), req.refereeId(), req.mentorId());
        return Map.of("valid", true);
    }

    /** Bản chốt v2.0 §11 — mentoring ghi nhận mã được dùng ở buổi thường đầu tiên (sessionId bắt buộc). */
    @PostMapping("/referrals/apply")
    @ResponseStatus(HttpStatus.CREATED)
    public MentorReferralView applyReferral(@Valid @RequestBody ReferralApplyRequest req) {
        if (req.sessionId() == null) throw com.mmp.payment.exception.ApiException.badRequest("SESSION_REQUIRED", "Thiếu sessionId");
        return mentorReferrals.apply(req.code(), req.refereeId(), req.mentorId(), req.sessionId());
    }

    /** Bản chốt v2.0 §2.1 — admin khoá / mở khoá tài khoản: đóng băng / mở ví. Idempotent. */
    @PostMapping("/wallet/freeze")
    public Map<String, Object> freeze(@Valid @RequestBody FreezeRequest req) {
        walletService.setFrozen(req.userId(), req.frozen());
        return Map.of("userId", req.userId(), "frozen", req.frozen());
    }

    /** US-01 — mentoring-service cộng điểm xin lỗi khi mentor huỷ phiên. Gửi lại cùng nội dung → trả bản ghi cũ. */
    @PostMapping("/rewards")
    public RewardResponse grantReward(@Valid @RequestBody GrantRewardRequest req) {
        return referralService.grantSessionReward(req.userId(), req.points(), req.reason(), req.sessionId());
    }
}
