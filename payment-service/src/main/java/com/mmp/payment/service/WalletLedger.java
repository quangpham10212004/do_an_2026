package com.mmp.payment.service;

import com.mmp.payment.entity.Refund;
import com.mmp.payment.entity.Transaction;
import com.mmp.payment.exception.ApiException;
import com.mmp.payment.service.WalletRules.Allocation;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Bản chốt v2.0 §8 — sổ cái ví (V7__wallet.sql). Mọi phương thức ghi PHẢI chạy trong một transaction của bên gọi
 * (TransactionTemplate); lớp này không mở transaction riêng để tiền của buổi học, hoàn tiền và bút toán ví cùng commit
 * hoặc cùng rollback.
 *
 * <ul>
 *   <li>Tiền nạp (CASH): số dư = SUM(wallet_entries.amount); không có cột số dư.</li>
 *   <li>Khuyến mãi (PROMO): theo lô có hạn, dùng lô sắp hết hạn trước; số dư = SUM(remaining) của lô còn hạn.</li>
 *   <li>Idempotency: mỗi bút toán có khoá duy nhất (vd. {@code topup:<txId>}, {@code hold:<txId>:CASH}) nên IPN lặp / retry
 *       không ghi trùng.</li>
 * </ul>
 */
@Component
public class WalletLedger {

    public record WalletRow(UUID userId, String status, OffsetDateTime lastActivityAt) {
    }

    public record EntryView(UUID id, String kind, String bucket, BigDecimal amount, UUID sessionId, UUID transactionId,
                            String note, OffsetDateTime createdAt) {
    }

    private final JdbcTemplate jdbc;
    private final int promoExpiryMonths;
    private final int restoredPromoDays;

    public WalletLedger(JdbcTemplate jdbc,
                        @Value("${app.wallet.promo-expiry-months:12}") int promoExpiryMonths,
                        @Value("${app.wallet.restored-promo-days:30}") int restoredPromoDays) {
        this.jdbc = jdbc;
        this.promoExpiryMonths = promoExpiryMonths;
        this.restoredPromoDays = restoredPromoDays;
    }

    // ---------------------------------------------------------------- đọc

    /** Tạo ví nếu chưa có và khoá dòng ví (SELECT … FOR UPDATE) để các thao tác tiền của một người chạy tuần tự. */
    public WalletRow lock(UUID userId) {
        jdbc.update("INSERT INTO wallets (user_id) VALUES (?) ON CONFLICT (user_id) DO NOTHING", userId);
        return jdbc.queryForObject("SELECT user_id, status, last_activity_at FROM wallets WHERE user_id = ? FOR UPDATE",
                (rs, i) -> new WalletRow(rs.getObject("user_id", UUID.class), rs.getString("status"),
                        rs.getObject("last_activity_at", OffsetDateTime.class)), userId);
    }

    public WalletRow find(UUID userId) {
        List<WalletRow> rows = jdbc.query("SELECT user_id, status, last_activity_at FROM wallets WHERE user_id = ?",
                (rs, i) -> new WalletRow(rs.getObject("user_id", UUID.class), rs.getString("status"),
                        rs.getObject("last_activity_at", OffsetDateTime.class)), userId);
        return rows.isEmpty() ? new WalletRow(userId, "ACTIVE", null) : rows.get(0);
    }

    public BigDecimal cash(UUID userId) {
        return jdbc.queryForObject("SELECT COALESCE(SUM(amount), 0) FROM wallet_entries WHERE user_id = ? AND bucket = 'CASH'",
                BigDecimal.class, userId);
    }

    public BigDecimal promo(UUID userId, OffsetDateTime now) {
        return jdbc.queryForObject("SELECT COALESCE(SUM(remaining), 0) FROM wallet_promo_lots WHERE user_id = ? AND expires_at > ?",
                BigDecimal.class, userId, now);
    }

