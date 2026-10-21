package com.mmp.payment.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;

/** Đối soát: gửi lại xác nhận phiên cho các giao dịch thành công chưa đồng bộ được. */
@Component
public class PaymentReconciliationJob {

    private final PaymentService paymentService;
    private final RedirectPaymentService redirect;
    private final Duration reconcileAfter;
    private final WalletService wallet;
    private final MentorReferralService mentorReferrals;

    public PaymentReconciliationJob(PaymentService paymentService, RedirectPaymentService redirect,
                                    @Value("${app.payment.reconcile-after:PT2M}") Duration reconcileAfter,
                                    WalletService wallet, MentorReferralService mentorReferrals) {
        this.wallet = wallet;
        this.mentorReferrals = mentorReferrals;
        this.paymentService = paymentService;
        this.redirect = redirect;
        this.reconcileAfter = reconcileAfter;
    }

    @Scheduled(fixedDelay = 60_000, initialDelay = 30_000)
    public void reconcile() {
        paymentService.unsyncedSuccessTransactions().forEach(t -> paymentService.syncSession(t.getId()));
    }

    /** US-56 (PRD-PAY-14) — giao dịch MoMo / VNPay chưa có IPN → truy vấn trạng thái ở cổng. */
    @Scheduled(fixedDelay = 60_000, initialDelay = 45_000)
    public void reconcileRedirectPayments() {
        redirect.reconcilePending(reconcileAfter);
    }

    /** Bản chốt v2.0 §8.5 — hết hạn khuyến mãi, ví "ngủ", nhắc trước 30 / 7 ngày. */
    @Scheduled(fixedDelay = 3_600_000, initialDelay = 150_000)
    public void walletMaintenance() {
        java.time.OffsetDateTime now = java.time.OffsetDateTime.now();
        wallet.runExpiry(now);
        wallet.sendReminders(now);
    }

    /** Bản chốt v2.0 §11 — thưởng giới thiệu sau 7 ngày kể từ khi buổi hoàn thành mà không bị hoàn tiền. */
    @Scheduled(fixedDelay = 3_600_000, initialDelay = 180_000)
    public void evaluateReferrals() {
        mentorReferrals.evaluateDue(java.time.OffsetDateTime.now());
    }

    /** US-13 — xoá Idempotency-Key quá 24 giờ. */
    @Scheduled(fixedDelay = 3_600_000, initialDelay = 120_000)
    public void purgeIdempotencyKeys() {
        paymentService.purgeExpiredIdempotencyKeys();
    }
}
