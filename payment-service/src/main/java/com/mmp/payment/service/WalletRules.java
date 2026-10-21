package com.mmp.payment.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Optional;

/**
 * Bản chốt v2.0 §8 — quy tắc ví dạng hàm thuần (không DB/mạng) để unit test. Tiền VND nguyên (làm tròn tới 1đ).
 * <ul>
 *   <li>Trả học phí: trừ tiền khuyến mãi trước, thiếu thì trừ tiền nạp.</li>
 *   <li>Hoàn tiền buổi học: chia lại theo đúng tỉ lệ nguồn đã trừ (luỹ kế, tổng không vượt phần đã trừ).</li>
 *   <li>Hoàn tiền nạp về nguồn: trong cửa sổ 7 ngày kể từ lần nạp gần nhất, tối đa = min(tiền nạp khả dụng,
 *       tổng tiền nạp còn hoàn được trong 7 ngày).</li>
 * </ul>
 */
public final class WalletRules {

    private WalletRules() {
    }

    /** Học phí được lấy bao nhiêu từ khuyến mãi / tiền nạp. */
    public record Allocation(BigDecimal promo, BigDecimal cash) {
    }

    /** Trừ khuyến mãi trước; empty = không đủ tiền (tổng khả dụng &lt; price). */
    public static Optional<Allocation> allocate(BigDecimal price, BigDecimal promoAvailable, BigDecimal cashAvailable) {
        BigDecimal p = nz(price), promo = nz(promoAvailable).max(BigDecimal.ZERO), cash = nz(cashAvailable).max(BigDecimal.ZERO);
        if (p.signum() <= 0) return Optional.empty();
        if (promo.add(cash).compareTo(p) < 0) return Optional.empty();
        BigDecimal fromPromo = promo.min(p);
        return Optional.of(new Allocation(fromPromo, p.subtract(fromPromo)));
    }

    /**
     * Phần khuyến mãi của lần hoàn thứ n: luỹ kế (cumulativeRefund × paidPromo / paidTotal) làm tròn xuống trừ phần
     * khuyến mãi đã hoàn trước đó. Phần còn lại của lần hoàn thuộc tiền nạp. Tổng hoàn toàn bộ = đúng paidPromo.
     */
    public static BigDecimal promoShareOfRefund(BigDecimal cumulativeRefund, BigDecimal paidPromo, BigDecimal paidTotal,
                                                BigDecimal promoRefundedBefore) {
        if (nz(paidTotal).signum() <= 0 || nz(paidPromo).signum() <= 0) return BigDecimal.ZERO;
        BigDecimal cumulativePromo = nz(cumulativeRefund).multiply(paidPromo).divide(paidTotal, 0, RoundingMode.DOWN);
        BigDecimal now = cumulativePromo.subtract(nz(promoRefundedBefore));
        return now.max(BigDecimal.ZERO).min(paidPromo.subtract(nz(promoRefundedBefore)));
    }

    /** Lần nạp hợp lệ: [min, max] và tiền nạp khả dụng sau khi nạp không vượt trần. */
    public static Optional<String> validateTopup(BigDecimal amount, BigDecimal min, BigDecimal max, BigDecimal cashAvailable,
                                                 BigDecimal cashCap) {
        BigDecimal a = nz(amount);
        if (a.signum() <= 0 || a.compareTo(min) < 0 || a.compareTo(max) > 0) return Optional.of("INVALID_TOPUP_AMOUNT");
        if (a.stripTrailingZeros().scale() > 0) return Optional.of("INVALID_TOPUP_AMOUNT");
        if (nz(cashAvailable).add(a).compareTo(cashCap) > 0) return Optional.of("CASH_CAP_EXCEEDED");
        return Optional.empty();
    }

    /** Cửa sổ hoàn tiền nạp còn mở: lần nạp gần nhất cách hiện tại ≤ window. */
    public static boolean refundWindowOpen(OffsetDateTime latestTopupAt, OffsetDateTime now, Duration window) {
        return latestTopupAt != null && !latestTopupAt.plus(window).isBefore(now);
    }

    /** Mức hoàn tiền nạp tối đa = min(tiền nạp khả dụng, tổng tiền nạp còn hoàn được trong cửa sổ). Không âm. */
    public static BigDecimal maxTopupRefund(BigDecimal cashAvailable, BigDecimal refundableTopupsInWindow) {
        return nz(cashAvailable).max(BigDecimal.ZERO).min(nz(refundableTopupsInWindow).max(BigDecimal.ZERO));
    }

    /** Mốc ví chuyển DORMANT: không hoạt động quá dormantAfterMonths tháng. */
    public static boolean isDormant(OffsetDateTime lastActivityAt, OffsetDateTime now, int dormantAfterMonths) {
        return lastActivityAt != null && lastActivityAt.plusMonths(dormantAfterMonths).isBefore(now);
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }
}
