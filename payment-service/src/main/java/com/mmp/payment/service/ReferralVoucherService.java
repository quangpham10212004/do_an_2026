package com.mmp.payment.service;

import com.mmp.payment.exception.ApiException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
public class ReferralVoucherService {

    private static final BigDecimal MIN_ORDER = new BigDecimal("150000");
    private final JdbcTemplate jdbc;
    private final BigDecimal reward;
    private final Duration pending;

    public ReferralVoucherService(JdbcTemplate jdbc,
                                  @Value("${app.referral.reward-amount:30000}") BigDecimal reward,
                                  @Value("${app.referral.pending:P7D}") Duration pending) {
        this.jdbc = jdbc;
        this.reward = reward;
        this.pending = pending;
    }

    public record Voucher(UUID id, String code, BigDecimal amount, BigDecimal minOrder, String status, String title,
                          OffsetDateTime expiresAt, OffsetDateTime releaseAt, OffsetDateTime usedAt, String usedNote) {}
    public record Quote(UUID voucherId, BigDecimal tuition, BigDecimal discount, BigDecimal payable, String reason) {}

    private static final String ROWS = """
            SELECT id, code, amount, expires_at, used_at,
              CASE WHEN used_at IS NOT NULL THEN 'USED'
                   WHEN expires_at <= now() THEN 'EXPIRED' ELSE 'ACTIVE' END AS status
              FROM referral_vouchers
            """;
    private static final RowMapper<Voucher> VIEW = (rs, i) -> new Voucher(rs.getObject("id", UUID.class),
            rs.getString("code"), rs.getBigDecimal("amount"), MIN_ORDER, rs.getString("status"),
            "Thưởng giới thiệu bạn", rs.getObject("expires_at", OffsetDateTime.class), null,
            rs.getObject("used_at", OffsetDateTime.class), rs.getObject("used_at") == null ? null : "Đã dùng để trả học phí");

    public List<Voucher> list(UUID ownerId) {
        List<Voucher> vouchers = new ArrayList<>(
                jdbc.query(ROWS + "WHERE owner_id = ? ORDER BY expires_at DESC, id", VIEW, ownerId));
        vouchers.addAll(jdbc.query("""
                SELECT r.id, es.ended_at
                FROM mentor_referrals r JOIN transactions t ON t.session_id = r.session_id
                JOIN earning_schedules es ON es.transaction_id = t.id
                WHERE r.owner_id = ? AND r.status = 'REGISTERED' AND t.kind = 'SESSION'
                  AND t.status = 'SUCCESS' AND es.final_state = 'COMPLETED' AND es.ended_at IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM refunds rf WHERE rf.transaction_id = t.id)
                ORDER BY es.ended_at DESC, r.id
                """, (rs, i) -> new Voucher(rs.getObject("id", UUID.class), "", reward, MIN_ORDER, "PENDING",
                "Thưởng giới thiệu bạn", null, rs.getObject("ended_at", OffsetDateTime.class).plus(pending), null, null),
                ownerId));
        return vouchers;
    }

    public Quote quote(UUID ownerId, UUID id, String code, BigDecimal tuition) {
        if ((id == null) == (code == null || code.isBlank())) {
            throw ApiException.badRequest("VOUCHER_IDENTIFIER_REQUIRED", "Hãy chọn voucher hoặc nhập một mã");
        }
        String normalizedCode = code == null ? null : code.strip().toUpperCase(Locale.ROOT);
        List<Voucher> found = id != null
                ? jdbc.query(ROWS + "WHERE owner_id = ? AND id = ?", VIEW, ownerId, id)
                : jdbc.query(ROWS + "WHERE owner_id = ? AND code = ?", VIEW, ownerId, normalizedCode);
        return calculate(found.isEmpty() ? null : found.getFirst(), tuition);
    }

    /** Gọi trong transaction trả học phí sau khi khoá ví. Tiền voucher được giữ dưới dạng khuyến mãi. */
    public BigDecimal redeem(UUID ownerId, UUID id, UUID sessionId, BigDecimal tuition, OffsetDateTime now) {
        List<Voucher> found = jdbc.query(ROWS + "WHERE owner_id = ? AND id = ? FOR UPDATE", VIEW, ownerId, id);
        Quote quote = calculate(found.isEmpty() ? null : found.getFirst(), tuition);
        if (quote.reason() != null) throw ApiException.conflict("VOUCHER_UNAVAILABLE", quote.reason());
        jdbc.update("UPDATE referral_vouchers SET used_at = ?, used_session_id = ? WHERE id = ?", now, sessionId, id);
        return quote.discount();
    }

    private static Quote calculate(Voucher voucher, BigDecimal tuition) {
        String reason = voucher == null ? "Mã không tồn tại hoặc không thuộc tài khoản của bạn."
                : switch (voucher.status()) {
                    case "USED" -> "Mã này đã được dùng.";
                    case "EXPIRED" -> "Mã đã hết hạn.";
                    default -> tuition.compareTo(MIN_ORDER) < 0 ? "Chỉ áp dụng cho phiên từ 150.000 đ." : null;
                };
        BigDecimal discount = reason == null ? voucher.amount().min(tuition) : BigDecimal.ZERO;
        return new Quote(voucher == null ? null : voucher.id(), tuition, discount, tuition.subtract(discount), reason);
    }
}
