package com.mmp.mentoring.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Quy tắc giá và hoàn tiền của gói buổi (hàm thuần).
 *
 * <p>Giá một buổi trong gói = giá buổi lẻ × (100 − giảm giá)%, làm tròn tới 1.000đ. Hoàn tiền khi gói hết hạn
 * hoặc bị huỷ = giá một buổi trong gói × số buổi chưa dùng, trừ phí giữ lại (mặc định 0%).</p>
 */
public final class PackageRules {

    /** Một mức gói: số buổi và phần trăm giảm giá. */
    public record Tier(int sessions, int discountPercent) {
    }

    private PackageRules() {
    }

    /** Đọc cấu hình dạng {@code "4:10,8:15"} (số buổi:phần trăm giảm), trả về danh sách tăng dần theo số buổi. */
    public static List<Tier> parseTiers(String spec) {
        List<Tier> tiers = new ArrayList<>();
        if (spec == null || spec.isBlank()) return tiers;
        for (String part : spec.split(",")) {
            String p = part.trim();
            if (p.isEmpty()) continue;
            String[] kv = p.split(":");
            if (kv.length != 2) throw new IllegalArgumentException("Mức gói không hợp lệ: " + p);
            int sessions = Integer.parseInt(kv[0].trim());
            int discount = Integer.parseInt(kv[1].trim());
            if (sessions < 2 || sessions > 50) throw new IllegalArgumentException("Số buổi phải từ 2 đến 50: " + p);
            if (discount < 0 || discount > 90) throw new IllegalArgumentException("Giảm giá phải từ 0 đến 90%: " + p);
            tiers.add(new Tier(sessions, discount));
        }
        tiers.sort(Comparator.comparingInt(Tier::sessions));
        return tiers;
    }

    /** Giá một buổi trong gói. {@code singlePrice} là giá buổi lẻ cùng thời lượng. */
    public static BigDecimal unitPrice(BigDecimal singlePrice, int discountPercent) {
        if (singlePrice == null || singlePrice.signum() <= 0) return BigDecimal.ZERO;
        return singlePrice.multiply(BigDecimal.valueOf(100 - discountPercent))
                .divide(BigDecimal.valueOf(100L * 1000), 0, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(1000L));
    }

    public static BigDecimal totalPrice(BigDecimal unitPrice, int sessions) {
        return unitPrice.multiply(BigDecimal.valueOf(sessions));
    }

    /** Số tiền hoàn lại cho các buổi chưa dùng (đã trừ phí giữ lại), làm tròn tới 1đ. */
    public static BigDecimal refundAmount(BigDecimal unitPrice, int remainingSessions, int feePercent) {
        if (remainingSessions <= 0 || unitPrice == null || unitPrice.signum() <= 0) return BigDecimal.ZERO;
        return unitPrice.multiply(BigDecimal.valueOf(remainingSessions))
                .multiply(BigDecimal.valueOf(100 - feePercent))
                .divide(BigDecimal.valueOf(100), 0, RoundingMode.HALF_UP);
    }

    /** Tiết kiệm được so với mua lẻ cùng số buổi. */
    public static BigDecimal savings(BigDecimal singlePrice, BigDecimal totalPrice, int sessions) {
        return singlePrice.multiply(BigDecimal.valueOf(sessions)).subtract(totalPrice);
    }
}
