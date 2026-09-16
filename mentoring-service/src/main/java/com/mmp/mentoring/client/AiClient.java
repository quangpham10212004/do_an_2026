package com.mmp.mentoring.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mmp.mentoring.client.AiModels.*;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.security.JwtAuthenticationFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

/**
 * Gọi ai-service (Python) cho AI Interview, CV Parsing và Chatbot enrichment.
 * ai-service không lưu trạng thái: mọi lịch sử hội thoại được gửi kèm từ DB của mentoring-service.
 * Lỗi 4xx của ai-service (ví dụ file CV không hợp lệ) được chuyển tiếp nguyên mã lỗi; lỗi kết nối/5xx
 * trả về 502 AI_SERVICE_UNAVAILABLE.
 */
@Component
public class AiClient {

    private static final Logger log = LoggerFactory.getLogger(AiClient.class);

    private final RestClient restClient;
    private final ObjectMapper mapper;

    public AiClient(@Value("${app.services.ai-url}") String aiUrl,
                    @Value("${app.services.ai-timeout}") Duration timeout,
                    @Value("${app.security.internal-api-key}") String internalApiKey,
                    ObjectMapper mapper) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(5));
        factory.setReadTimeout(timeout);
        this.restClient = RestClient.builder()
                .baseUrl(aiUrl)
                .requestFactory(factory)
                .defaultHeader(JwtAuthenticationFilter.INTERNAL_HEADER, internalApiKey)
                .build();
        this.mapper = mapper;
    }

    // ---------- AI Interview ----------

    public QuestionResult firstQuestion(InterviewContext ctx, String engine) {
        return post("/internal/interview/first-question", body("context", ctx, "engine", engine), QuestionResult.class);
    }

    public EvaluationResult evaluate(InterviewContext ctx, List<TurnRecord> history, TurnRecord current, boolean isLastTurn,
                                     String engine) {
        Map<String, Object> body = body("context", ctx, "engine", engine);
        body.put("history", history);
        body.put("current", current);
        body.put("isLastTurn", isLastTurn);
        return post("/internal/interview/evaluate", body, EvaluationResult.class);
    }

    public AssessmentResult summarize(InterviewContext ctx, List<TurnRecord> turns, String engine) {
        Map<String, Object> body = body("context", ctx, "engine", engine);
        body.put("turns", turns);
        return post("/internal/interview/summarize", body, AssessmentResult.class);
    }

    // ---------- CV + enrichment ----------

    public CvParseResult parseCv(byte[] pdf, String fileName) {
        HttpHeaders partHeaders = new HttpHeaders();
        partHeaders.setContentType(MediaType.APPLICATION_PDF);
        LinkedMultiValueMap<String, Object> parts = new LinkedMultiValueMap<>();
        parts.add("file", new HttpEntity<>(new ByteArrayResource(pdf) {
            @Override
            public String getFilename() {
                return fileName;
            }
        }, partHeaders));
        return call(() -> restClient.post().uri("/internal/cv/parse")
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(parts)
                .retrieve()
                .body(CvParseResult.class));
    }

    public NextQuestionResult nextEnrichmentQuestion(MenteeContext ctx, List<Exchange> history, String engine) {
        Map<String, Object> body = body("context", ctx, "engine", engine);
        body.put("history", history);
        return post("/internal/enrichment/next-question", body, NextQuestionResult.class);
    }

    public GoalResult summarizeGoal(MenteeContext ctx, List<Exchange> history, String engine) {
        Map<String, Object> body = body("context", ctx, "engine", engine);
        body.put("history", history);
        return post("/internal/enrichment/summarize", body, GoalResult.class);
    }

    private static Map<String, Object> body(String k1, Object v1, String k2, Object v2) {
        Map<String, Object> m = new HashMap<>();
        m.put(k1, v1);
        if (v2 != null) m.put(k2, v2);
        return m;
    }

    private <T> T post(String uri, Object body, Class<T> type) {
        return call(() -> restClient.post().uri(uri).contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(type));
    }

    private <T> T call(Supplier<T> request) {
        try {
            T result = request.get();
            if (result == null) {
                throw unavailable("empty response");
            }
            return result;
        } catch (RestClientResponseException e) {
            if (e.getStatusCode().is4xxClientError() && e.getStatusCode().value() != 403) {
                throw forwardedError(e);
            }
            throw unavailable(e.getStatusCode() + " " + e.getMessage());
        } catch (RestClientException e) {
            throw unavailable(e.getMessage());
        }
    }

    private ApiException forwardedError(RestClientResponseException e) {
        try {
            JsonNode error = mapper.readTree(e.getResponseBodyAsString()).path("error");
            if (error.hasNonNull("code")) {
                return new ApiException(HttpStatus.valueOf(e.getStatusCode().value()), error.get("code").asText(),
                        error.path("message").asText("Dữ liệu không hợp lệ"));
            }
        } catch (Exception ignored) {
            // rơi xuống lỗi chung bên dưới
        }
        return unavailable(e.getMessage());
    }

    private static ApiException unavailable(String reason) {
        log.warn("ai-service call failed: {}", reason);
        return new ApiException(HttpStatus.BAD_GATEWAY, "AI_SERVICE_UNAVAILABLE", "Dịch vụ AI tạm thời không khả dụng, vui lòng thử lại sau");
    }
}
