package com.mmp.payment.controller;

import com.mmp.payment.dto.PaymentDtos.*;
import com.mmp.payment.service.EarningService;
import com.mmp.payment.service.PaymentService;
import com.mmp.payment.service.ReferralService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/internal")
public class InternalPaymentController {

    private final PaymentService paymentService;
    private final ReferralService referralService;
    private final EarningService earningService;

    public InternalPaymentController(PaymentService paymentService, ReferralService referralService, EarningService earningService) {
        this.paymentService = paymentService;
        this.referralService = referralService;
        this.earningService = earningService;
    }

    /**
     * US-25 — mentoring-service báo trạng thái cuối của phiên (COMPLETED / NO_SHOW_MENTEE / CANCELLED khi mentee huỷ muộn,
     * hoặc sau khi giải quyết tranh chấp với releaseNow=true). payment-service giữ đồng hồ 48 giờ. Idempotent (ghi đè lịch).
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

    /** US-01 — mentoring-service cộng điểm xin lỗi khi mentor huỷ phiên. Gửi lại cùng nội dung → trả bản ghi cũ. */
    @PostMapping("/rewards")
    public RewardResponse grantReward(@Valid @RequestBody GrantRewardRequest req) {
        return referralService.grantSessionReward(req.userId(), req.points(), req.reason(), req.sessionId());
    }
}
