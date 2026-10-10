package com.mmp.learning.observability;

import org.slf4j.MDC;
import org.springframework.http.client.ClientHttpRequestInterceptor;

import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * US-46 (NFR-17) — correlation id X-Request-Id: nhận từ client / service gọi tới (nếu hợp lệ) hoặc sinh mới, giữ trong
 * MDC (mọi dòng log JSON có "requestId") và chuyển tiếp sang service kế tiếp qua {@link #interceptor()}.
 */
public final class RequestIds {

    public static final String HEADER = "X-Request-Id";
    public static final String MDC_KEY = "requestId";
    private static final Pattern VALID = Pattern.compile("[A-Za-z0-9._:-]{1,64}");

    private RequestIds() {
    }

    /** Giá trị header hợp lệ thì giữ nguyên, ngược lại (thiếu, quá dài, ký tự lạ — tránh log injection) sinh UUID mới. */
    public static String sanitize(String incoming) {
        return incoming != null && VALID.matcher(incoming).matches() ? incoming : UUID.randomUUID().toString();
    }

    /** Gắn X-Request-Id của request hiện tại vào mọi lời gọi RestClient sang service khác. */
    public static ClientHttpRequestInterceptor interceptor() {
        return (request, body, execution) -> {
            String id = MDC.get(MDC_KEY);
            if (id != null && !request.getHeaders().containsKey(HEADER)) {
                request.getHeaders().set(HEADER, id);
            }
            return execution.execute(request, body);
        };
    }

    /** Mang MDC (requestId) của luồng gọi sang tác vụ chạy trên executor khác (gọi "bắn rồi quên"). */
    public static Runnable wrap(Runnable task) {
        Map<String, String> context = MDC.getCopyOfContextMap();
        return () -> {
            Map<String, String> previous = MDC.getCopyOfContextMap();
            if (context != null) MDC.setContextMap(context); else MDC.clear();
            try {
                task.run();
            } finally {
                if (previous != null) MDC.setContextMap(previous); else MDC.clear();
            }
        };
    }
}
