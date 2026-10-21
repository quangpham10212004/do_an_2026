package com.mmp.payment.controller;

import com.mmp.payment.exception.ApiException;
import com.mmp.payment.service.EarningService;
import com.mmp.payment.service.WalletService;
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
    private final WalletService wallet;
    private final com.mmp.payment.service.MentorReferralService mentorReferrals;
    private final org.springframework.jdbc.core.JdbcTemplate jdbc;

    public InternalDevController(EarningService earnings, WalletService wallet, org.springframework.jdbc.core.JdbcTemplate jdbc,
                                 com.mmp.payment.service.MentorReferralService mentorReferrals) {
        this.mentorReferrals = mentorReferrals;
        this.earnings = earnings;
        this.wallet = wallet;
        this.jdbc = jdbc;
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
        if ("wallet-maintenance".equals(job)) {
            OffsetDateTime now = OffsetDateTime.now();
            int[] r = wallet.runExpiry(now);
            return Map.of("job", job, "status", "DONE", "expiredLots", r[0], "dormantWallets", r[1], "reminders", wallet.sendReminders(now));
        }
        if ("referral-eval".equals(job)) {
            return Map.of("job", job, "status", "DONE", "decided", mentorReferrals.evaluateDue(OffsetDateTime.now()));
        }
        if (!"earning-release".equals(job)) throw ApiException.notFound("JOB_NOT_FOUND", "Không có job " + job);
        int released = earnings.releaseDue(OffsetDateTime.now());
        return Map.of("job", job, "status", "DONE", "released", released);
    }

    /** Lùi giờ kết thúc của buổi {@code days} ngày (kiểm thử đồng hồ 7 ngày của thưởng giới thiệu). */
    @PostMapping("/earnings/{sessionId}/age")
    public Map<String, Object> ageEarning(@PathVariable UUID sessionId, @RequestBody Map<String, Integer> body) {
        int days = body.getOrDefault("days", 0);
        int n = jdbc.update("UPDATE earning_schedules SET ended_at = ended_at - make_interval(days => ?) WHERE session_id = ?", days, sessionId);
        return Map.of("sessionId", sessionId, "schedules", n, "days", days);
    }

    /** Lùi mốc thời gian của ví để e2e kiểm tra hết hạn khuyến mãi / ví ngủ / cửa sổ hoàn tiền nạp mà không phải chờ thật. */
    @PostMapping("/wallet/{userId}/shift")
    public Map<String, Object> shiftWallet(@PathVariable UUID userId, @RequestBody Map<String, Integer> body) {
        int promoDays = body.getOrDefault("promoDaysBack", 0);
        int idleMonths = body.getOrDefault("idleMonths", 0);
        int topupDays = body.getOrDefault("topupDaysBack", 0);
        if (promoDays > 0) {
            jdbc.update("UPDATE wallet_promo_lots SET expires_at = expires_at - make_interval(days => ?) WHERE user_id = ?", promoDays, userId);
        }
        if (idleMonths > 0) {
            jdbc.update("UPDATE wallets SET last_activity_at = last_activity_at - make_interval(months => ?) WHERE user_id = ?", idleMonths, userId);
        }
        if (topupDays > 0) {
            jdbc.update("UPDATE transactions SET created_at = created_at - make_interval(days => ?) WHERE payer_id = ? AND kind = 'TOPUP'", topupDays, userId);
        }
        return Map.of("userId", userId, "promoDaysBack", promoDays, "idleMonths", idleMonths, "topupDaysBack", topupDays);
    }
}