    public OffsetDateTime nextPromoExpiry(UUID userId, OffsetDateTime now) {
        List<OffsetDateTime> r = jdbc.queryForList(
                "SELECT MIN(expires_at) FROM wallet_promo_lots WHERE user_id = ? AND remaining > 0 AND expires_at > ?",
                OffsetDateTime.class, userId, now);
        return r.isEmpty() ? null : r.get(0);
    }

    /** Học phí đang tạm giữ: giao dịch trả bằng ví, đã thu tiền, phiên chưa có trạng thái cuối (net sau hoàn tiền). */
    public BigDecimal held(UUID userId) {
        return jdbc.queryForObject("""
                SELECT COALESCE(SUM(t.amount - COALESCE((SELECT SUM(r.amount) FROM refunds r WHERE r.transaction_id = t.id), 0)), 0)
                  FROM transactions t
                  LEFT JOIN earning_schedules es ON es.transaction_id = t.id
                 WHERE t.payer_id = ? AND t.provider = 'WALLET' AND t.kind = 'SESSION'
                   AND t.status IN ('SUCCESS', 'ON_HOLD', 'PARTIALLY_REFUNDED') AND es.transaction_id IS NULL
                """, BigDecimal.class, userId);
    }

    public List<EntryView> entries(UUID userId, int page, int size) {
        return jdbc.query("""
                SELECT id, kind, bucket, amount, session_id, transaction_id, note, created_at
                  FROM wallet_entries WHERE user_id = ? ORDER BY created_at DESC, id LIMIT ? OFFSET ?
                """, (rs, i) -> new EntryView(rs.getObject("id", UUID.class), rs.getString("kind"), rs.getString("bucket"),
                rs.getBigDecimal("amount"), rs.getObject("session_id", UUID.class), rs.getObject("transaction_id", UUID.class),
                rs.getString("note"), rs.getObject("created_at", OffsetDateTime.class)), userId, size, (long) page * size);
    }

    public long countEntries(UUID userId) {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM wallet_entries WHERE user_id = ?", Long.class, userId);
        return n == null ? 0 : n;
    }

    // ---------------------------------------------------------------- ghi

    public void touch(UUID userId) {
        jdbc.update("UPDATE wallets SET last_activity_at = now(), dormant_notified_at = NULL WHERE user_id = ?", userId);
    }

    /** Nạp ví thành công (giao dịch kind = TOPUP đã SUCCESS). Idempotent theo mã giao dịch. */
    public void creditTopup(Transaction t) {
        lock(t.getPayerId());
        insert(t.getPayerId(), "TOPUP", "CASH", t.getAmount(), null, t.getId(), null, "topup:" + t.getId(), "Nạp ví");
        touch(t.getPayerId());
    }

    /** Hoàn tiền nạp về nguồn thanh toán: trừ tiền nạp khả dụng. */
    public void debitTopupRefund(UUID userId, BigDecimal amount, UUID topupTransactionId, UUID requestId, String note) {
        insert(userId, "TOPUP_REFUND", "CASH", amount.negate(), null, topupTransactionId, null,
                "topup-refund:" + requestId + ":" + topupTransactionId, note);
        touch(userId);
    }

