package com.mmp.learning.observability;

import io.micrometer.prometheusmetrics.PrometheusMeterRegistry;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** US-46 (NFR-17) — GET /metrics: số liệu Prometheus (http_server_requests_seconds, JVM, pool CSDL...). */
@RestController
public class MetricsController {

    private static final MediaType PROMETHEUS_TEXT = MediaType.parseMediaType("text/plain;version=0.0.4;charset=utf-8");

    private final PrometheusMeterRegistry registry;

    public MetricsController(PrometheusMeterRegistry registry) {
        this.registry = registry;
    }

    @GetMapping("/metrics")
    public ResponseEntity<String> metrics() {
        return ResponseEntity.ok().contentType(PROMETHEUS_TEXT).body(registry.scrape());
    }
}
