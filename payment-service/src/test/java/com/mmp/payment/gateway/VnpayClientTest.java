package com.mmp.payment.gateway;

import com.mmp.payment.entity.Transaction;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** US-56 — URL thanh toán VNPay + kiểm chữ ký IPN/return (PRD-PAY-10, 11). */
class VnpayClientTest {

    private final VnpayClient client = new VnpayClient("TESTCODE", "SECRETSECRETSECRETSECRETSECRET12",
            "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html", "https://sandbox.vnpayment.vn/merchant_webapi/api/transaction",
            "http://localhost:3000/", Duration.ofMinutes(15));

    @Test
    void configuredOnlyWithKeys() {
        assertThat(client.configured()).isTrue();
        assertThat(new VnpayClient("", "", "u", "u", "f", Duration.ofMinutes(15)).configured()).isFalse();
    }

    @Test
    void txnRefAndAmountFollowVnpayFormats() {
        UUID id = UUID.fromString("123e4567-e89b-12d3-a456-426614174000");
        assertThat(client.txnRef(id)).isEqualTo("123e4567e89b12d3a456426614174000").matches("[0-9a-f]{32}");
        assertThat(VnpayClient.amount(new BigDecimal("200000.00"))).isEqualTo("20000000");
        assertThat(VnpayClient.amount(new BigDecimal("150000"))).isEqualTo("15000000");
    }

    @Test
    void paymentUrlIsSignedSortedAndExpiresAfter15Minutes() {
        Map<String, String> p = query(client.createPaymentUrl(tx("20261015101500"), "1.2.3.4"));
        assertThat(p).containsEntry("vnp_Amount", "20000000")
                .containsEntry("vnp_TmnCode", "TESTCODE")
                .containsEntry("vnp_CreateDate", "20261015101500")
                .containsEntry("vnp_ExpireDate", "20261015103000")
                .containsEntry("vnp_ReturnUrl", "http://localhost:3000/payment/return/vnpay")
                .containsEntry("vnp_IpAddr", "1.2.3.4")
                .containsEntry("vnp_Version", "2.1.0");
        assertThat(p.get("vnp_OrderInfo")).matches("[A-Za-z0-9 ]+"); // ASCII, không dấu, không ký tự đặc biệt
        // Chữ ký của chính URL này phải kiểm lại được (cùng thuật toán với IPN)
        assertThat(client.verify(p)).isTrue();
    }

    @Test
    void callbackMapsAmountAndResult() {
        Map<String, String> p = query(client.createPaymentUrl(tx("20261015101500"), null));
        // Tham số ký lại như IPN thành công: dùng chính URL đã ký → chưa có vnp_ResponseCode nên coi là chưa trả
        var cb = client.verifyCallback(p).orElseThrow();
        assertThat(cb.amount()).isEqualByComparingTo("200000");
        assertThat(cb.paid()).isFalse();
        assertThat(VnpayClient.failureReason("24")).isEqualTo("PAYMENT_CANCELLED");
    }

    @Test
    void verifyRejectsTamperedOrMissingSignature() {
        Map<String, String> p = query(client.createPaymentUrl(tx("20261015101500"), null));
        Map<String, String> tampered = new LinkedHashMap<>(p);
        tampered.put("vnp_Amount", "100");
        assertThat(client.verify(tampered)).isFalse();
        Map<String, String> unsigned = new LinkedHashMap<>(p);
        unsigned.remove("vnp_SecureHash");
        assertThat(client.verify(unsigned)).isFalse();
    }

    @Test
    void verifyIgnoresHashTypeAndNonVnpParamsAndAcceptsUppercaseHash() {
        Map<String, String> p = new TreeMap<>(query(client.createPaymentUrl(tx("20261015101500"), null)));
        p.put("vnp_SecureHashType", "HmacSHA512");
        p.put("utm_source", "x");
        p.put("vnp_SecureHash", p.get("vnp_SecureHash").toUpperCase());
        assertThat(client.verify(p)).isTrue();
    }

    @Test
    void encodeMatchesVnpayDemoEncoding() {
        Map<String, String> m = new TreeMap<>(Map.of("vnp_OrderInfo", "Thanh toan don", "vnp_ReturnUrl", "http://a/b?c=1"));
        assertThat(VnpayClient.encode(m)).isEqualTo("vnp_OrderInfo=Thanh+toan+don&vnp_ReturnUrl=http%3A%2F%2Fa%2Fb%3Fc%3D1");
    }

    static Transaction tx(String createdAt) {
        Transaction t = new Transaction();
        t.setAmount(new BigDecimal("200000.00"));
        t.setProviderTxnRef("123e4567e89b12d3a456426614174000");
        t.setProviderCreatedAt(createdAt);
        return t;
    }

    static Map<String, String> query(String url) {
        Map<String, String> m = new LinkedHashMap<>();
        for (String kv : URI.create(url).getRawQuery().split("&")) {
            String[] parts = kv.split("=", 2);
            m.put(URLDecoder.decode(parts[0], StandardCharsets.US_ASCII), URLDecoder.decode(parts[1], StandardCharsets.US_ASCII));
        }
        return m;
    }
}
