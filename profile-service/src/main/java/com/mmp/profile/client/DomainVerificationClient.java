package com.mmp.profile.client;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.mmp.profile.exception.ApiException;
import com.mmp.profile.observability.RequestIds;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.multipart.MultipartFile;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;

@Component
public class DomainVerificationClient {
    private final RestClient client;
    private final ObjectMapper mapper;

    public DomainVerificationClient(@Value("${app.services.ai-url}") String aiUrl,
                                    @Value("${app.security.internal-api-key}") String internalToken,
                                    ObjectMapper mapper) {
        var transport = new SimpleClientHttpRequestFactory();
        transport.setConnectTimeout(Duration.ofSeconds(3));
        transport.setReadTimeout(Duration.ofSeconds(15));
        this.client = RestClient.builder().baseUrl(aiUrl).requestFactory(transport)
                .requestInterceptor(RequestIds.interceptor())
                .requestInterceptor((request, body, execution) -> {
                    if (request.getURI().getPath().startsWith("/internal/")) {
                        request.getHeaders().set("X-Internal-Token", internalToken);
                    }
                    return execution.execute(request, body);
                }).build();
        this.mapper = mapper;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record CvFile(UUID id, String fileName, OffsetDateTime purgedAt) {}

    public CvFile uploadCv(String authorization, MultipartFile file) {
        var form = new LinkedMultiValueMap<String, Object>();
        form.add("file", file.getResource());
        form.add("consentExternalAi", "false");
        return exchange(() -> client.post().uri("/api/ai/cv/parse")
                .header(HttpHeaders.AUTHORIZATION, authorization).contentType(MediaType.MULTIPART_FORM_DATA)
                .body(form).retrieve().body(CvFile.class));
    }

    public List<CvFile> currentCvs(String authorization) {
        var type = new ParameterizedTypeReference<List<CvFile>>() {};
        return exchange(() -> client.get().uri("/api/ai/cv/mine")
                .header(HttpHeaders.AUTHORIZATION, authorization).retrieve().body(type))
                .stream().filter(cv -> cv.purgedAt() == null).toList();
    }

    public void cancelTrack(UUID mentorId, String domain, UUID profileDomainId) {
        exchange(() -> client.delete().uri(builder -> builder
                .path("/internal/verification/mentors/{mentorId}/tracks/{domain}")
                .queryParam("profileDomainId", profileDomainId).build(mentorId, domain)).retrieve().toBodilessEntity());
    }

    private <T> T exchange(Supplier<T> operation) {
        try {
            return operation.get();
        } catch (RestClientResponseException e) {
            if (e.getStatusCode().is4xxClientError()) {
                String code = "AI_REQUEST_FAILED";
                String message = "Dịch vụ xác thực không xử lý được yêu cầu";
                try {
                    var error = mapper.readTree(e.getResponseBodyAsByteArray()).path("error");
                    code = error.path("code").asText(code);
                    message = error.path("message").asText(message);
                } catch (java.io.IOException ignored) {
                    // The default error also covers non-JSON upstream responses.
                }
                throw new ApiException(HttpStatus.valueOf(e.getStatusCode().value()), code, message);
            }
            throw unavailable();
        } catch (RestClientException e) {
            throw unavailable();
        }
    }

    private ApiException unavailable() {
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "AI_SERVICE_UNAVAILABLE",
                "Dịch vụ xác thực tạm thời không khả dụng");
    }
}
