package com.mmp.mentoring.client;

import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.security.JwtAuthenticationFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.math.BigDecimal;
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

    /** Hoàn tiền cho phiên đã thanh toán. Trả về false nếu phiên không có giao dịch thành công. */
    public boolean refund(UUID sessionId, String reason) {
        try {
            restClient.post().uri("/internal/payments/refund")
                    .body(Map.of("sessionId", sessionId.toString(), "reason", reason))
                    .retrieve().toBodilessEntity();
            return true;
        } catch (HttpClientErrorException.NotFound e) {
            return false;
        } catch (RestClientException e) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "REFUND_FAILED", "Không thể hoàn tiền, vui lòng thử lại sau");
        }
    }

    /**
     * Hoàn tiền cho gói buổi (các buổi chưa dùng). {@code refundedTotal} là TỔNG số tiền đã hoàn luỹ kế mong muốn
     * (idempotent: gửi lại cùng giá trị không hoàn thêm). Ném {@link ApiException} 502 nếu payment-service từ chối
     * hoặc không phản hồi; người gọi giữ cờ {@code refund_pending} để thử lại.
     */
    public void refundPackage(UUID packageId, BigDecimal refundedTotal, String reason) {
        try {
            restClient.post().uri("/internal/payments/refund")
                    .body(Map.of("packageId", packageId.toString(), "refundedTotal", refundedTotal, "reason", reason))
                    .retrieve().toBodilessEntity();
        } catch (RestClientException e) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "REFUND_FAILED", "Không thể hoàn tiền, vui lòng thử lại sau");
        }
    }
}
