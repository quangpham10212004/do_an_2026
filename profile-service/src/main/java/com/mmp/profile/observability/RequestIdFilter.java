package com.mmp.profile.observability;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * US-46 (NFR-17) — chạy trước Spring Security: đặt requestId vào MDC, trả lại header X-Request-Id và ghi một dòng
 * access log cho mỗi request (trừ /health, /actuator, /metrics) để lần theo một request qua nhiều service.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestIdFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger("access");

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String id = RequestIds.sanitize(request.getHeader(RequestIds.HEADER));
        MDC.put(RequestIds.MDC_KEY, id);
        response.setHeader(RequestIds.HEADER, id);
        long start = System.nanoTime();
        try {
            chain.doFilter(request, response);
        } finally {
            String path = request.getRequestURI();
            if (!path.startsWith("/health") && !path.startsWith("/actuator") && !path.equals("/metrics")) {
                log.info("{} {} -> {} ({} ms)", request.getMethod(), path, response.getStatus(),
                        (System.nanoTime() - start) / 1_000_000);
            }
            MDC.remove(RequestIds.MDC_KEY);
        }
    }
}
