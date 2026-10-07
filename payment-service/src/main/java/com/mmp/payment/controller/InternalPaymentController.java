package com.mmp.payment.controller;

import com.mmp.payment.dto.PaymentDtos.*;
import com.mmp.payment.service.PaymentService;
import com.mmp.payment.service.ReferralService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/internal")
public class InternalPaymentController {

    private final PaymentService paymentService;
    private final ReferralService referralService;

    public InternalPaymentController(PaymentService paymentService, ReferralService referralService) {
        this.paymentService = paymentService;
        this.referralService = referralService;
    }

    /** Gọi bởi auth-service khi người dùng đăng ký kèm mã giới thiệu. */
    @PostMapping("/referrals")
    @ResponseStatus(HttpStatus.CREATED)
    public ReferralResponse registerReferral(@Valid @RequestBody RegisterReferralRequest req) {
        return referralService.registerReferee(req.code(), req.refereeId());
    }

    /** Gọi bởi mentoring-service khi phiên đã thanh toán bị huỷ. */
    @PostMapping("/payments/refund")
    public TransactionResponse refund(@Valid @RequestBody RefundRequest req) {
        if (req.percent() != null && req.percent() != 100) {
            throw com.mmp.payment.exception.ApiException.badRequest("PARTIAL_REFUND_NOT_SUPPORTED",
                    "Chưa hỗ trợ hoàn tiền một phần");
        }
        return paymentService.refund(req.sessionId(), req.reason());
    }

    /** US-01 — mentoring-service cộng điểm xin lỗi khi mentor huỷ phiên. Gửi lại cùng nội dung → trả bản ghi cũ. */
    @PostMapping("/rewards")
    public RewardResponse grantReward(@Valid @RequestBody GrantRewardRequest req) {
        return referralService.grantSessionReward(req.userId(), req.points(), req.reason(), req.sessionId());
    }
}
