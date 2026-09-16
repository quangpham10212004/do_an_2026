package com.mmp.auth.client;

import com.mmp.auth.security.JwtAuthenticationFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Map;
import java.util.UUID;

/** Gọi payment-service để ghi nhận người dùng mới đăng ký qua mã giới thiệu (FR-6.5). */
@Component
public class ReferralClient {

    private static final Logger log = LoggerFactory.getLogger(ReferralClient.class);

    private final RestClient restClient;

    public ReferralClient(@Value("${app.services.payment-url}") String paymentUrl,
                          @Value("${app.security.internal-api-key}") String internalApiKey) {
        this.restClient = RestClient.builder()
                .baseUrl(paymentUrl)
                .defaultHeader(JwtAuthenticationFilter.INTERNAL_HEADER, internalApiKey)
                .build();
    }

    /** @return true nếu mã giới thiệu hợp lệ và đã được ghi nhận. Lỗi không chặn việc đăng ký. */
    public boolean registerReferral(String code, UUID refereeId) {
        try {
            restClient.post()
                    .uri("/internal/referrals")
                    .body(Map.of("code", code, "refereeId", refereeId.toString()))
                    .retrieve()
                    .toBodilessEntity();
            return true;
        } catch (Exception e) {
            log.warn("Could not register referral code={} referee={}: {}", code, refereeId, e.getMessage());
            return false;
        }
    }
}
