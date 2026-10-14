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
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * US-56 (PRD-PAY-9..15) — cổng VNPay sandbox, phiên bản API 2.1.0. Tài liệu (đã đối chiếu 15/10/2026):
 * https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html và
 * https://sandbox.vnpayment.vn/apis/docs/truy-van-hoan-tien/querydr&refund.html
 * <ul>
 *   <li>URL thanh toán / IPN / return: tham số vnp_* sắp xếp tăng dần theo tên, key=URLEncode(value) nối bằng "&",
 *   ký HMAC-SHA512 bằng vnp_HashSecret (giống code demo Java của VNPay: URLEncoder US-ASCII, khoảng trắng → "+").</li>
 *   <li>querydr / refund: POST JSON, chữ ký = HMAC-SHA512 của các trường theo thứ tự cố định nối bằng "|".</li>
 * </ul>
 * IPN URL đăng ký một lần với VNPay theo terminal (không gửi kèm từng giao dịch).
 */
@Component
public class VnpayClient implements RedirectGateway {

    private static final Logger log = LoggerFactory.getLogger(VnpayClient.class);

    public static final String PROVIDER = "VNPAY";
    public static final String VERSION = "2.1.0";
    public static final ZoneId ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    public static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    /** IP máy chủ gửi kèm querydr / refund (VNPay chỉ ghi nhận). */
    private static final String SERVER_IP = "127.0.0.1";

    private final String tmnCode;
    private final String hashSecret;
    private final String payUrl;
    private final String returnUrl;
    private final Duration linkTtl;
    private final RestClient api;

    public VnpayClient(@Value("${app.vnpay.tmn-code:}") String tmnCode,
                       @Value("${app.vnpay.hash-secret:}") String hashSecret,
                       @Value("${app.vnpay.pay-url}") String payUrl,
                       @Value("${app.vnpay.api-url}") String apiUrl,
                       @Value("${app.frontend-url}") String frontendUrl,
                       @Value("${app.vnpay.link-ttl:PT15M}") Duration linkTtl) {
        this.tmnCode = tmnCode.trim();
        this.hashSecret = hashSecret.trim();
        this.payUrl = payUrl;
        this.returnUrl = frontendUrl.replaceAll("/+$", "") + "/payment/return/vnpay";
        this.linkTtl = linkTtl;
        this.api = RestClient.builder().baseUrl(apiUrl).build();
    }

    @Override
    public String provider() {
        return PROVIDER;
    }

    @Override
    public boolean configured() {
        return !tmnCode.isEmpty() && !hashSecret.isEmpty();
    }

    @Override
    public Duration linkTtl() {
        return linkTtl;
    }

    /** vnp_TxnRef: chỉ chữ + số (VNPay từ chối "-"). */
    @Override
    public String txnRef(UUID transactionId) {
        return transactionId.toString().replace("-", "");
    }

    public static String now() {
        return ZonedDateTime.now(ZONE).format(TIME);
    }

    /** vnp_Amount = số tiền VND × 100, không phần thập phân. */
    public static String amount(BigDecimal vnd) {
        return vnd.movePointRight(2).setScale(0, RoundingMode.UNNECESSARY).toPlainString();
    }

    /** PRD-PAY-10 — URL chuyển hướng người dùng sang trang thanh toán VNPay (link hết hạn sau linkTtl). */
    @Override
    public String createPaymentUrl(Transaction t, String clientIp) {
        ZonedDateTime created = ZonedDateTime.parse(t.getProviderCreatedAt(), TIME.withZone(ZONE));
        Map<String, String> p = new TreeMap<>();
        p.put("vnp_Version", VERSION);
        p.put("vnp_Command", "pay");
        p.put("vnp_TmnCode", tmnCode);
        p.put("vnp_Amount", amount(t.getAmount()));
        p.put("vnp_CurrCode", "VND");
        p.put("vnp_TxnRef", t.getProviderTxnRef());
        // ASCII không dấu, không ký tự đặc biệt
        p.put("vnp_OrderInfo", "Thanh toan phien mentoring " + t.getProviderTxnRef());
        p.put("vnp_OrderType", "other");
        p.put("vnp_Locale", "vn");
        p.put("vnp_ReturnUrl", returnUrl);
        p.put("vnp_IpAddr", clientIp == null || clientIp.isBlank() ? SERVER_IP : clientIp.trim());
        p.put("vnp_CreateDate", t.getProviderCreatedAt());
        p.put("vnp_ExpireDate", created.plus(linkTtl).format(TIME));
        String query = encode(p);
        return payUrl + "?" + query + "&vnp_SecureHash=" + hmac(query);
    }

