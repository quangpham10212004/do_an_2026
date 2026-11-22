package com.mmp.payment.controller;

import com.mmp.payment.dto.PaymentDtos.PageResponse;
import com.mmp.payment.entity.Transaction;
import com.mmp.payment.exception.ApiException;
import com.mmp.payment.security.CurrentUser;
import com.mmp.payment.service.RedirectPaymentService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.IntStream;

@RestController
@RequestMapping("/api/payment/admin")
@PreAuthorize("hasRole('ADMIN')")
public class AdminReportingController {
    private static final ZoneId ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final int PAGE_SIZE = 20;
    private static final String LEDGER = """
            WITH ledger AS (
                SELECT id, created_at, CASE WHEN kind = 'TOPUP' THEN 'TOPUP' ELSE 'SESSION_HOLD' END AS type,
                       provider, payer_id AS user_id, CASE WHEN kind = 'TOPUP' THEN amount ELSE -amount END AS amount,
                       status, session_id, failure_reason, provider_reference AS reference
                  FROM transactions
                UNION ALL
                SELECT r.id, r.created_at, 'REFUND', t.provider, t.payer_id,
                       CASE WHEN t.kind = 'TOPUP' THEN -r.amount ELSE r.amount END,
                       'REFUNDED', t.session_id, NULL, r.provider_reference
                  FROM refunds r JOIN transactions t ON t.id = r.transaction_id
                UNION ALL
                SELECT m.id, m.decided_at, 'REFERRAL_REWARD', NULL, m.owner_id, m.reward_amount, 'SUCCESS',
                       m.session_id, NULL, c.code
                  FROM mentor_referrals m JOIN mentor_referral_codes c ON c.id = m.code_id
                 WHERE m.status = 'QUALIFIED' AND m.decided_at IS NOT NULL AND m.reward_amount IS NOT NULL
            )
            """;
    private static final String CAPTURED = "('SUCCESS', 'ON_HOLD', 'PARTIALLY_REFUNDED', 'REFUNDED')";

    private final NamedParameterJdbcTemplate jdbc;
    private final RedirectPaymentService redirect;

    public AdminReportingController(NamedParameterJdbcTemplate jdbc, RedirectPaymentService redirect) {
        this.jdbc = jdbc;
        this.redirect = redirect;
    }

    public record TransactionRow(UUID id, OffsetDateTime createdAt, String type, String provider, UUID userId,
                                  BigDecimal amount, String status, UUID sessionId, String failureReason, String reference) {}
    public record Held(BigDecimal amount, long sessions) {}
    public record TopupToday(BigDecimal amount, BigDecimal momoPercent, BigDecimal vnpayPercent) {}
    public record PromoGranted(BigDecimal amount, long codes) {}
    public record TransactionKpis(Held held, TopupToday topupToday, long failed24h, PromoGranted promoGranted) {}
    public record PayoutAmount(long count, BigDecimal amount) {}
    public record PayoutKpis(PayoutAmount paidThisMonth, BigDecimal avgProcessingDays, PayoutAmount pending) {}
    public record GmvPoint(String label, BigDecimal amount) {}
    public record MentorGmv(UUID id, long sessions, BigDecimal gmv) {}
    public record PlatformRevenue(BigDecimal amount, BigDecimal gmv, BigDecimal feePercent) {}
    public record RefundRate(BigDecimal percent, BigDecimal deltaPoints) {}
    public record RevenueReport(PlatformRevenue platformRevenue, RefundRate refundRate,
                                List<GmvPoint> gmv, List<MentorGmv> topMentors) {}