    /**
     * Trả học phí từ ví: trừ khuyến mãi trước (lô sắp hết hạn trước), thiếu thì trừ tiền nạp. Gọi sau {@link #lock}.
     * Ném 402 INSUFFICIENT_FUNDS nếu không đủ.
     */
    public Allocation debitForSession(UUID userId, UUID transactionId, UUID sessionId, BigDecimal price, OffsetDateTime now) {
        BigDecimal promoAvail = promo(userId, now);
        BigDecimal cashAvail = cash(userId);
        Allocation a = WalletRules.allocate(price, promoAvail, cashAvail).orElseThrow(() ->
                new ApiException(HttpStatus.PAYMENT_REQUIRED, "INSUFFICIENT_FUNDS",
                        "Số dư ví không đủ (cần " + price.toPlainString() + "đ, có " + promoAvail.add(cashAvail).toPlainString() + "đ)"));
        BigDecimal left = a.promo();
        if (left.signum() > 0) {
            List<Map<String, Object>> lots = jdbc.queryForList(
                    "SELECT id, remaining FROM wallet_promo_lots WHERE user_id = ? AND remaining > 0 AND expires_at > ? "
                            + "ORDER BY expires_at, created_at FOR UPDATE", userId, now);
            for (Map<String, Object> lot : lots) {
                if (left.signum() <= 0) break;
                UUID lotId = (UUID) lot.get("id");
                BigDecimal take = ((BigDecimal) lot.get("remaining")).min(left);
                jdbc.update("UPDATE wallet_promo_lots SET remaining = remaining - ? WHERE id = ?", take, lotId);
                jdbc.update("INSERT INTO wallet_allocations (transaction_id, lot_id, amount) VALUES (?, ?, ?) "
                        + "ON CONFLICT (transaction_id, lot_id) DO UPDATE SET amount = wallet_allocations.amount + EXCLUDED.amount",
                        transactionId, lotId, take);
                insert(userId, "HOLD", "PROMO", take.negate(), sessionId, transactionId, lotId,
                        "hold:" + transactionId + ":PROMO:" + lotId, "Trả học phí (khuyến mãi)");
                left = left.subtract(take);
            }
        }
        if (a.cash().signum() > 0) {
            insert(userId, "HOLD", "CASH", a.cash().negate(), sessionId, transactionId, null,
                    "hold:" + transactionId + ":CASH", "Trả học phí");
        }
        touch(userId);
        return a;
    }

    /**
     * Hoàn tiền buổi học về ví đúng nguồn đã trừ. {@code alreadyRefunded} = tổng đã hoàn trước lần này của giao dịch.
     * Khuyến mãi về lại lô cũ nếu còn hạn, hết hạn rồi thì cấp lô mới hạn {@code restored-promo-days} ngày.
     */
    public void refundSession(Transaction t, Refund refund, BigDecimal alreadyRefunded, OffsetDateTime now) {
        UUID userId = t.getPayerId();
        lock(userId);
        BigDecimal promoBefore = jdbc.queryForObject("SELECT COALESCE(SUM(refunded), 0) FROM wallet_allocations WHERE transaction_id = ?",
                BigDecimal.class, t.getId());
        BigDecimal cumulative = alreadyRefunded.add(refund.getAmount());
        BigDecimal promoShare = WalletRules.promoShareOfRefund(cumulative, t.getPaidPromo(), t.getAmount(), promoBefore);
        BigDecimal cashShare = refund.getAmount().subtract(promoShare);
        BigDecimal left = promoShare;
        if (left.signum() > 0) {
            List<Map<String, Object>> allocs = jdbc.queryForList("""
                    SELECT a.lot_id, a.amount, a.refunded, (l.expires_at > ?) AS alive FROM wallet_allocations a
                      JOIN wallet_promo_lots l ON l.id = a.lot_id
                     WHERE a.transaction_id = ? AND a.refunded < a.amount ORDER BY l.expires_at DESC FOR UPDATE OF a, l
                    """, now, t.getId());
            for (Map<String, Object> al : allocs) {
                if (left.signum() <= 0) break;
                UUID lotId = (UUID) al.get("lot_id");
                BigDecimal give = ((BigDecimal) al.get("amount")).subtract((BigDecimal) al.get("refunded")).min(left);
                jdbc.update("UPDATE wallet_allocations SET refunded = refunded + ? WHERE transaction_id = ? AND lot_id = ?",
                        give, t.getId(), lotId);
                if (Boolean.TRUE.equals(al.get("alive"))) {
                    jdbc.update("UPDATE wallet_promo_lots SET remaining = remaining + ? WHERE id = ?", give, lotId);
                    insert(userId, "REFUND_TO_WALLET", "PROMO", give, t.getSessionId(), t.getId(), lotId,
                            "refund:" + refund.getId() + ":PROMO:" + lotId, "Hoàn học phí (khuyến mãi)");
                } else {
                    UUID restored = newLot(userId, give, "REFUND_RESTORE", refund.getId() + ":" + lotId, now.plusDays(restoredPromoDays));
                    insert(userId, "REFUND_TO_WALLET", "PROMO", give, t.getSessionId(), t.getId(), restored,
                            "refund:" + refund.getId() + ":PROMO:" + restored, "Hoàn học phí (khuyến mãi đã hết hạn, cấp lại hạn mới)");
                }
                left = left.subtract(give);
            }
            if (left.signum() > 0) cashShare = cashShare.add(left); // không còn lô để hoàn → về tiền nạp (không mất tiền)
        }
        if (cashShare.signum() > 0) {
            insert(userId, "REFUND_TO_WALLET", "CASH", cashShare, t.getSessionId(), t.getId(), null,
                    "refund:" + refund.getId() + ":CASH", "Hoàn học phí");
        }
        touch(userId);
    }

