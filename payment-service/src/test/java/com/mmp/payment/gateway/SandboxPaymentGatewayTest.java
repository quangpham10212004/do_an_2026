package com.mmp.payment.gateway;

import com.mmp.payment.gateway.PaymentGateway.CardDetails;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class SandboxPaymentGatewayTest {

    private final SandboxPaymentGateway gateway = new SandboxPaymentGateway();
    private final String validExpiry = YearMonth.now().plusYears(2).format(DateTimeFormatter.ofPattern("MM/yy"));

    private PaymentGateway.ChargeResult charge(String card, String expiry, String cvv) {
        return gateway.charge(UUID.randomUUID(), new BigDecimal("200000"), "VND", new CardDetails(card, "TEST", expiry, cvv));
    }

    @Test
    void successCard() {
        var r = charge("4242 4242 4242 4242", validExpiry, "123");
        assertThat(r.success()).isTrue();
        assertThat(r.providerReference()).startsWith("sbx_ch_");
    }

    @Test
    void declinedAndInsufficientFundsCards() {
        assertThat(charge("4000000000000002", validExpiry, "123").failureReason()).isEqualTo("CARD_DECLINED");
        assertThat(charge("4000000000009995", validExpiry, "123").failureReason()).isEqualTo("INSUFFICIENT_FUNDS");
    }

    @Test
    void validatesCardData() {
        assertThat(charge("4242424242424241", validExpiry, "123").failureReason()).isEqualTo("INVALID_CARD_NUMBER");
        assertThat(charge("4242424242424242", "01/20", "123").failureReason()).isEqualTo("CARD_EXPIRED");
        assertThat(charge("4242424242424242", validExpiry, "12").failureReason()).isEqualTo("INVALID_CVV");
    }

    @Test
    void luhn() {
        assertThat(SandboxPaymentGateway.luhnValid("79927398713")).isTrue();
        assertThat(SandboxPaymentGateway.luhnValid("79927398710")).isFalse();
    }
}
