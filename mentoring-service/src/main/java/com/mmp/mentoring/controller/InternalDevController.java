package com.mmp.mentoring.controller;

import com.mmp.mentoring.entity.MentoringRequest;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.MentoringRequestRepository;
import com.mmp.mentoring.repository.SessionRepository;
import com.mmp.mentoring.service.AttendanceService;
import com.mmp.mentoring.service.PaymentOutboxService;
import com.mmp.mentoring.service.RequestExpiryService;
import com.mmp.mentoring.service.SessionScheduler;
import org.springframework.context.annotation.Profile;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * Công cụ dev/e2e để kiểm thử luồng phụ thuộc thời gian mà không phải chờ thật (US-12 xác nhận tham dự 48 giờ,
 * US-15 yêu cầu hết hạn 72 giờ). Nằm dưới /internal/** (chỉ X-Internal-Token, không đi qua proxy frontend) và
 * KHÔNG tồn tại ở profile prod — cùng mẫu với auth-service /internal/dev/emails.
 */
@RestController
@RequestMapping("/internal/dev")
@Profile("!prod")
public class InternalDevController {

    public record ShiftSessionInput(Integer endedMinutesAgo) {
    }

    public record ShiftRequestInput(Integer createdHoursAgo) {
    }

    private final SessionRepository sessionRepo;
    private final AttendanceService attendance;
    private final PaymentOutboxService outbox;
    private final SessionScheduler scheduler;
    private final MentoringRequestRepository requestRepo;
    private final RequestExpiryService requestExpiry;
    private final TransactionTemplate tx;

    public InternalDevController(SessionRepository sessionRepo, AttendanceService attendance, PaymentOutboxService outbox,
                                 SessionScheduler scheduler, MentoringRequestRepository requestRepo,
                                 RequestExpiryService requestExpiry, TransactionTemplate tx) {
        this.sessionRepo = sessionRepo;
        this.requestRepo = requestRepo;
        this.requestExpiry = requestExpiry;
        this.attendance = attendance;
        this.outbox = outbox;
        this.scheduler = scheduler;
        this.tx = tx;
    }

    /** Dời giờ phiên để phiên đã kết thúc {@code endedMinutesAgo} phút trước (0 = vừa kết thúc). */
    @PostMapping("/sessions/{id}/shift")
    public Map<String, Object> shiftSession(@PathVariable UUID id, @RequestBody ShiftSessionInput in) {
        int ago = in.endedMinutesAgo() == null ? 0 : in.endedMinutesAgo();
        MentoringSession s = tx.execute(st -> {
            MentoringSession ss = sessionRepo.findById(id)
                    .orElseThrow(() -> ApiException.notFound("SESSION_NOT_FOUND", "Không tìm thấy phiên mentoring"));
            ss.setScheduledAt(OffsetDateTime.now().minusMinutes(ago + (long) ss.getDurationMinutes()));
            return ss;
        });
        return Map.of("id", s.getId(), "scheduledAt", s.getScheduledAt(), "endsAt", s.endsAt(), "status", s.getStatus().name());
    }

    /** Lùi thời điểm tạo yêu cầu về {@code createdHoursAgo} giờ trước (kiểm thử US-15 hết hạn 72 giờ). */
    @PostMapping("/requests/{id}/shift")
    public Map<String, Object> shiftRequest(@PathVariable UUID id, @RequestBody ShiftRequestInput in) {
        int ago = in.createdHoursAgo() == null ? 0 : in.createdHoursAgo();
        OffsetDateTime createdAt = OffsetDateTime.now().minusHours(ago);
        Integer updated = tx.execute(st -> requestRepo.overrideCreatedAt(id, createdAt));
        if (updated == null || updated == 0) throw ApiException.notFound("REQUEST_NOT_FOUND", "Không tìm thấy yêu cầu");
        MentoringRequest r = requestRepo.findById(id).orElseThrow();
        return Map.of("id", r.getId(), "createdAt", createdAt, "status", r.getStatus().name());
    }

    /** Chạy ngay một job nền: attendance | payment-outbox | unpaid-expiry | request-expiry. */
    @PostMapping("/jobs/{job}")
    public Map<String, String> runJob(@PathVariable String job) {
        switch (job) {
            case "attendance" -> attendance.runJob();
            case "payment-outbox" -> outbox.flush();
            case "unpaid-expiry" -> scheduler.expireUnpaidSessions();
            case "request-expiry" -> requestExpiry.expire(OffsetDateTime.now());
            default -> throw ApiException.notFound("JOB_NOT_FOUND", "Không có job " + job);
        }
        return Map.of("job", job, "status", "DONE");
    }
}
