package com.mmp.mentoring.client;

import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.observability.RequestIds;
import com.mmp.mentoring.security.JwtAuthenticationFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Component
public class PaymentClient {

    private final RestClient restClient;

    public PaymentClient(@Value("${app.services.payment-url}") String paymentUrl,
                         @Value("${app.security.internal-api-key}") String internalApiKey) {
        this.restClient = RestClient.builder()
                .requestInterceptor(RequestIds.interceptor())
                .baseUrl(paymentUrl)
                .defaultHeader(JwtAuthenticationFilter.INTERNAL_HEADER, internalApiKey)
                .build();
    }

    /** Kết quả trả học phí từ ví: PAID, hoặc thiếu tiền (balance / needed lấy từ thông báo lỗi payment-service). */
    public record WalletPayResult(boolean paid, boolean insufficientFunds, String errorCode) {
    }

    /**
     * Bản chốt v2.0 §5 — tạm giữ học phí của phiên từ ví của mentee. payment-service tự đọc giá phiên từ mentoring-service
     * (không tin client) rồi báo lại {@code payment-succeeded}. 402 INSUFFICIENT_FUNDS → phiên giữ PENDING để mentee nạp thêm.
     * Lỗi khác (ví đóng băng / ngủ / mạng) cũng không ném: phiên vẫn PENDING, mentee thử lại từ trang thanh toán.
     */
    public WalletPayResult payFromWallet(UUID menteeId, UUID sessionId) {
        try {
            restClient.post().uri("/internal/wallet/pay")
                    .body(Map.of("userId", menteeId.toString(), "sessionId", sessionId.toString())).retrieve().toBodilessEntity();
            return new WalletPayResult(true, false, null);
        } catch (HttpClientErrorException e) {
            String code = e.getStatusCode().value() == 402 ? "INSUFFICIENT_FUNDS" : "WALLET_PAY_" + e.getStatusCode().value();
            return new WalletPayResult(false, e.getStatusCode().value() == 402, code);
        } catch (RestClientException e) {
            return new WalletPayResult(false, false, "PAYMENT_UNAVAILABLE");
        }
    }

    /** Admin khoá / mở khoá tài khoản → đóng băng / mở ví (best-effort, idempotent). */
    public void freezeWallet(UUID userId, boolean frozen) {
        try {
            restClient.post().uri("/internal/wallet/freeze").body(Map.of("userId", userId.toString(), "frozen", frozen))
                    .retrieve().toBodilessEntity();
        } catch (RestClientException e) {
            org.slf4j.LoggerFactory.getLogger(PaymentClient.class).warn("Could not {} wallet of {}: {}", frozen ? "freeze" : "unfreeze", userId, e.getMessage());
        }
    }

    /** Hoàn tiền toàn bộ cho phiên đã thanh toán. Trả về false nếu phiên không có giao dịch thành công. */
    public boolean refund(UUID sessionId, String reason) {
        return refund(sessionId, reason, 100);
    }

    /**
     * US-01 — hoàn {@code percent}% giá phiên (chính sách hiện chỉ có 100% / 0%; 0% không gọi). payment-service hỗ trợ
     * hoàn một phần từ US-13. Lỗi → 502 REFUND_FAILED (người dùng thử lại).
     */
    public boolean refund(UUID sessionId, String reason, int percent) {
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("sessionId", sessionId.toString());
            body.put("reason", reason);
            body.put("percent", percent);
            restClient.post().uri("/internal/payments/refund").body(body).retrieve().toBodilessEntity();
            return true;
        } catch (HttpClientErrorException.NotFound e) {
            return false;
        } catch (RestClientException e) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "REFUND_FAILED", "Không thể hoàn tiền, vui lòng thử lại sau");
        }
    }

    /**
     * US-12 (qua outbox) — hoàn {@code percent}% không bọc lỗi: 404 (không có giao dịch đã thu tiền: phiên miễn phí /
     * đã hoàn đủ) → false; lỗi khác ném RestClientException để outbox phân biệt 4xx (bỏ) với 5xx/mạng (gửi lại).
     */
    public boolean refundRaw(UUID sessionId, String reason, int percent) {
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("sessionId", sessionId.toString());
            body.put("reason", reason);
            body.put("percent", percent);
            restClient.post().uri("/internal/payments/refund").body(body).retrieve().toBodilessEntity();
            return true;
        } catch (HttpClientErrorException.NotFound e) {
            return false;
        }
    }

    /** US-12 — tạm giữ giao dịch của phiên DISPUTED (SUCCESS → ON_HOLD). 404 = phiên không có giao dịch đã thu tiền. */
    public boolean hold(UUID sessionId, String reason) {
        try {
            restClient.post().uri("/internal/payments/hold")
                    .body(Map.of("sessionId", sessionId.toString(), "reason", reason)).retrieve().toBodilessEntity();
            return true;
        } catch (HttpClientErrorException.NotFound e) {
            return false;
        }
    }

    /**
     * US-25 — báo trạng thái cuối của phiên (payment-service giữ đồng hồ 48 giờ giải phóng thu nhập). Ném
     * RestClientException khi lỗi để outbox phân biệt 4xx/5xx.
     */
    public void finalState(UUID sessionId, String state, java.time.OffsetDateTime endedAt, boolean releaseNow) {
        restClient.post().uri("/internal/payments/sessions/{id}/final-state", sessionId)
                .body(Map.of("state", state, "endedAt", endedAt.toString(), "releaseNow", releaseNow))
                .retrieve().toBodilessEntity();
    }

    /** US-32 — giải phóng giao dịch tạm giữ (ON_HOLD → SUCCESS). 404 = phiên không có giao dịch đã thu tiền. */
    public boolean release(UUID sessionId) {
        try {
            restClient.post().uri("/internal/payments/release")
                    .body(Map.of("sessionId", sessionId.toString())).retrieve().toBodilessEntity();
            return true;
        } catch (HttpClientErrorException.NotFound e) {
            return false;
        }
    }

    /**
     * US-01 — cộng điểm thưởng (reward_ledger) cho người dùng. Idempotent theo (userId, reason, sessionId) phía
     * payment-service. Ném RestClientException khi lỗi để outbox gửi lại.
     */
    public void reward(UUID userId, int points, String reason, UUID sessionId) {
        restClient.post().uri("/internal/rewards")
                .body(Map.of("userId", userId.toString(), "points", points, "reason", reason, "sessionId", sessionId.toString()))
                .retrieve().toBodilessEntity();
    }
}
