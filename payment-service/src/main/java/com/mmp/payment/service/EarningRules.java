package com.mmp.payment.service;

import com.mmp.payment.entity.LedgerEntry;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Collection;
import java.util.Set;

/**
 * US-25 — quy tắc sổ thu nhập mentor dạng hàm thuần.
 *
 * <p>Số dư của 1 giao dịch từ các dòng sổ (P = EARNING_PENDING, A = EARNING_AVAILABLE, R = REVERSAL, O = PAYOUT):
 * <ul>
 *   <li>pending   = max(P − R − A, 0) — phần chưa được giải phóng</li>
 *   <li>available = A − O − max(R + A − P, 0) — đã giải phóng, chưa chi trả; hoàn tiền xảy ra SAU khi đã giải phóng
 *       (tranh chấp mở muộn) thì phần thu hồi trừ vào available</li>
 *   <li>paidOut   = O</li>
 * </ul>
 */
public final class EarningRules {

    /** Trạng thái cuối của phiên mà thu nhập được giải phóng (sau 48 giờ). CANCELLED = mentee huỷ muộn (hoàn 0%). */
    public static final Set<String> RELEASABLE_STATES = Set.of("COMPLETED", "NO_SHOW_MENTEE", "CANCELLED");

    private EarningRules() {
    }

    public record Balance(BigDecimal earned, BigDecimal pending, BigDecimal available, BigDecimal paidOut, BigDecimal reversed) {

        public static final Balance ZERO = new Balance(BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO);

        public Balance plus(Balance o) {
            return new Balance(earned.add(o.earned), pending.add(o.pending), available.add(o.available),
                    paidOut.add(o.paidOut), reversed.add(o.reversed));
        }
    }

    public static Balance balance(Collection<LedgerEntry> entries) {
        BigDecimal p = sum(entries, LedgerEntry.Type.EARNING_PENDING);
        BigDecimal a = sum(entries, LedgerEntry.Type.EARNING_AVAILABLE);
        BigDecimal r = sum(entries, LedgerEntry.Type.REVERSAL);
        BigDecimal o = sum(entries, LedgerEntry.Type.PAYOUT);
        BigDecimal pending = p.subtract(r).subtract(a).max(BigDecimal.ZERO);
        BigDecimal clawedFromAvailable = r.add(a).subtract(p).max(BigDecimal.ZERO);
        BigDecimal available = a.subtract(o).subtract(clawedFromAvailable).max(BigDecimal.ZERO);
        return new Balance(p, pending, available, o, r);
    }

    private static BigDecimal sum(Collection<LedgerEntry> entries, LedgerEntry.Type type) {
        return entries.stream().filter(e -> e.getType() == type).map(LedgerEntry::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /**
     * Phần thu nhập thu hồi khi hoàn {@code refund} trên giao dịch {@code amount} đã hoàn trước đó {@code refundedBefore}:
     * earning × refund / amount, làm tròn LUỸ KẾ tới 1đ (round(E·(before+refund)/A) − round(E·before/A)) nên khi đã hoàn
     * đủ amount thì tổng thu hồi đúng bằng earning — không lệch 1đ.
     */
    public static BigDecimal reversal(BigDecimal earning, BigDecimal amount, BigDecimal refundedBefore, BigDecimal refund) {
        if (earning == null || earning.signum() <= 0 || amount == null || amount.signum() <= 0) return BigDecimal.ZERO;
        BigDecimal after = share(earning, amount, refundedBefore.add(refund));
        BigDecimal before = share(earning, amount, refundedBefore);
        return after.subtract(before).max(BigDecimal.ZERO);
    }

    private static BigDecimal share(BigDecimal earning, BigDecimal amount, BigDecimal refunded) {
        return earning.multiply(refunded.min(amount)).divide(amount, 0, RoundingMode.HALF_UP);
    }

    public static boolean releasableState(String state) {
        return state != null && RELEASABLE_STATES.contains(state);
    }
}
