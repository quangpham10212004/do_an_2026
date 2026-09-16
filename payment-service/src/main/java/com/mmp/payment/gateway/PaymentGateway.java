package com.mmp.payment.gateway;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Trừu tượng hoá cổng thanh toán. Đồ án dùng SandboxPaymentGateway (không xử lý
 * tiền thật); có thể bổ sung VNPay/Stripe bằng cách thêm implementation mới.
 */
public interface PaymentGateway {

    record CardDetails(String cardNumber, String cardHolder, String expiry, String cvv) {
    }

    record ChargeResult(boolean success, String providerReference, String failureReason) {
    }

    String providerName();

    ChargeResult charge(UUID transactionId, BigDecimal amount, String currency, CardDetails card);

    ChargeResult refund(String providerReference, BigDecimal amount);
}
