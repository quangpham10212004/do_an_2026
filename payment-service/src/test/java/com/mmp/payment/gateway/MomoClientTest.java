package com.mmp.payment.gateway;

import com.mmp.payment.gateway.RedirectGateway.QueryOutcome;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** US-56 — chữ ký MoMo (HMAC-SHA256), xác thực IPN / return, ánh xạ mã kết quả. */
class MomoClientTest {

    /** Khoá test dùng chung, công khai trong repo mẫu github.com/momo-wallet/payment. */
    private final MomoClient client = new MomoClient("MOMO", "F8BBA842ECF85", "K951B6PE1waDMi640xX08PD3vg6EkVlz",
            "https://test-payment.momo.vn", "payWithMethod", "", "http://localhost:3000/", Duration.ofMinutes(100));

    private static final String ORDER = "MH123e4567e89b12d3a456426614174000";

    @Test
    void configuredAndOrderIdFormat() {
        assertThat(client.configured()).isTrue();
        assertThat(new MomoClient("", "", "", "u", "payWithMethod", "", "f", Duration.ofMinutes(100)).configured()).isFalse();
        assertThat(client.txnRef(UUID.fromString("123e4567-e89b-12d3-a456-426614174000"))).isEqualTo(ORDER);
        assertThat(MomoClient.amount(new BigDecimal("300000.00"))).isEqualTo(300000L);
    }

    @Test
    void createSignatureMatchesReferenceImplementation() {
        // Giá trị tham chiếu tính bằng Python theo đúng chuỗi ký của API create (đã chạy thật với test-payment.momo.vn)
        Map<String, Object> f = new HashMap<>();
        f.put("accessKey", "F8BBA842ECF85");
        f.put("amount", 300000L);
        f.put("extraData", "");
        f.put("ipnUrl", "http://localhost:3000/api/payment/momo/ipn");
        f.put("orderId", ORDER);
        f.put("orderInfo", "Thanh toan phien mentoring");
        f.put("partnerCode", "MOMO");
        f.put("redirectUrl", "http://localhost:3000/payment/return/momo");
        f.put("requestId", ORDER);
        f.put("requestType", "payWithMethod");
        assertThat(client.sign(f)).isEqualTo("fbd7dc4c5f8d61603b08bd0cfbf9ef57218058264e98b0292752404a436b27ce");
    }

    private Map<String, String> callback() {
        Map<String, String> p = new HashMap<>();
        p.put("partnerCode", "MOMO");
        p.put("orderId", ORDER);
        p.put("requestId", ORDER);
        p.put("amount", "300000");
        p.put("orderInfo", "Thanh toan phien mentoring");
        p.put("orderType", "momo_wallet");
        p.put("transId", "4860449956");
        p.put("resultCode", "0");
        p.put("message", "Thành công.");
        p.put("payType", "napas");
        p.put("responseTime", "1792002061817");
        p.put("extraData", "");
        p.put("signature", "95456ef49448cfeb6e18dbaf1b286e9904ffc83a16484d1147f5c447c5fd3dd5");
        return p;
    }

    @Test
    void validCallbackIsAcceptedWithUtf8Message() {
        var cb = client.verifyCallback(callback()).orElseThrow();
        assertThat(cb.txnRef()).isEqualTo(ORDER);
        assertThat(cb.amount()).isEqualByComparingTo("300000");
        assertThat(cb.paid()).isTrue();
        assertThat(cb.providerReference()).isEqualTo("4860449956");
    }

    @Test
    void tamperedOrForeignCallbackIsRejected() {
        Map<String, String> amount = callback();
        amount.put("amount", "1000");
        assertThat(client.verifyCallback(amount)).isEmpty();
        Map<String, String> result = callback();
        result.put("resultCode", "1006");
        assertThat(client.verifyCallback(result)).isEmpty();
        Map<String, String> partner = callback();
        partner.put("partnerCode", "OTHER");
        assertThat(client.verifyCallback(partner)).isEmpty();
        Map<String, String> unsigned = callback();
        unsigned.remove("signature");
        assertThat(client.verifyCallback(unsigned)).isEmpty();
    }

    @Test
    void resultCodesMapToFinalOrPending() {
        assertThat(MomoClient.outcome(0)).isEqualTo(QueryOutcome.SUCCESS);
        for (int pending : new int[] {1000, 7000, 7002, 9000, 10, 20, 41}) {
            assertThat(MomoClient.outcome(pending)).as("code %d", pending).isEqualTo(QueryOutcome.PENDING);
        }
        for (int failed : new int[] {98, 99, 1001, 1005, 1006, 1017, 4001}) {
            assertThat(MomoClient.outcome(failed)).as("code %d", failed).isEqualTo(QueryOutcome.FAILED);
        }
        assertThat(MomoClient.failureReason("1006")).isEqualTo("PAYMENT_CANCELLED");
        assertThat(MomoClient.failureReason("1005")).isEqualTo("PAYMENT_EXPIRED");
    }
}
