package com.mmp.profile.client;

import com.mmp.profile.observability.RequestIds;
import com.mmp.profile.security.JwtAuthenticationFilter;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * Báo cho matching-service biết một hồ sơ vừa thay đổi (POST /internal/embeddings/reindex).
 * Xem contracts/matching-service.yaml.
 *
 * profile-service KHÔNG sở hữu embedding: nó không biết text được chuẩn hoá thế
 * nào, không giữ vector và không đọc trạng thái chỉ mục. Ở đây chỉ gửi đi định
 * danh hồ sơ — matching-service tự đọc nội dung hồ sơ từ profile_db (read-only).
 *
 * Lời gọi là "bắn rồi quên": chạy ngoài luồng request nên không làm chậm phản hồi
 * và không bao giờ làm hỏng việc lưu hồ sơ. Nếu lời gọi thất bại (matching-service
 * đang down, hàng đợi đầy) thì IndexSyncJob bên matching-service sẽ phát hiện hồ
 * sơ lệch hash ở vòng quét kế tiếp — vì vậy service này không cần job retry riêng.
 */
@Component
public class MatchingIndexClient {

    private static final Logger log = LoggerFactory.getLogger(MatchingIndexClient.class);

    private final RestClient restClient;
    /**
     * Hàng đợi có giới hạn: nếu matching-service chậm tới mức dồn hơn 500 thông báo,
     * ta bỏ bớt thay vì để hàng đợi phình vô hạn — chỉ mục vẫn đúng nhờ IndexSyncJob.
     */
    private final ExecutorService executor = new ThreadPoolExecutor(
            1, 2, 60L, TimeUnit.SECONDS, new LinkedBlockingQueue<>(500),
            r -> {
                Thread t = new Thread(r, "matching-reindex");
                t.setDaemon(true);
                return t;
            },
            new ThreadPoolExecutor.DiscardPolicy());

    public MatchingIndexClient(@Value("${app.services.matching-url}") String matchingServiceUrl,
                               @Value("${app.security.internal-api-key}") String internalApiKey) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(3));
        factory.setReadTimeout(Duration.ofSeconds(20));
        this.restClient = RestClient.builder()
                .requestInterceptor(RequestIds.interceptor())
                .baseUrl(matchingServiceUrl)
                .requestFactory(factory)
                .defaultHeader(JwtAuthenticationFilter.INTERNAL_HEADER, internalApiKey)
                .build();
    }

    /** role: MENTOR hoặc MENTEE. */
    public void reindexAsync(String role, UUID userId) {
        try {
            executor.execute(RequestIds.wrap(() -> reindex(role, userId)));
        } catch (RejectedExecutionException e) {
            log.debug("Bỏ qua thông báo reindex cho {} {}: hàng đợi đầy", role, userId);
        }
    }

    void reindex(String role, UUID userId) {
        try {
            restClient.post()
                    .uri("/internal/embeddings/reindex")
                    .body(Map.of("userId", userId.toString(), "role", role))
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception e) {
            // Không phải lỗi nghiệp vụ: hồ sơ đã lưu xong, chỉ mục sẽ tự đồng bộ sau.
            log.debug("Không báo được reindex cho {} {}: {}", role, userId, e.getMessage());
        }
    }

    @PreDestroy
    void shutdown() {
        executor.shutdown();
    }
}
