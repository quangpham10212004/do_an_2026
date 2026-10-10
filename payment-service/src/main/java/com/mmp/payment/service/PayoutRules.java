package com.mmp.payment.service;

import com.mmp.payment.exception.ApiException;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/** US-42 (PRD-PAY-5) — quy tắc thuần của rút tiền (không I/O để unit test). */
public final class PayoutRules {

    private PayoutRules() {
    }

    /** Rút khi số dư khả dụng ≥ 200.000đ. */
    public static final BigDecimal MINIMUM = new BigDecimal("200000");

    public static String normalizeAccountNumber(String raw) {
        String digits = raw == null ? "" : raw.replaceAll("[\\s.-]", "");
        if (!digits.matches("\\d{6,20}")) {
            throw ApiException.badRequest("INVALID_BANK_ACCOUNT", "Số tài khoản gồm 6–20 chữ số");
        }
        return digits;
    }

    public static String requireText(String value, String field) {
        String v = value == null ? "" : value.strip().replaceAll("\\s+", " ");
        if (v.length() < 2 || v.length() > 100) {
            throw ApiException.badRequest("INVALID_BANK_ACCOUNT", field + " từ 2 đến 100 ký tự");
        }
        return v;
    }

    /** "••••1234" — chỉ lộ 4 số cuối. */
    public static String mask(String accountNumber) {
        if (accountNumber == null || accountNumber.length() <= 4) return "••••";
        return "••••" + accountNumber.substring(accountNumber.length() - 4);
    }

    public static void requireMinimum(BigDecimal available) {
        if (available == null || available.compareTo(MINIMUM) < 0) {
            throw ApiException.badRequest("PAYOUT_BELOW_MINIMUM", "Số dư khả dụng cần tối thiểu 200.000đ để rút");
        }
    }

    /**
     * Phân bổ {@code amount} vào các giao dịch còn khả dụng theo thứ tự cũ → mới (FIFO). Tổng khả dụng nhỏ hơn amount
     * (số dư bị thu hồi sau khi yêu cầu, vd. tranh chấp mở muộn) → 409 để admin từ chối yêu cầu.
     */
    public static Map<UUID, BigDecimal> allocate(Map<UUID, BigDecimal> availableByTransaction, BigDecimal amount) {
        Map<UUID, BigDecimal> out = new LinkedHashMap<>();
        BigDecimal left = amount;
        for (Map.Entry<UUID, BigDecimal> e : availableByTransaction.entrySet()) {
            if (left.signum() <= 0) break;
            BigDecimal take = e.getValue().min(left);
            if (take.signum() > 0) {
                out.put(e.getKey(), take);
                left = left.subtract(take);
            }
        }
        if (left.signum() > 0) {
            throw ApiException.conflict("PAYOUT_EXCEEDS_AVAILABLE",
                    "Số dư khả dụng hiện nhỏ hơn số tiền yêu cầu — hãy từ chối yêu cầu này");
        }
        return out;
    }
}
