package com.mmp.payment.controller;

import com.mmp.payment.exception.ApiException;
import com.mmp.payment.service.EarningService;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * Công cụ dev/e2e cho luồng phụ thuộc thời gian của US-25 (giải phóng thu nhập sau 48 giờ) mà không phải chờ thật.
 * Nằm dưới /internal/** (chỉ X-Internal-Token, không đi qua proxy frontend) và KHÔNG tồn tại ở profile prod — cùng mẫu
 * với mentoring-service /internal/dev.
 */
@RestController
@RequestMapping("/internal/dev")
@Profile("!prod")
public class InternalDevController {

    private final EarningService earnings;

    public InternalDevController(EarningService earnings) {
        this.earnings = earnings;
    }

    /** Đưa lịch giải phóng thu nhập của phiên tới hạn ngay (release_at = now − 1 phút). */
    @PostMapping("/earnings/{sessionId}/due")
    public Map<String, Object> makeDue(@PathVariable UUID sessionId) {
        int n = earnings.makeDue(sessionId);
        if (n == 0) throw ApiException.notFound("SCHEDULE_NOT_FOUND", "Phiên chưa có lịch giải phóng thu nhập");
        return Map.of("sessionId", sessionId, "schedules", n);
    }

    /** Chạy ngay job nền: earning-release. */
    @PostMapping("/jobs/{job}")
    public Map<String, Object> runJob(@PathVariable String job) {
        if (!"earning-release".equals(job)) throw ApiException.notFound("JOB_NOT_FOUND", "Không có job " + job);
        int released = earnings.releaseDue(OffsetDateTime.now());
        return Map.of("job", job, "status", "DONE", "released", released);
    }
}
