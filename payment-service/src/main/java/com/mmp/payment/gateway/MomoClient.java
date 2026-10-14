package com.mmp.payment.gateway;

import com.mmp.payment.entity.Transaction;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * US-56 — cổng MoMo (môi trường test https://test-payment.momo.vn), API v2 one-time payment. Tài liệu (đối chiếu 15/10/2026):
 * https://developers.momo.vn/v3/docs/payment/api/wallet/onetime/ ,
 * .../result-handling/notification/ , .../payment-api/query/ , .../payment-api/refund/ ,
 * .../result-handling/resultcode/ .
 * <ul>
 *   <li>Mọi chữ ký: HMAC-SHA256 bằng secretKey trên chuỗi "key=value" nối "&" theo thứ tự a→z cố định của từng API
 *   (có accessKey, không có signature).</li>
 *   <li>ipnUrl gửi kèm từng giao dịch (không cần đăng ký trước); IPN là POST JSON, phải trả HTTP 204 trong 15 giây.</li>
 *   <li>Link thanh toán của MoMo hết hạn sau 100 phút (MoMo bỏ qua orderExpireTime) — dài hơn thời gian giữ chỗ 30 phút
 *   của phiên; tiền về sau khi phiên EXPIRED được mentoring-service hoàn tự động.</li>
 * </ul>
 * Khoá test dùng chung (partnerCode MOMO) lấy từ repo mẫu chính thức github.com/momo-wallet/payment.
 */
@Component
public class MomoClient implements RedirectGateway {

    private static final Logger log = LoggerFactory.getLogger(MomoClient.class);

    public static final String PROVIDER = "MOMO";
    /** Thứ tự trường ký của IPN và tham số trang return. */
    static final List<String> CALLBACK_FIELDS = List.of("accessKey", "amount", "extraData", "message", "orderId", "orderInfo",
            "orderType", "partnerCode", "payType", "requestId", "responseTime", "resultCode", "transId");

    private final String partnerCode;
    private final String accessKey;
    private final String secretKey;
    private final String requestType;
    private final String redirectUrl;
    private final String ipnUrl;
    private final Duration linkTtl;
    private final RestClient api;

    public MomoClient(@Value("${app.momo.partner-code:}") String partnerCode,
                      @Value("${app.momo.access-key:}") String accessKey,
                      @Value("${app.momo.secret-key:}") String secretKey,
                      @Value("${app.momo.api-url}") String apiUrl,
                      @Value("${app.momo.request-type:payWithMethod}") String requestType,
                      @Value("${app.momo.ipn-url:}") String ipnUrl,
                      @Value("${app.frontend-url}") String frontendUrl,
                      @Value("${app.momo.link-ttl:PT100M}") Duration linkTtl) {
        this.partnerCode = partnerCode.trim();
        this.accessKey = accessKey.trim();
        this.secretKey = secretKey.trim();
        this.requestType = requestType.trim();
        String base = frontendUrl.replaceAll("/+$", "");
        this.redirectUrl = base + "/payment/return/momo";
        // Chạy local MoMo không gọi được localhost: IPN rơi vào khoảng không, trang return + truy vấn vẫn xác nhận được
        this.ipnUrl = ipnUrl.isBlank() ? base + "/api/payment/momo/ipn" : ipnUrl.trim();
        this.linkTtl = linkTtl;
        this.api = RestClient.builder().baseUrl(apiUrl).build();
    }

    @Override
    public String provider() {
        return PROVIDER;
    }

    @Override
    public boolean configured() {
        return !partnerCode.isEmpty() && !accessKey.isEmpty() && !secretKey.isEmpty();
    }

    @Override
    public Duration linkTtl() {
        return linkTtl;
    }

    /** orderId: tiền tố MH để không trùng đơn của người khác dùng chung khoá test. */
    @Override
    public String txnRef(UUID transactionId) {
        return "MH" + transactionId.toString().replace("-", "");
    }

    static long amount(BigDecimal vnd) {
        return vnd.setScale(0, RoundingMode.UNNECESSARY).longValueExact();
    }

    @Override
    public String createPaymentUrl(Transaction t, String clientIp) {
        String requestId = t.getProviderTxnRef();
        String orderInfo = "Thanh toan phien mentoring";
        long amount = amount(t.getAmount());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("partnerCode", partnerCode);
        body.put("requestId", requestId);
        body.put("amount", amount);
        body.put("orderId", t.getProviderTxnRef());
        body.put("orderInfo", orderInfo);
        body.put("redirectUrl", redirectUrl);
        body.put("ipnUrl", ipnUrl);
        body.put("requestType", requestType);
        body.put("extraData", "");
        body.put("lang", "vi");
        body.put("signature", sign(Map.of("accessKey", accessKey, "amount", amount, "extraData", "", "ipnUrl", ipnUrl,
                "orderId", t.getProviderTxnRef(), "orderInfo", orderInfo, "partnerCode", partnerCode,
                "redirectUrl", redirectUrl, "requestId", requestId, "requestType", requestType)));
        Map<String, Object> res = post("/v2/gateway/api/create", body);
        String payUrl = str(res.get("payUrl"));
        if (!"0".equals(str(res.get("resultCode"))) || payUrl.isEmpty()) {
            log.warn("MoMo create {} failed: {} {}", t.getProviderTxnRef(), res.get("resultCode"), res.get("message"));
            throw new IllegalStateException("MoMo create failed: " + res.get("resultCode") + " " + res.get("message"));
        }
        return payUrl;
    }

    /** IPN và tham số trang return dùng chung định dạng chữ ký (CALLBACK_FIELDS). */
    @Override
    public Optional<Callback> verifyCallback(Map<String, String> params) {
        String given = params.get("signature");
        if (!configured() || given == null || given.isBlank() || !partnerCode.equals(params.get("partnerCode"))) {
            return Optional.empty();
        }
        Map<String, Object> signed = new LinkedHashMap<>();
        for (String f : CALLBACK_FIELDS) {
            signed.put(f, "accessKey".equals(f) ? accessKey : params.getOrDefault(f, ""));
        }
        if (!MessageDigest.isEqual(sign(signed).getBytes(StandardCharsets.US_ASCII),
                given.toLowerCase().getBytes(StandardCharsets.US_ASCII))) {
            return Optional.empty();
        }
        BigDecimal amount;
        try {
            amount = new BigDecimal(params.getOrDefault("amount", ""));
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
        String code = params.getOrDefault("resultCode", "");
        boolean paid = "0".equals(code);
        return Optional.of(new Callback(params.getOrDefault("orderId", ""), amount, paid, params.get("transId"),
                paid ? null : failureReason(code)));
    }

    static String failureReason(String code) {
        return switch (code) {
            case "1006" -> "PAYMENT_CANCELLED";
            case "1005" -> "PAYMENT_EXPIRED";
            case "1001" -> "INSUFFICIENT_FUNDS";
            default -> "MOMO_" + code;
        };
    }

    /**
     * Mã kết quả (resultcode): 0 thành công; 1000 / 7000 / 7002 / 9000 đang xử lý; lỗi hệ thống / định dạng (&lt; 98) hỏi
     * lại sau; còn lại (98, 99, 1001…, 4xxx) là thất bại cuối.
     */
    static QueryOutcome outcome(int code) {
        if (code == 0) return QueryOutcome.SUCCESS;
        if (code == 1000 || code == 7000 || code == 7002 || code == 9000 || code < 98) return QueryOutcome.PENDING;
        return QueryOutcome.FAILED;
    }

    @Override
    public QueryResult query(Transaction t) {
        String requestId = UUID.randomUUID().toString().replace("-", "");
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("partnerCode", partnerCode);
        body.put("requestId", requestId);
        body.put("orderId", t.getProviderTxnRef());
        body.put("lang", "vi");
        body.put("signature", sign(Map.of("accessKey", accessKey, "orderId", t.getProviderTxnRef(),
                "partnerCode", partnerCode, "requestId", requestId)));
        Map<String, Object> res = post("/v2/gateway/api/query", body);
        String code = str(res.get("resultCode"));
        QueryOutcome outcome;
        try {
            outcome = outcome(Integer.parseInt(code));
        } catch (NumberFormatException e) {
            outcome = QueryOutcome.PENDING;
        }
        log.info("MoMo query {} → {} {} → {}", t.getProviderTxnRef(), code, res.get("message"), outcome);
        return new QueryResult(outcome, str(res.get("transId")), failureReason(code));
    }

    /** Hoàn tiền: orderId là mã đơn hoàn mới, transId là mã giao dịch MoMo của lần thanh toán. Hỗ trợ hoàn một phần. */
    @Override
    public PaymentGateway.ChargeResult refund(Transaction t, BigDecimal refundAmount, boolean full, String createdBy) {
        String requestId = UUID.randomUUID().toString().replace("-", "");
        String refundOrderId = "MHR" + requestId;
        String description = full ? "Hoan tien toan bo" : "Hoan tien mot phan";
        long amount = amount(refundAmount);
        long transId;
        try {
            transId = Long.parseLong(t.getProviderReference());
        } catch (NumberFormatException | NullPointerException e) {
            return new PaymentGateway.ChargeResult(false, null, "MOMO_NO_TRANS_ID");
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("partnerCode", partnerCode);
        body.put("orderId", refundOrderId);
        body.put("requestId", requestId);
        body.put("amount", amount);
        body.put("transId", transId);
        body.put("lang", "vi");
        body.put("description", description);
        body.put("signature", sign(Map.of("accessKey", accessKey, "amount", amount, "description", description,
                "orderId", refundOrderId, "partnerCode", partnerCode, "requestId", requestId, "transId", transId)));
        Map<String, Object> res = post("/v2/gateway/api/refund", body);
        String code = str(res.get("resultCode"));
        log.info("MoMo refund {} {} → {} {}", t.getProviderTxnRef(), amount, code, res.get("message"));
        if ("0".equals(code)) {
            return new PaymentGateway.ChargeResult(true, "momo_re_" + str(res.get("transId")), null);
        }
        return new PaymentGateway.ChargeResult(false, null, "MOMO_REFUND_" + code);
    }

    /** "k1=v1&k2=v2…" theo thứ tự a→z của tên trường, rồi HMAC-SHA256 (hex thường). */
    String sign(Map<String, ?> fields) {
        String raw = new java.util.TreeMap<>(fields).entrySet().stream()
                .map(e -> e.getKey() + "=" + (e.getValue() == null ? "" : e.getValue()))
                .collect(Collectors.joining("&"));
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secretKey.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(raw.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("HMAC-SHA256 unavailable", e);
        }
    }

    private Map<String, Object> post(String path, Map<String, Object> body) {
        try {
            Map<String, Object> res = api.post()
                    .uri(path)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(new ParameterizedTypeReference<Map<String, Object>>() { });
            return res == null ? Map.of() : res;
        } catch (org.springframework.web.client.RestClientResponseException e) {
            // MoMo trả lỗi nghiệp vụ (resultCode, message) kèm HTTP 4xx
            @SuppressWarnings("unchecked")
            Map<String, Object> res = e.getResponseBodyAs(Map.class);
            return res == null ? Map.of("resultCode", "HTTP_" + e.getStatusCode().value()) : res;
        }
    }

    private static String str(Object o) {
        return o == null ? "" : o.toString();
    }
}