    /** PRD-PAY-11 — chữ ký của tham số IPN / return (bỏ vnp_SecureHash, vnp_SecureHashType; chỉ lấy vnp_*). */
    public boolean verify(Map<String, String> params) {
        String given = params.get("vnp_SecureHash");
        if (given == null || given.isBlank()) return false;
        Map<String, String> signed = new TreeMap<>();
        params.forEach((k, v) -> {
            if (k.startsWith("vnp_") && !k.equals("vnp_SecureHash") && !k.equals("vnp_SecureHashType") && v != null && !v.isEmpty()) {
                signed.put(k, v);
            }
        });
        return MessageDigest.isEqual(hmac(encode(signed)).getBytes(StandardCharsets.US_ASCII),
                given.toLowerCase().getBytes(StandardCharsets.US_ASCII));
    }

    @Override
    public Optional<Callback> verifyCallback(Map<String, String> params) {
        if (!configured() || !verify(params)) return Optional.empty();
        BigDecimal amount;
        try {
            amount = new BigDecimal(params.getOrDefault("vnp_Amount", "")).movePointLeft(2);
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
        String code = params.get("vnp_ResponseCode");
        boolean paid = "00".equals(code) && "00".equals(params.get("vnp_TransactionStatus"));
        return Optional.of(new Callback(params.getOrDefault("vnp_TxnRef", ""), amount, paid,
                params.get("vnp_TransactionNo"), paid ? null : failureReason(code)));
    }

    /** vnp_ResponseCode → failure_reason (nhãn hiển thị ở frontend). */
    static String failureReason(String code) {
        if (code == null) return "VNPAY_FAILED";
        return switch (code) {
            case "24" -> "PAYMENT_CANCELLED";
            case "11" -> "PAYMENT_EXPIRED";
            case "51" -> "INSUFFICIENT_FUNDS";
            default -> "VNPAY_" + code;
        };
    }

    /** PRD-PAY-14 — querydr: hỏi VNPay trạng thái thật của giao dịch (dùng khi chưa nhận IPN, vd. chạy local). */
    @Override
    public QueryResult query(Transaction t) {
        String requestId = UUID.randomUUID().toString().replace("-", "");
        String createDate = now();
        String orderInfo = "Truy van " + t.getProviderTxnRef();
        Map<String, String> body = new LinkedHashMap<>();
        body.put("vnp_RequestId", requestId);
        body.put("vnp_Version", VERSION);
        body.put("vnp_Command", "querydr");
        body.put("vnp_TmnCode", tmnCode);
        body.put("vnp_TxnRef", t.getProviderTxnRef());
        body.put("vnp_OrderInfo", orderInfo);
        body.put("vnp_TransactionDate", t.getProviderCreatedAt());
        body.put("vnp_CreateDate", createDate);
        body.put("vnp_IpAddr", SERVER_IP);
        body.put("vnp_SecureHash", hmac(String.join("|", requestId, VERSION, "querydr", tmnCode, t.getProviderTxnRef(),
                t.getProviderCreatedAt(), createDate, SERVER_IP, orderInfo)));
        Map<String, Object> res = post(body);
        String code = str(res.get("vnp_ResponseCode"));
        String status = str(res.get("vnp_TransactionStatus"));
        QueryOutcome outcome;
        if (!"00".equals(code)) {
            outcome = QueryOutcome.PENDING; // 91 = VNPay chưa có giao dịch (người dùng chưa trả), lỗi khác → hỏi lại sau
        } else if ("00".equals(status)) {
            outcome = QueryOutcome.SUCCESS;
        } else if ("01".equals(status)) {
            outcome = QueryOutcome.PENDING;
        } else {
            outcome = QueryOutcome.FAILED;
        }
        log.info("VNPay querydr {} → code {} status {} → {}", t.getProviderTxnRef(), code, status, outcome);
        return new QueryResult(outcome, str(res.get("vnp_TransactionNo")), "VNPAY_STATUS_" + status);
    }

    /**
     * PRD-PAY-15 — hoàn tiền qua VNPay (02 toàn phần, 03 một phần). Mã 00 = VNPay đã nhận yêu cầu (trạng thái có thể
     * còn 05/06 "đang xử lý" — US-62 sẽ thêm REFUND_PENDING + đối soát); 94 = đã có yêu cầu hoàn đang xử lý.
     */
    @Override
    public PaymentGateway.ChargeResult refund(Transaction t, BigDecimal refundAmount, boolean full, String createdBy) {
        String requestId = UUID.randomUUID().toString().replace("-", "");
        String createDate = now();
        String type = full ? "02" : "03";
        String amount = amount(refundAmount);
        String txnNo = t.getProviderReference() == null ? "" : t.getProviderReference();
        String by = createdBy == null || createdBy.isBlank() ? "system" : createdBy;
        String orderInfo = "Hoan tien " + t.getProviderTxnRef();
        Map<String, String> body = new LinkedHashMap<>();
        body.put("vnp_RequestId", requestId);
        body.put("vnp_Version", VERSION);
        body.put("vnp_Command", "refund");
        body.put("vnp_TmnCode", tmnCode);
        body.put("vnp_TransactionType", type);
        body.put("vnp_TxnRef", t.getProviderTxnRef());
        body.put("vnp_Amount", amount);
        body.put("vnp_OrderInfo", orderInfo);
        if (!txnNo.isEmpty()) body.put("vnp_TransactionNo", txnNo);
        body.put("vnp_TransactionDate", t.getProviderCreatedAt());
        body.put("vnp_CreateBy", by);
        body.put("vnp_CreateDate", createDate);
        body.put("vnp_IpAddr", SERVER_IP);
        body.put("vnp_SecureHash", hmac(String.join("|", requestId, VERSION, "refund", tmnCode, type, t.getProviderTxnRef(),
                amount, txnNo, t.getProviderCreatedAt(), by, createDate, SERVER_IP, orderInfo)));
        Map<String, Object> res = post(body);
        String code = str(res.get("vnp_ResponseCode"));
        log.info("VNPay refund {} {} type {} → code {} status {}", t.getProviderTxnRef(), amount, type, code,
                str(res.get("vnp_TransactionStatus")));
        if ("00".equals(code) || "94".equals(code)) {
            return new PaymentGateway.ChargeResult(true, "vnp_re_" + requestId, null);
        }
        return new PaymentGateway.ChargeResult(false, null, "VNPAY_REFUND_" + code);
    }

    private Map<String, Object> post(Map<String, String> body) {
        Map<String, Object> res = api.post()
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .body(new ParameterizedTypeReference<Map<String, Object>>() { });
        return res == null ? Map.of() : res;
    }

    static String encode(Map<String, String> sorted) {
        return sorted.entrySet().stream()
                .filter(e -> e.getValue() != null && !e.getValue().isEmpty())
                .map(e -> URLEncoder.encode(e.getKey(), StandardCharsets.US_ASCII) + "="
                        + URLEncoder.encode(e.getValue(), StandardCharsets.US_ASCII))
                .collect(Collectors.joining("&"));
    }

    String hmac(String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA512");
            mac.init(new SecretKeySpec(hashSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA512"));
            return HexFormat.of().formatHex(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("HMAC-SHA512 unavailable", e);
        }
    }

    private static String str(Object o) {
        return o == null ? "" : o.toString();
    }
}