    /** Cấp khuyến mãi (thưởng giới thiệu, admin). {@code ref} khác null → idempotent theo (user, reason, ref). */
    public UUID grantPromo(UUID userId, BigDecimal amount, String reason, String ref, OffsetDateTime now) {
        lock(userId);
        if (ref != null) {
            List<UUID> existing = jdbc.queryForList("SELECT id FROM wallet_promo_lots WHERE user_id = ? AND reason = ? AND ref = ?",
                    UUID.class, userId, reason, ref);
            if (!existing.isEmpty()) return existing.get(0);
        }
        UUID lot = newLot(userId, amount, reason, ref, now.plusMonths(promoExpiryMonths));
        insert(userId, "PROMO_GRANT", "PROMO", amount, null, null, lot, "promo-grant:" + lot, reason);
        touch(userId);
        return lot;
    }

    /** Job hằng ngày: lô khuyến mãi quá hạn còn dư bị trừ khỏi ví. Trả về số lô đã hết hạn. */
    public int expirePromo(OffsetDateTime now) {
        List<Map<String, Object>> lots = jdbc.queryForList(
                "SELECT id, user_id, remaining FROM wallet_promo_lots WHERE remaining > 0 AND expires_at <= ? FOR UPDATE SKIP LOCKED", now);
        for (Map<String, Object> lot : lots) {
            UUID lotId = (UUID) lot.get("id");
            UUID userId = (UUID) lot.get("user_id");
            BigDecimal remaining = (BigDecimal) lot.get("remaining");
            insert(userId, "PROMO_EXPIRE", "PROMO", remaining.negate(), null, null, lotId, "promo-expire:" + lotId, "Khuyến mãi hết hạn");
            jdbc.update("UPDATE wallet_promo_lots SET remaining = 0 WHERE id = ?", lotId);
        }
        return lots.size();
    }

    public void setStatus(UUID userId, String status) {
        lock(userId);
        jdbc.update("UPDATE wallets SET status = ? WHERE user_id = ?", status, userId);
    }

    private UUID newLot(UUID userId, BigDecimal amount, String reason, String ref, OffsetDateTime expiresAt) {
        return jdbc.queryForObject("INSERT INTO wallet_promo_lots (user_id, granted, remaining, expires_at, reason, ref) "
                + "VALUES (?, ?, ?, ?, ?, ?) RETURNING id", UUID.class, userId, amount, amount, expiresAt, reason, ref);
    }

    private void insert(UUID userId, String kind, String bucket, BigDecimal amount, UUID sessionId, UUID transactionId, UUID lotId,
                        String key, String note) {
        if (amount.signum() == 0) return;
        jdbc.update("INSERT INTO wallet_entries (user_id, kind, bucket, amount, session_id, transaction_id, lot_id, idempotency_key, note) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (idempotency_key) DO NOTHING",
                userId, kind, bucket, amount, sessionId, transactionId, lotId, key, note);
    }

    /** Danh sách ID người dùng — dùng cho job. */
    public List<UUID> usersWithEntriesInactiveSince(OffsetDateTime before) {
        return new ArrayList<>(jdbc.queryForList(
                "SELECT user_id FROM wallets WHERE status = 'ACTIVE' AND last_activity_at < ?", UUID.class, before));
    }
}
