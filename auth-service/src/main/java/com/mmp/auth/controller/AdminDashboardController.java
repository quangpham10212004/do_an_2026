package com.mmp.auth.controller;

import com.mmp.auth.exception.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/auth/admin/dashboard")
@PreAuthorize("hasRole('ADMIN')")
public class AdminDashboardController {
    private final JdbcTemplate jdbc;
    private final JavaMailSenderImpl mail;
    private final String emailMode;
    private final String paymentUrl;
    private final String matchingUrl;
    private final String videoHealthUrl;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();

    public AdminDashboardController(JdbcTemplate jdbc, JavaMailSenderImpl mail,
                                    @Value("${app.email.mode:log}") String emailMode,
                                    @Value("${app.services.payment-url}") String paymentUrl,
                                    @Value("${MATCHING_SERVICE_URL:http://localhost:8090}") String matchingUrl,
                                    @Value("${JITSI_HEALTH_URL:https://localhost:8443/external_api.js}") String videoHealthUrl) {
        this.jdbc = jdbc;
        this.mail = mail;
        this.emailMode = emailMode;
        this.paymentUrl = paymentUrl;
        this.matchingUrl = matchingUrl;
        this.videoHealthUrl = videoHealthUrl;
    }

    public record Registrations(long total, long mentees, long mentors, long previous) {}
    public record ServiceStatus(String id, String name, String state) {}

    @GetMapping("/registrations")
    public Registrations registrations(@RequestParam int days,
                                       @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime asOf) {
        if (days != 30 && days != 60 && days != 90) {
            throw ApiException.badRequest("INVALID_REPORT_PERIOD", "Kỳ báo cáo không hợp lệ");
        }
        OffsetDateTime start = asOf.minusDays(days);
        return jdbc.queryForObject("""
                SELECT count(*) FILTER (WHERE created_at >= ?) AS total,
                       count(*) FILTER (WHERE created_at >= ? AND role = 'MENTEE') AS mentees,
                       count(*) FILTER (WHERE created_at >= ? AND role = 'MENTOR') AS mentors,
                       count(*) FILTER (WHERE created_at < ?) AS previous
                  FROM users
                 WHERE role IN ('MENTOR', 'MENTEE') AND created_at >= ? AND created_at < ?
                """, (rs, row) -> new Registrations(rs.getLong("total"), rs.getLong("mentees"),
                rs.getLong("mentors"), rs.getLong("previous")), start, start, start, start, start.minusDays(days), asOf);
    }

    @GetMapping("/health")
    public List<ServiceStatus> health() {
        return List.of(
                probe("pay", "Dịch vụ thanh toán", paymentUrl + "/actuator/health"),
                probe("video", "Phòng học video", videoHealthUrl),
                probe("match", "AI Matching", matchingUrl + "/health"),
                probe("mail", "Gửi email", () -> {
                    if (!"smtp".equalsIgnoreCase(emailMode)) return false;
                    mail.testConnection();
                    return true;
                }));
    }

    private ServiceStatus probe(String id, String name, String url) {
        return probe(id, name, () -> {
            var request = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(2)).build();
            int status = http.send(request, HttpResponse.BodyHandlers.discarding()).statusCode();
            return status >= 200 && status < 400;
        });
    }

    private ServiceStatus probe(String id, String name, java.util.concurrent.Callable<Boolean> check) {
        long started = System.nanoTime();
        try {
            if (check.call()) {
                return new ServiceStatus(id, name,
                        Duration.ofNanos(System.nanoTime() - started).toMillis() >= 1000 ? "SLOW" : "OK");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception ignored) {
            // A failed dependency is shown as down alongside the other checks.
        }
        return new ServiceStatus(id, name, "DOWN");
    }
}
