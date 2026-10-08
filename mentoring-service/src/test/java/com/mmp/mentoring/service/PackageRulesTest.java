package com.mmp.mentoring.service;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Giá gói buổi, hoàn tiền buổi chưa dùng và đọc cấu hình các mức gói. */
class PackageRulesTest {

    @Test
    void tiersAreParsedAndSortedBySessions() {
        assertThat(PackageRules.parseTiers("8:15, 4:10"))
                .containsExactly(new PackageRules.Tier(4, 10), new PackageRules.Tier(8, 15));
        assertThat(PackageRules.parseTiers("")).isEmpty();
        assertThat(PackageRules.parseTiers(null)).isEmpty();
    }

    @Test
    void invalidTierConfigurationIsRejected() {
        assertThatThrownBy(() -> PackageRules.parseTiers("4-10")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> PackageRules.parseTiers("1:10")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> PackageRules.parseTiers("4:95")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void unitPriceAppliesTheDiscountAndRoundsToThousand() {
        // 300.000đ giảm 10% = 270.000đ; 250.000đ giảm 15% = 212.500đ, làm tròn thành 213.000đ
        assertThat(PackageRules.unitPrice(BigDecimal.valueOf(300_000), 10)).isEqualByComparingTo("270000");
        assertThat(PackageRules.unitPrice(BigDecimal.valueOf(250_000), 15)).isEqualByComparingTo("213000");
        assertThat(PackageRules.unitPrice(BigDecimal.ZERO, 10)).isEqualByComparingTo("0");
    }

    @Test
    void totalPriceIsUnitPriceTimesSessions() {
        assertThat(PackageRules.totalPrice(BigDecimal.valueOf(270_000), 4)).isEqualByComparingTo("1080000");
    }

    @Test
    void savingsCompareAgainstBuyingSessionsOneByOne() {
        BigDecimal total = PackageRules.totalPrice(PackageRules.unitPrice(BigDecimal.valueOf(300_000), 10), 4);
        assertThat(PackageRules.savings(BigDecimal.valueOf(300_000), total, 4)).isEqualByComparingTo("120000");
    }

    @Test
    void refundCoversUnusedSessionsMinusTheRetainedFee() {
        BigDecimal unit = BigDecimal.valueOf(270_000);
        assertThat(PackageRules.refundAmount(unit, 3, 0)).isEqualByComparingTo("810000");
        assertThat(PackageRules.refundAmount(unit, 3, 10)).isEqualByComparingTo("729000");
        assertThat(PackageRules.refundAmount(unit, 0, 0)).isEqualByComparingTo("0");
        assertThat(PackageRules.refundAmount(null, 3, 0)).isEqualByComparingTo("0");
    }

    @Test
    void biggerTiersGiveLowerPricePerSession() {
        List<PackageRules.Tier> tiers = PackageRules.parseTiers("4:10,8:15");
        BigDecimal single = BigDecimal.valueOf(300_000);
        BigDecimal perSession4 = PackageRules.unitPrice(single, tiers.get(0).discountPercent());
        BigDecimal perSession8 = PackageRules.unitPrice(single, tiers.get(1).discountPercent());
        assertThat(perSession8).isLessThan(perSession4);
    }
}
