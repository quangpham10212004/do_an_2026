package com.mmp.mentoring.client;

import com.mmp.mentoring.exception.ApiException;
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
                .baseUrl(paymentUrl)
                .defaultHeader(JwtAuthenticationFilter.INTERNAL_HEADER, internalApiKey)
                .build();
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

    /**
     * Hoàn tiền gói buổi theo TỔNG LUỸ KẾ {@code refundedTotal} (không phải phần chênh): payment-service tự tính phần còn
     * thiếu so với những gì đã hoàn nên gọi lại sau lỗi mạng không hoàn trùng. Ném RestClientException khi lỗi để
     * PackageService giữ cờ refund_pending và thử lại; 404 (gói chưa có giao dịch thu tiền) → false.
     */
    public boolean refundPackage(UUID packageId, java.math.BigDecimal refundedTotal, String reason) {
        try {
            restClient.post().uri("/internal/payments/refund-package")
                    .body(Map.of("packageId", packageId.toString(), "refundedTotal", refundedTotal, "reason", reason))
                    .retrieve().toBodilessEntity();
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
     * US-01 — cộng điểm thưởng (reward_ledger) cho người dùng. Idempotent theo (userId, reason, sessionId) phía
     * payment-service. Ném RestClientException khi lỗi để outbox gửi lại.
     */
    public void reward(UUID userId, int points, String reason, UUID sessionId) {
        restClient.post().uri("/internal/rewards")
                .body(Map.of("userId", userId.toString(), "points", points, "reason", reason, "sessionId", sessionId.toString()))
                .retrieve().toBodilessEntity();
    }
}
