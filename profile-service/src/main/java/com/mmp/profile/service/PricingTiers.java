package com.mmp.profile.service;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

/**
 * Bản chốt v2.0 §3–4 — cấp độ mentor và khung giá (hàm thuần, không I/O).
 *
 * <ul>
 *   <li>JUNIOR 100.000–200.000, SENIOR 200.000–400.000, EXPERT 400.000–700.000 đ / buổi 60 phút, bước 10.000.</li>
 *   <li>Điểm phỏng vấn AI 0–100: &lt; 60 không đạt, 60–74 JUNIOR, 75–87 SENIOR, ≥ 88 EXPERT.</li>
 * </ul>
 * Ngưỡng và khung đọc được từ biến môi trường ({@code PRICING_*}, {@code TIER_*}); mặc định là giá trị bản chốt.
 */
public final class PricingTiers {

    public enum Tier { JUNIOR, SENIOR, EXPERT }

    public record Band(Tier tier, long min, long max) {
    }

    private final List<Band> bands;
    private final long step;
    private final int seniorFrom;
    private final int expertFrom;
    private final int passFrom;

    public PricingTiers(List<Band> bands, long step, int passFrom, int seniorFrom, int expertFrom) {
        this.bands = List.copyOf(bands);
        this.step = step;
        this.passFrom = passFrom;
        this.seniorFrom = seniorFrom;
        this.expertFrom = expertFrom;
    }

    public static PricingTiers defaults() {
        return new PricingTiers(List.of(
                new Band(Tier.JUNIOR, 100_000, 200_000),
                new Band(Tier.SENIOR, 200_000, 400_000),
                new Band(Tier.EXPERT, 400_000, 700_000)), 10_000, 60, 75, 88);
    }

    /** Mặc định bản chốt, ghi đè được bằng biến môi trường (PRICING_JUNIOR_MIN, TIER_SENIOR_FROM…). */
    public static PricingTiers fromEnv() {
        PricingTiers d = defaults();
        return new PricingTiers(List.of(
                new Band(Tier.JUNIOR, env("PRICING_JUNIOR_MIN", 100_000), env("PRICING_JUNIOR_MAX", 200_000)),
                new Band(Tier.SENIOR, env("PRICING_SENIOR_MIN", 200_000), env("PRICING_SENIOR_MAX", 400_000)),
                new Band(Tier.EXPERT, env("PRICING_EXPERT_MIN", 400_000), env("PRICING_EXPERT_MAX", 700_000))),
                env("PRICING_STEP", d.step), (int) env("TIER_PASS_FROM", d.passFrom),
                (int) env("TIER_SENIOR_FROM", d.seniorFrom), (int) env("TIER_EXPERT_FROM", d.expertFrom));
    }

    private static long env(String name, long fallback) {
        String v = System.getenv(name);
        if (v == null || v.isBlank()) return fallback;
        try {
            return Long.parseLong(v.trim());
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    public List<Band> bands() {
        return bands;
    }

    public long step() {
        return step;
    }

    public Band band(Tier tier) {
        return bands.stream().filter(b -> b.tier() == tier).findFirst().orElseThrow();
    }

    /** Cấp được đề xuất từ điểm phỏng vấn; empty = không đạt. */
    public Optional<Tier> suggest(int score) {
        if (score < passFrom) return Optional.empty();
        if (score >= expertFrom) return Optional.of(Tier.EXPERT);
        if (score >= seniorFrom) return Optional.of(Tier.SENIOR);
        return Optional.of(Tier.JUNIOR);
    }

    /** Lý do giá không hợp lệ với cấp, empty = hợp lệ. */
    public Optional<String> violation(Tier tier, BigDecimal rate) {
        Band b = band(tier);
        if (rate == null) return Optional.of("Thiếu mức giá");
        if (rate.compareTo(BigDecimal.valueOf(b.min())) < 0 || rate.compareTo(BigDecimal.valueOf(b.max())) > 0) {
            return Optional.of("Giá cấp " + tier + " phải trong khoảng " + b.min() + " – " + b.max() + " đ");
        }
        if (rate.remainder(BigDecimal.valueOf(step)).signum() != 0) {
            return Optional.of("Giá phải chia hết cho " + step + " đ");
        }
        return Optional.empty();
    }

    /** Kẹp giá về biên gần nhất của khung (rồi làm tròn về bước gần nhất trong khung). */
    public BigDecimal clamp(Tier tier, BigDecimal rate) {
        Band b = band(tier);
        BigDecimal min = BigDecimal.valueOf(b.min());
        BigDecimal max = BigDecimal.valueOf(b.max());
        BigDecimal r = rate == null ? min : rate;
        if (r.compareTo(min) < 0) return min;
        if (r.compareTo(max) > 0) return max;
        BigDecimal st = BigDecimal.valueOf(step);
        BigDecimal rem = r.remainder(st);
        BigDecimal down = r.subtract(rem);
        return rem.multiply(BigDecimal.valueOf(2)).compareTo(st) >= 0 ? down.add(st).min(max) : down.max(min);
    }

    /**
     * Cấp tương ứng với mức giá hiện có (dữ liệu cũ trước khi có cấp độ): khung chứa giá, dưới sàn → JUNIOR,
     * trên trần → EXPERT; ranh giới giữa hai khung thuộc khung thấp hơn.
     */
    public Tier tierForRate(BigDecimal rate) {
        if (rate == null) return Tier.JUNIOR;
        for (Band b : bands) {
            if (rate.compareTo(BigDecimal.valueOf(b.max())) <= 0) return b.tier();
        }
        return Tier.EXPERT;
    }
}
