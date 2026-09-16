package com.mmp.payment.gateway;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.UUID;

/**
 * Cổng thanh toán giả lập (sandbox) — mô phỏng hành vi của gateway thật với bộ
 * thẻ test cố định (tương tự Stripe test cards):
 * <ul>
 *   <li>4242 4242 4242 4242 — thanh toán thành công</li>
 *   <li>4000 0000 0000 0002 — thẻ bị từ chối (CARD_DECLINED)</li>
 *   <li>4000 0000 0000 9995 — không đủ số dư (INSUFFICIENT_FUNDS)</li>
 * </ul>
 * Mọi thẻ khác hợp lệ theo thuật toán Luhn và còn hạn đều thành công.
 */
@Component
public class SandboxPaymentGateway implements PaymentGateway {

    private static final DateTimeFormatter EXPIRY = DateTimeFormatter.ofPattern("MM/yy");

    @Override
    public String providerName() {
        return "SANDBOX";
    }

    @Override
    public ChargeResult charge(UUID transactionId, BigDecimal amount, String currency, CardDetails card) {
        String number = card == null || card.cardNumber() == null ? "" : card.cardNumber().replaceAll("\\s|-", "");
        if (!number.matches("\\d{13,19}") || !luhnValid(number)) {
            return new ChargeResult(false, null, "INVALID_CARD_NUMBER");
        }
        if (card.cvv() == null || !card.cvv().matches("\\d{3,4}")) {
            return new ChargeResult(false, null, "INVALID_CVV");
        }
        if (isExpired(card.expiry())) {
            return new ChargeResult(false, null, "CARD_EXPIRED");
        }
        if (number.endsWith("0002")) {
            return new ChargeResult(false, null, "CARD_DECLINED");
        }
        if (number.endsWith("9995")) {
            return new ChargeResult(false, null, "INSUFFICIENT_FUNDS");
        }
        return new ChargeResult(true, "sbx_ch_" + transactionId.toString().replace("-", "").substring(0, 20), null);
    }

    @Override
    public ChargeResult refund(String providerReference, BigDecimal amount) {
        return new ChargeResult(true, providerReference == null ? null : providerReference.replace("sbx_ch_", "sbx_re_"), null);
    }

    static boolean luhnValid(String number) {
        int sum = 0;
        boolean alternate = false;
        for (int i = number.length() - 1; i >= 0; i--) {
            int n = number.charAt(i) - '0';
            if (alternate) {
                n *= 2;
                if (n > 9) n -= 9;
            }
            sum += n;
            alternate = !alternate;
        }
        return sum % 10 == 0;
    }

    static boolean isExpired(String expiry) {
        if (expiry == null) return true;
        try {
            return YearMonth.parse(expiry.trim(), EXPIRY).isBefore(YearMonth.now());
        } catch (DateTimeParseException e) {
            return true;
        }
    }
}
