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
     * US-01 — hoàn {@code percent}% giá phiên. Sprint 1 chỉ dùng 100% (chính sách chỉ có 100% / 0%; 0% không gọi);
     * hoàn một phần do US-13 bổ sung phía payment-service.
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
     * US-01 — cộng điểm thưởng (reward_ledger) cho người dùng. Idempotent theo (userId, reason, sessionId) phía
     * payment-service. Ném RestClientException khi lỗi để outbox gửi lại.
     */
    public void reward(UUID userId, int points, String reason, UUID sessionId) {
        restClient.post().uri("/internal/rewards")
                .body(Map.of("userId", userId.toString(), "points", points, "reason", reason, "sessionId", sessionId.toString()))
                .retrieve().toBodilessEntity();
    }
}
