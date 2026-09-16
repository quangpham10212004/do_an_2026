package com.mmp.payment.client;

import com.mmp.payment.exception.ApiException;
import com.mmp.payment.security.JwtAuthenticationFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/** Gọi endpoint nội bộ của mentoring-service. */
@Component
public class MentoringClient {

    private final RestClient restClient;

    public MentoringClient(@Value("${app.services.mentoring-url}") String mentoringUrl,
                           @Value("${app.security.internal-api-key}") String internalApiKey) {
        this.restClient = RestClient.builder()
                .baseUrl(mentoringUrl)
                .defaultHeader(JwtAuthenticationFilter.INTERNAL_HEADER, internalApiKey)
                .build();
    }

    public record SessionInfo(UUID id, UUID menteeId, UUID mentorId, OffsetDateTime scheduledAt,
                              int durationMinutes, BigDecimal price, String status) {
    }

    public SessionInfo getSession(UUID sessionId) {
        return restClient.get()
                .uri("/internal/sessions/{id}", sessionId)
                .retrieve()
                .onStatus(s -> s.value() == 404, (req, res) -> {
                    throw ApiException.notFound("SESSION_NOT_FOUND", "Không tìm thấy phiên mentoring");
                })
                .onStatus(HttpStatusCode::isError, (req, res) -> {
                    throw new ApiException(org.springframework.http.HttpStatus.BAD_GATEWAY, "MENTORING_UNAVAILABLE",
                            "Không thể kết nối tới dịch vụ mentoring");
                })
                .body(SessionInfo.class);
    }

    /** FR-6.2 — báo mentoring-service xác nhận phiên sau khi thanh toán thành công. */
    public void notifyPaymentSucceeded(UUID sessionId, UUID transactionId) {
        restClient.post()
                .uri("/internal/sessions/{id}/payment-succeeded", sessionId)
                .body(Map.of("transactionId", transactionId.toString()))
                .retrieve()
                .toBodilessEntity();
    }
}
