package com.mmp.mentoring.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mmp.mentoring.client.AiModels.*;
import com.mmp.mentoring.exception.ApiException;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Kiểm thử AiClient với server HTTP giả lập ai-service. */
class AiClientTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private HttpServer server;
    private int status = 200;
    private String responseBody = "{}";
    private final List<String> paths = new ArrayList<>();
    private final List<String> bodies = new ArrayList<>();
    private final List<String> tokens = new ArrayList<>();
    private final List<String> contentTypes = new ArrayList<>();

    @BeforeEach
    void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            paths.add(exchange.getRequestURI().getPath());
            tokens.add(exchange.getRequestHeaders().getFirst("X-Internal-Token"));
            contentTypes.add(exchange.getRequestHeaders().getFirst("Content-Type"));
            bodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] bytes = responseBody.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    private AiClient client() {
        return new AiClient("http://127.0.0.1:" + server.getAddress().getPort(), Duration.ofSeconds(5), "secret-key", MAPPER);
    }

    @Test
    void evaluateSendsHistoryAndPreferredEngine() throws Exception {
        responseBody = """
                {"score": 7.5, "feedback": "Tốt", "next": {"topic": "API", "strategy": "DEEPEN", "question": "Q2"},
                 "engine": "DEEPSEEK", "fallbackUsed": false}""";
        InterviewContext ctx = new InterviewContext("backend", List.of("Java"), 3, null, 5);
        TurnRecord current = new TurnRecord(1, "API", "OPENING", "Q1", "Trả lời", null);

        EvaluationResult result = client().evaluate(ctx, List.of(), current, false, "DEEPSEEK");

        assertThat(result.score()).isEqualTo(7.5f);
        assertThat(result.next().strategy()).isEqualTo("DEEPEN");
        assertThat(paths).containsExactly("/internal/interview/evaluate");
        assertThat(tokens).containsExactly("secret-key");
        JsonNode body = MAPPER.readTree(bodies.get(0));
        assertThat(body.path("engine").asText()).isEqualTo("DEEPSEEK");
        assertThat(body.path("isLastTurn").asBoolean()).isFalse();
        assertThat(body.path("current").path("answer").asText()).isEqualTo("Trả lời");
        assertThat(body.path("context").path("maxTurns").asInt()).isEqualTo(5);
    }

    @Test
    void firstQuestionOmitsEngineWhenNotChosenYet() throws Exception {
        responseBody = "{\"topic\": \"API\", \"strategy\": \"OPENING\", \"question\": \"Q1\", \"engine\": \"RULE_BASED\"}";
        client().firstQuestion(new InterviewContext("backend", List.of(), 0, null, 5), null);
        assertThat(MAPPER.readTree(bodies.get(0)).has("engine")).isFalse();
    }

    @Test
    void cvIsUploadedAsMultipart() {
        responseBody = """
                {"rawText": "Java dev", "parsed": {"currentRole": "Dev", "skills": ["Java"], "yearsExperience": 2,
                 "projects": [], "education": []}, "engine": "RULE_BASED", "fallbackUsed": false}""";
        CvParseResult result = client().parseCv("%PDF-1.4 test".getBytes(), "cv.pdf");
        assertThat(result.parsed().skills()).containsExactly("Java");
        assertThat(contentTypes.get(0)).startsWith("multipart/form-data");
        assertThat(bodies.get(0)).contains("filename=\"cv.pdf\"").contains("%PDF-1.4 test");
    }

    @Test
    void clientErrorsAreForwardedWithSameCode() {
        status = 400;
        responseBody = "{\"error\": {\"code\": \"CV_NO_TEXT\", \"message\": \"Không đọc được nội dung CV\"}}";
        assertThatThrownBy(() -> client().parseCv(new byte[]{1}, "cv.pdf"))
                .isInstanceOf(ApiException.class)
                .satisfies(e -> {
                    assertThat(((ApiException) e).getCode()).isEqualTo("CV_NO_TEXT");
                    assertThat(((ApiException) e).getStatus().value()).isEqualTo(400);
                });
    }

    @Test
    void serverErrorsAndConnectionFailuresBecomeBadGateway() {
        status = 500;
        responseBody = "{\"detail\": \"boom\"}";
        assertThatThrownBy(() -> client().summarizeGoal(null, List.of(), null))
                .extracting(e -> ((ApiException) e).getCode()).isEqualTo("AI_SERVICE_UNAVAILABLE");

        AiClient unreachable = new AiClient("http://127.0.0.1:1", Duration.ofSeconds(1), "k", MAPPER);
        assertThatThrownBy(() -> unreachable.firstQuestion(new InterviewContext("x", List.of(), 0, null, 5), null))
                .extracting(e -> ((ApiException) e).getStatus().value()).isEqualTo(502);
    }
}