    @GetMapping("/transactions/rows")
    @Transactional(readOnly = true, isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public PageResponse<TransactionRow> rows(@RequestParam(defaultValue = "") String status,
                                              @RequestParam(defaultValue = "0") int page) {
        if (!status.isEmpty()) {
            try {
                Transaction.Status.valueOf(status);
            } catch (IllegalArgumentException e) {
                throw ApiException.badRequest("INVALID_STATUS", "Trạng thái giao dịch không hợp lệ");
            }
        }
        int index = Math.max(page, 0);
        String filter = " FROM ledger WHERE (:status = '' OR status = :status)";
        var args = Map.of("status", status, "size", PAGE_SIZE, "offset", (long) index * PAGE_SIZE);
        long count = jdbc.queryForObject(LEDGER + "SELECT count(*)" + filter, args, Long.class);
        List<TransactionRow> rows = jdbc.query(LEDGER + "SELECT *" + filter + " ORDER BY created_at DESC, id DESC LIMIT :size OFFSET :offset",
                args, (rs, row) -> new TransactionRow(rs.getObject("id", UUID.class),
                        rs.getObject("created_at", OffsetDateTime.class), rs.getString("type"), rs.getString("provider"),
                        rs.getObject("user_id", UUID.class), rs.getBigDecimal("amount"), rs.getString("status"),
                        rs.getObject("session_id", UUID.class), rs.getString("failure_reason"), rs.getString("reference")));
        return new PageResponse<>(rows, index, PAGE_SIZE, count, (int) ((count + PAGE_SIZE - 1) / PAGE_SIZE));
    }

    @PostMapping("/transactions/{id}/reconcile")
    public Map<String, String> reconcile(@PathVariable UUID id) {
        return Map.of("status", redirect.reconcileTransaction(CurrentUser.get(), id).status());
    }

    @GetMapping("/transactions/kpis")
    public TransactionKpis transactionKpis() {
        OffsetDateTime now = OffsetDateTime.now(ZONE);
        OffsetDateTime today = now.toLocalDate().atStartOfDay(ZONE).toOffsetDateTime();
        return jdbc.queryForObject("""
                WITH held AS (
                    SELECT count(DISTINCT t.session_id) AS sessions,
                           coalesce(sum(t.amount - coalesce(r.refunded, 0)), 0) AS amount
                      FROM transactions t
                      LEFT JOIN LATERAL (SELECT sum(amount) AS refunded FROM refunds WHERE transaction_id = t.id) r ON true
                     WHERE t.kind = 'SESSION' AND t.status IN ('SUCCESS', 'PARTIALLY_REFUNDED', 'ON_HOLD')
                       AND NOT EXISTS (SELECT 1 FROM earning_schedules s WHERE s.transaction_id = t.id)
                ), topup AS (
                    SELECT coalesce(sum(amount), 0) AS amount,
                           coalesce(sum(amount) FILTER (WHERE provider = 'MOMO'), 0) AS momo,
                           coalesce(sum(amount) FILTER (WHERE provider = 'VNPAY'), 0) AS vnpay
                      FROM transactions WHERE kind = 'TOPUP' AND status IN %s AND created_at >= :today
                ), promo AS (
                    SELECT coalesce(sum(reward_amount), 0) AS granted FROM mentor_referrals
                     WHERE status = 'QUALIFIED'
                )
                SELECT held.amount AS held_amount, held.sessions, topup.amount AS topup_amount, topup.momo, topup.vnpay,
                       promo.granted, (SELECT count(*) FROM mentor_referral_codes) AS codes,
                       (SELECT count(*) FROM transactions WHERE status = 'FAILED' AND updated_at >= :yesterday) AS failed
                  FROM held CROSS JOIN topup CROSS JOIN promo
                """.formatted(CAPTURED), Map.of("today", today, "yesterday", now.minusHours(24)), (rs, row) -> {
            BigDecimal topup = rs.getBigDecimal("topup_amount");
            return new TransactionKpis(new Held(rs.getBigDecimal("held_amount"), rs.getLong("sessions")),
                    new TopupToday(topup, percent(rs.getBigDecimal("momo"), topup), percent(rs.getBigDecimal("vnpay"), topup)),
                    rs.getLong("failed"), new PromoGranted(rs.getBigDecimal("granted"), rs.getLong("codes")));
        });
    }

    @GetMapping("/payouts/kpis")
    public PayoutKpis payoutKpis() {
        OffsetDateTime month = OffsetDateTime.now(ZONE).withDayOfMonth(1).toLocalDate().atStartOfDay(ZONE).toOffsetDateTime();
        return jdbc.queryForObject("""
                SELECT count(*) FILTER (WHERE status = 'PAID' AND decided_at >= :month) AS paid_count,
                       coalesce(sum(amount) FILTER (WHERE status = 'PAID' AND decided_at >= :month), 0) AS paid_amount,
                       avg(extract(epoch FROM decided_at - requested_at) / 86400) FILTER (WHERE status = 'PAID') AS avg_days,
                       count(*) FILTER (WHERE status = 'REQUESTED') AS pending_count,
                       coalesce(sum(amount) FILTER (WHERE status = 'REQUESTED'), 0) AS pending_amount
                  FROM payouts
                """, Map.of("month", month), (rs, row) -> new PayoutKpis(
                new PayoutAmount(rs.getLong("paid_count"), rs.getBigDecimal("paid_amount")),
                rs.getBigDecimal("avg_days"),
                new PayoutAmount(rs.getLong("pending_count"), rs.getBigDecimal("pending_amount"))));
    }

    @GetMapping("/reporting/wallets")
    public Map<UUID, BigDecimal> wallets(@RequestParam List<UUID> ids) {
        if (ids.size() > 100) throw ApiException.badRequest("TOO_MANY_USERS", "Tối đa 100 người dùng");
        if (ids.isEmpty()) return Map.of();
        return jdbc.query("""
                SELECT user_id, sum(amount) AS amount FROM (
                    SELECT user_id, amount FROM wallet_entries WHERE bucket = 'CASH' AND user_id IN (:ids)
                    UNION ALL
                    SELECT user_id, remaining AS amount FROM wallet_promo_lots WHERE expires_at > now() AND user_id IN (:ids)
                ) ledger GROUP BY user_id
                """, Map.of("ids", ids), rs -> {
            Map<UUID, BigDecimal> balances = new HashMap<>();
            while (rs.next()) balances.put(rs.getObject("user_id", UUID.class), rs.getBigDecimal("amount"));
            return balances;
        });
    }

    @GetMapping("/reporting/revenue")
    @Transactional(readOnly = true, isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public RevenueReport revenue(@RequestParam int days,
                                  @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime asOf) {
        if (days != 30 && days != 60 && days != 90) {
            throw ApiException.badRequest("INVALID_REPORT_PERIOD", "Kỳ báo cáo không hợp lệ");
        }
        OffsetDateTime start = asOf.minusDays(days);
        var params = Map.of("start", start, "previous", start.minusDays(days), "end", asOf);
        String current = " WHERE kind = 'SESSION' AND status IN " + CAPTURED + " AND created_at >= :start AND created_at < :end";
        RevenueReport totals = jdbc.queryForObject("""
                SELECT coalesce(sum(t.amount) FILTER (WHERE t.created_at >= :start), 0) AS gmv,
                       coalesce(sum(CASE WHEN t.amount > 0 THEN round(t.fee * (t.amount - coalesce(r.refunded, 0)) / t.amount, 0)
                                         ELSE t.fee END) FILTER (WHERE t.created_at >= :start), 0) AS fees,
                       count(*) FILTER (WHERE t.created_at >= :start) AS current_count,
                       count(*) FILTER (WHERE t.created_at < :start) AS previous_count,
                       count(*) FILTER (WHERE t.created_at >= :start AND r.refunded > 0) AS current_refunds,
                       count(*) FILTER (WHERE t.created_at < :start AND r.refunded > 0) AS previous_refunds
                  FROM transactions t
                  LEFT JOIN LATERAL (
                      SELECT sum(amount) AS refunded FROM refunds WHERE transaction_id = t.id AND created_at < :end
                  ) r ON true
                 WHERE t.kind = 'SESSION' AND t.status IN %s AND t.created_at >= :previous AND t.created_at < :end
                """.formatted(CAPTURED), params, (rs, row) -> {
            BigDecimal gmv = rs.getBigDecimal("gmv");
            BigDecimal fees = rs.getBigDecimal("fees");
            BigDecimal refundPercent = percent(rs.getBigDecimal("current_refunds"), rs.getBigDecimal("current_count"));
            BigDecimal previousRefundPercent = percent(rs.getBigDecimal("previous_refunds"), rs.getBigDecimal("previous_count"));
            return new RevenueReport(new PlatformRevenue(fees, gmv, percent(fees, gmv)),
                    new RefundRate(refundPercent, refundPercent.subtract(previousRefundPercent)), List.of(), List.of());
        });
        Map<Integer, BigDecimal> weekly = jdbc.query("""
                SELECT floor(extract(epoch FROM created_at - CAST(:start AS timestamptz)) / 604800)::int AS week,
                       sum(amount) AS amount FROM transactions
                """ + current + " GROUP BY week", params, rs -> {
            Map<Integer, BigDecimal> amounts = new HashMap<>();
            while (rs.next()) amounts.put(rs.getInt("week"), rs.getBigDecimal("amount"));
            return amounts;
        });
        List<GmvPoint> gmv = IntStream.range(0, (days + 6) / 7)
                .mapToObj(i -> new GmvPoint("Tuần " + (i + 1), weekly.getOrDefault(i, BigDecimal.ZERO))).toList();
        List<MentorGmv> topMentors = jdbc.query("""
                SELECT mentor_id, count(DISTINCT session_id) AS sessions, sum(amount) AS gmv FROM transactions
                """ + current + " GROUP BY mentor_id ORDER BY gmv DESC, mentor_id LIMIT 3", params,
                (rs, row) -> new MentorGmv(rs.getObject("mentor_id", UUID.class), rs.getLong("sessions"), rs.getBigDecimal("gmv")));
        return new RevenueReport(totals.platformRevenue(), totals.refundRate(), gmv, topMentors);
    }

    private static BigDecimal percent(BigDecimal numerator, BigDecimal denominator) {
        if (denominator.signum() == 0) return BigDecimal.ZERO;
        return numerator.movePointRight(2).divide(denominator, 1, RoundingMode.HALF_UP);
    }
}
