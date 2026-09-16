package com.mmp.payment.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Đối soát: gửi lại xác nhận phiên cho các giao dịch thành công chưa đồng bộ được. */
@Component
public class PaymentReconciliationJob {

    private final PaymentService paymentService;

    public PaymentReconciliationJob(PaymentService paymentService) {
        this.paymentService = paymentService;
    }

    @Scheduled(fixedDelay = 60_000, initialDelay = 30_000)
    public void reconcile() {
        paymentService.unsyncedSuccessTransactions().forEach(t -> paymentService.syncSession(t.getId()));
    }
}
