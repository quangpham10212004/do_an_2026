package com.mmp.profile.client;

import com.mmp.profile.observability.RequestIds;
import com.mmp.profile.security.JwtAuthenticationFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * US-27 — báo mentoring-service rằng mentor vừa bị đình chỉ để nó huỷ mọi phiên PENDING/CONFIRMED
 * tương lai (cancelledBy=SYSTEM, hoàn 100%, báo mentee). Endpoint do Team A cài
 * (POST /internal/mentors/{id}/suspend, idempotent) — chưa có (404) hoặc lỗi thì chỉ trả kết quả
 * "chưa báo được" để admin thấy, KHÔNG làm hỏng thao tác đình chỉ (trạng thái ở profile-service
 * đã đủ để chặn yêu cầu / đặt lịch mới và loại khỏi matching).
 */
@Component
public class MentoringClient {

    private static final Logger log = LoggerFactory.getLogger(MentoringClient.class);

    /** Kết quả gọi mentoring-service: notified=false khi endpoint chưa có / lỗi; cancelledSessions null khi không rõ. */
    public record SuspendResult(boolean notified, Integer cancelledSessions, String error) {
        public static SuspendResult failed(String error) {
            return new SuspendResult(false, null, error);
        }
    }

    private record SuspendResponse(Integer cancelledSessions) {
    }

    private final RestClient restClient;

    public MentoringClient(@Value("${app.services.mentoring-url}") String mentoringUrl,
                           @Value("${app.security.internal-api-key}") String internalApiKey) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(3));
        factory.setReadTimeout(Duration.ofSeconds(30));
        this.restClient = RestClient.builder()
                .requestInterceptor(RequestIds.interceptor())
                .baseUrl(mentoringUrl)
                .requestFactory(factory)
                .defaultHeader(JwtAuthenticationFilter.INTERNAL_HEADER, internalApiKey)
                .build();
    }

    public SuspendResult suspendMentor(UUID mentorId, String reason, UUID actorId) {
        Map<String, Object> body = new HashMap<>();
        body.put("reason", reason);
        body.put("actorId", actorId == null ? null : actorId.toString());
        try {
            SuspendResponse res = restClient.post()
                    .uri("/internal/mentors/{id}/suspend", mentorId)
                    .body(body)
                    .retrieve()
                    .body(SuspendResponse.class);
            return new SuspendResult(true, res == null ? null : res.cancelledSessions(), null);
        } catch (HttpClientErrorException.NotFound e) {
            log.warn("mentoring-service chưa có /internal/mentors/{}/suspend (404) — phiên tương lai chưa được huỷ", mentorId);
            return SuspendResult.failed("ENDPOINT_NOT_FOUND");
        } catch (RestClientException e) {
            log.warn("Không báo được mentoring-service đình chỉ mentor {}: {}", mentorId, e.getMessage());
            return SuspendResult.failed("MENTORING_UNAVAILABLE");
        }
    }
}
