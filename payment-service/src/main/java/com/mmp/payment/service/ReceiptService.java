package com.mmp.payment.service;

import com.mmp.payment.client.MentoringClient;
import com.mmp.payment.client.ProfileClient;
import com.mmp.payment.dto.PaymentDtos.EarningRow;
import com.mmp.payment.dto.PayoutDtos.Receipt;
import com.mmp.payment.dto.PayoutDtos.ReceiptRefund;
import com.mmp.payment.entity.Refund;
import com.mmp.payment.entity.Transaction;
import com.mmp.payment.exception.ApiException;
import com.mmp.payment.repository.RefundRepository;
import com.mmp.payment.repository.TransactionRepository;
import com.mmp.payment.security.AuthUser;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/**
 * US-42 (PRD-PAY-4, PAY-6) — biên lai giao dịch (kèm biên lai hoàn tiền) và xuất CSV thu nhập theo tháng.
 * Biên lai chỉ có với giao dịch đã thu tiền (SUCCESS, ON_HOLD, PARTIALLY_REFUNDED, REFUNDED); người xem là người trả,
 * mentor của giao dịch hoặc admin. Tên và giờ phiên lấy từ profile-service / mentoring-service (lỗi → bỏ trống).
 */
@Service
public class ReceiptService {

    private static final Set<Transaction.Status> PAID = Set.copyOf(Transaction.EARNING_STATUSES);
    static final ZoneId ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private final TransactionRepository transactions;
    private final RefundRepository refunds;
    private final MentoringClient mentoring;
    private final ProfileClient profiles;
    private final EarningService earnings;

    public ReceiptService(TransactionRepository transactions, RefundRepository refunds, MentoringClient mentoring,
                          ProfileClient profiles, EarningService earnings) {
        this.transactions = transactions;
        this.refunds = refunds;
        this.mentoring = mentoring;
        this.profiles = profiles;
        this.earnings = earnings;
    }

    public Receipt receipt(AuthUser user, UUID transactionId) {
        Transaction t = transactions.findById(transactionId)
                .orElseThrow(() -> ApiException.notFound("TRANSACTION_NOT_FOUND", "Không tìm thấy giao dịch"));
        if (!user.isAdmin() && !user.userId().equals(t.getPayerId()) && !user.userId().equals(t.getMentorId())) {
            throw ApiException.forbidden("Bạn không có quyền xem biên lai này");
        }
        if (!PAID.contains(t.getStatus())) {
            throw ApiException.conflict("RECEIPT_NOT_AVAILABLE", "Chỉ giao dịch đã thanh toán mới có biên lai");
        }
        List<Refund> rs = refunds.findByTransactionIdInOrderByCreatedAtAsc(List.of(t.getId()));
        BigDecimal refunded = rs.stream().map(Refund::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        MentoringClient.SessionInfo session = null;
        try {
            session = mentoring.getSession(t.getSessionId());
        } catch (RuntimeException ignored) {
            // biên lai vẫn hiển thị được khi mentoring-service tạm lỗi
        }
        return new Receipt(number("RC", t.getId()), t.getId(), t.getStatus().name(), t.getCreatedAt(), t.getSessionId(),
                session == null ? null : session.scheduledAt(), session == null ? null : session.durationMinutes(),
                t.getPayerId(), profiles.displayName(t.getPayerId()), t.getMentorId(), profiles.displayName(t.getMentorId()),
                t.getAmount(), t.getFee(), t.getMentorEarning(), t.getCurrency(), t.getProvider(), t.getProviderReference(),
                refunded, t.getAmount().subtract(refunded),
                rs.stream().map(r -> new ReceiptRefund(number("RF", r.getId()), r.getId(), r.getAmount(), r.getReason(),
                        r.getCreatedAt())).toList());
    }

    /** "RC-1A2B3C4D" — số biên lai đọc được, suy ra từ id (không cần bảng đánh số riêng). */
    static String number(String prefix, UUID id) {
        return prefix + "-" + id.toString().substring(0, 8).toUpperCase(Locale.ROOT);
    }

    /**
     * PRD-PAY-4 — CSV thu nhập của mentor theo tháng (giờ Việt Nam, theo ngày thu tiền). Cột: ngày, phiên, giao dịch,
     * giá phiên, thu nhập, chờ giải phóng, khả dụng, đã rút, đã thu hồi, trạng thái giao dịch.
     */
    public String earningsCsv(UUID mentorId, YearMonth month) {
        DateTimeFormatter date = DateTimeFormatter.ofPattern("yyyy-MM-dd");
        StringBuilder sb = new StringBuilder("﻿"); // BOM để Excel đọc đúng UTF-8
        sb.append("date,session_id,transaction_id,session_price,mentor_earning,pending,available,paid_out,reversed,status\n");
        for (EarningRow r : earnings.rows(mentorId)) {
            if (!YearMonth.from(r.createdAt().atZoneSameInstant(ZONE)).equals(month)) continue;
            sb.append(r.createdAt().atZoneSameInstant(ZONE).format(date)).append(',')
                    .append(r.sessionId()).append(',').append(r.transactionId()).append(',')
                    .append(plain(r.amount())).append(',').append(plain(r.mentorEarning())).append(',')
                    .append(plain(r.pending())).append(',').append(plain(r.available())).append(',')
                    .append(plain(r.paidOut())).append(',').append(plain(r.reversed())).append(',')
                    .append(r.transactionStatus()).append('\n');
        }
        return sb.toString();
    }

    private static String plain(BigDecimal v) {
        return v == null ? "0" : v.stripTrailingZeros().toPlainString();
    }
}
