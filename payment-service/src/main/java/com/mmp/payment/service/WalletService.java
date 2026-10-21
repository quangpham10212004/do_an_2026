package com.mmp.payment.service;

import com.mmp.payment.client.AuditClient;
import com.mmp.payment.client.MentoringClient;
import com.mmp.payment.client.MentoringClient.SessionInfo;
import com.mmp.payment.dto.PaymentDtos.*;
import com.mmp.payment.entity.Refund;
import com.mmp.payment.entity.Transaction;
import com.mmp.payment.exception.ApiException;
import com.mmp.payment.gateway.PaymentGateway;
import com.mmp.payment.gateway.RedirectGateway;
import com.mmp.payment.repository.RefundRepository;
import com.mmp.payment.repository.TransactionRepository;
import com.mmp.payment.security.AuthUser;
import com.mmp.payment.service.WalletLedger.WalletRow;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Bản chốt v2.0 §8 — ví VND: nạp ví, trả học phí từ ví, hoàn tiền nạp về nguồn, hạn dùng số dư, đóng băng.
 * Quy tắc thuần ở {@link WalletRules}, bút toán ở {@link WalletLedger}. Học phí vẫn được ghi thành giao dịch
 * (provider = WALLET) nên hoa hồng, thu nhập mentor, tạm giữ tranh chấp và hoàn tiền của US-12/13/25 dùng lại nguyên vẹn.
 */
@Service
public class WalletService {

    private static final Logger log = LoggerFactory.getLogger(WalletService.class);

    private final WalletLedger ledger;
    private final PaymentService payments;
    private final TransactionRepository transactions;
    private final RefundRepository refunds;
    private final ReferralService referralService;
    private final EarningService earnings;
    private final PaymentGateway sandbox;
    private final List<RedirectGateway> redirectGateways;
    private final MentoringClient mentoring;
    private final AuditClient audit;
    private final TransactionTemplate tx;
    private final JdbcTemplate jdbc;
    private final BigDecimal topupMin;
    private final BigDecimal topupMax;
    private final BigDecimal cashCap;
    private final Duration refundWindow;
    private final int refundRequestsPerMonth;
    private final int dormantAfterMonths;

    public WalletService(WalletLedger ledger, PaymentService payments, TransactionRepository transactions, RefundRepository refunds,
                         ReferralService referralService, EarningService earnings, PaymentGateway sandbox,
                         List<RedirectGateway> redirectGateways, MentoringClient mentoring, AuditClient audit,
                         TransactionTemplate tx, JdbcTemplate jdbc,
                         @Value("${app.wallet.topup-min:50000}") BigDecimal topupMin,
                         @Value("${app.wallet.topup-max:5000000}") BigDecimal topupMax,
                         @Value("${app.wallet.cash-cap:20000000}") BigDecimal cashCap,
                         @Value("${app.wallet.refund-window:P7D}") Duration refundWindow,
                         @Value("${app.wallet.refund-requests-per-month:2}") int refundRequestsPerMonth,
                         @Value("${app.wallet.dormant-after-months:12}") int dormantAfterMonths) {
        this.ledger = ledger;
        this.payments = payments;
        this.transactions = transactions;
        this.refunds = refunds;
        this.referralService = referralService;
        this.earnings = earnings;
        this.sandbox = sandbox;
        this.redirectGateways = redirectGateways;
        this.mentoring = mentoring;
        this.audit = audit;
        this.tx = tx;
        this.jdbc = jdbc;
        this.topupMin = topupMin;
        this.topupMax = topupMax;
        this.cashCap = cashCap;
        this.refundWindow = refundWindow;
        this.refundRequestsPerMonth = refundRequestsPerMonth;
        this.dormantAfterMonths = dormantAfterMonths;
    }

    // ------------------------------------------------------------------ xem

    public WalletView view(AuthUser user) {
        UUID id = user.userId();
        OffsetDateTime now = OffsetDateTime.now();
        WalletRow w = ledger.find(id);
        return new WalletView(w.status(), ledger.cash(id), ledger.promo(id, now), ledger.held(id), ledger.nextPromoExpiry(id, now),
                topupMin, topupMax, cashCap, refundEligibility(id, now));
    }

    public PageResponse<WalletLedger.EntryView> entries(AuthUser user, int page, int size) {
        int p = Math.max(page, 0), s = Math.min(Math.max(size, 1), 100);
        long total = ledger.countEntries(user.userId());
        return new PageResponse<>(ledger.entries(user.userId(), p, s), p, s, total, (int) Math.ceil(total / (double) s));
    }

    public RefundEligibility refundEligibility(UUID userId, OffsetDateTime now) {
        OffsetDateTime latest = transactions.latestTopupAt(userId);
        boolean open = WalletRules.refundWindowOpen(latest, now, refundWindow);
        BigDecimal refundable = open ? refundableTopups(userId, now).stream().map(this::remainingRefundable)
                .reduce(BigDecimal.ZERO, BigDecimal::add) : BigDecimal.ZERO;
        BigDecimal max = open ? WalletRules.maxTopupRefund(ledger.cash(userId), refundable) : BigDecimal.ZERO;
        int used = requestsInLastMonth(userId);
        return new RefundEligibility(open, open ? latest.plus(refundWindow) : null, max,
                Math.max(refundRequestsPerMonth - used, 0));
    }

    // ------------------------------------------------------------------ nạp ví

    /** Nạp ví bằng form thẻ sandbox (trả kết quả ngay). Cổng MoMo / VNPay đi qua {@link RedirectPaymentService#checkoutTopup}. */
    public TransactionResponse topupWithCard(AuthUser payer, BigDecimal amount, CardInput card) {
        payer.requireVerifiedEmail();
        BigDecimal a = amount == null ? null : amount.setScale(0, java.math.RoundingMode.HALF_UP);
        requireTopupAllowed(payer.userId(), a);
        Transaction pending = tx.execute(s -> transactions.save(Transaction.topup(payer.userId(), a, "SANDBOX")));
        PaymentGateway.ChargeResult result = sandbox.charge(pending.getId(), a, "VND",
                new PaymentGateway.CardDetails(card.cardNumber(), card.cardHolder(), card.expiry(), card.cvv()));
        Transaction done = tx.execute(s -> {
            Transaction t = transactions.lockById(pending.getId()).orElseThrow();
            t.setProviderReference(result.providerReference());
            if (result.success()) {
                t.setStatus(Transaction.Status.SUCCESS);
                transactions.saveAndFlush(t);
                ledger.creditTopup(t);
            } else {
                t.setStatus(Transaction.Status.FAILED);
                t.setFailureReason(result.failureReason());
            }
            return t;
        });
        if (done.getStatus() == Transaction.Status.SUCCESS) {
            audit.record(payer.userId(), payer.role(), "WALLET_TOPUP", "TRANSACTION", done.getId().toString(), null,
                    AuditClient.fields("amount", done.getAmount(), "provider", done.getProvider()));
        }
        return payments.get(payer, done.getId());
    }

    /** Kiểm tra trước khi nạp (dùng chung form thẻ và cổng chuyển hướng). */
    public void requireTopupAllowed(UUID userId, BigDecimal amount) {
        WalletRow w = ledger.find(userId);
        requireUsable(w);
        WalletRules.validateTopup(amount, topupMin, topupMax, ledger.cash(userId), cashCap).ifPresent(code -> {
            if ("CASH_CAP_EXCEEDED".equals(code)) {
                throw ApiException.conflict(code, "Tiền nạp khả dụng tối đa " + cashCap.toPlainString() + "đ");
            }
            throw ApiException.badRequest(code, "Số tiền nạp từ " + topupMin.toPlainString() + "đ đến " + topupMax.toPlainString()
                    + "đ (số nguyên)");
        });
    }

    // ------------------------------------------------------------------ trả học phí từ ví

    /**
     * Trả học phí của một phiên đang chờ thanh toán từ ví của chính mentee: khuyến mãi trước, thiếu thì tiền nạp.
     * Ghi giao dịch (provider = WALLET, SUCCESS) với phí nền tảng chốt lúc này, rồi báo mentoring xác nhận phiên.
     * Không đủ tiền → 402 INSUFFICIENT_FUNDS (không ghi gì).
     */
    public TransactionResponse pay(AuthUser payer, UUID sessionId, BigDecimal amount) {
        payer.requireVerifiedEmail();
        SessionInfo session = payments.payableSession(payer, sessionId, amount);
        if (!session.menteeId().equals(payer.userId())) {
            throw ApiException.forbidden("Chỉ mentee của phiên mới trả học phí từ ví của mình");
        }
        PaymentRules.FeeSplit split = payments.feeSplit(session.price());
        Transaction paid;
        try {
            paid = tx.execute(s -> {
                requireUsable(ledger.lock(session.menteeId()));
                Transaction t = new Transaction();
                t.setSessionId(session.id());
                t.setPayerId(session.menteeId());
                t.setMentorId(session.mentorId());
                t.setAmount(session.price());
                t.applyFee(split.rate(), split.fee(), split.mentorEarning());
                t.setProvider(Transaction.PROVIDER_WALLET);
                Transaction first = transactions.saveAndFlush(t);
                WalletRules.Allocation a = ledger.debitForSession(session.menteeId(), first.getId(), session.id(), session.price(),
                        OffsetDateTime.now());
                first.applyFunding(a.promo(), a.cash());
                first.setProviderReference("wallet_" + first.getId().toString().replace("-", "").substring(0, 20));
                first.setStatus(Transaction.Status.SUCCESS);
                Transaction flushed = transactions.saveAndFlush(first);
                referralService.onSuccessfulTransaction(flushed);
                earnings.recordPending(flushed);
                return flushed;
            });
        } catch (DataIntegrityViolationException e) {
            throw ApiException.conflict("ALREADY_PAID", "Phiên này đã được thanh toán");
        }
        audit.record(payer.userId(), payer.role(), "CHARGE_SUCCEEDED", "TRANSACTION", paid.getId().toString(), null,
                AuditClient.fields("sessionId", paid.getSessionId(), "amount", paid.getAmount(), "fee", paid.getFee(),
                        "mentorEarning", paid.getMentorEarning(), "provider", "WALLET",
                        "fromPromo", paid.getPaidPromo(), "fromCash", paid.getPaidCash()));
        if (paid.getMentorEarning().signum() > 0) {
            audit.system("EARNING_PENDING", "TRANSACTION", paid.getId(), AuditClient.fields("sessionId", paid.getSessionId(),
                    "mentorId", paid.getMentorId(), "amount", paid.getMentorEarning()));
        }
        payments.syncSession(paid.getId());
        return payments.get(payer, paid.getId());
    }

    // ------------------------------------------------------------------ trạng thái ví

    public void reactivate(AuthUser user) {
        tx.executeWithoutResult(s -> {
            WalletRow w = ledger.lock(user.userId());
            if ("FROZEN".equals(w.status())) throw ApiException.forbidden("Ví đang bị đóng băng");
            if ("DORMANT".equals(w.status())) {
                ledger.setStatus(user.userId(), "ACTIVE");
                ledger.touch(user.userId());
            }
        });
    }

    /** Admin khoá / mở khoá tài khoản (gọi từ mentoring-service hoặc auth): đóng băng ví, mở khoá thì về ACTIVE. */
    public void setFrozen(UUID userId, boolean frozen) {
        tx.executeWithoutResult(s -> {
            WalletRow w = ledger.lock(userId);
            if (frozen) ledger.setStatus(userId, "FROZEN");
            else if ("FROZEN".equals(w.status())) {
                ledger.setStatus(userId, "ACTIVE");
                ledger.touch(userId);
            }
        });
        audit.system(frozen ? "WALLET_FROZEN" : "WALLET_UNFROZEN", "WALLET", userId, AuditClient.fields());
    }

    private void requireUsable(WalletRow w) {
        if ("FROZEN".equals(w.status())) throw new ApiException(HttpStatus.FORBIDDEN, "WALLET_FROZEN", "Ví đang bị đóng băng");
        if ("DORMANT".equals(w.status())) {
            throw ApiException.conflict("WALLET_DORMANT", "Ví không hoạt động quá 12 tháng — hãy kích hoạt lại để sử dụng");
        }
    }

    // ------------------------------------------------------------------ khuyến mãi (admin)

    public UUID grantPromo(AuthUser admin, UUID userId, BigDecimal amount, String reason) {
        BigDecimal a = amount.setScale(0, java.math.RoundingMode.HALF_UP);
        UUID lot = tx.execute(s -> ledger.grantPromo(userId, a, reason, null, OffsetDateTime.now()));
        audit.record(admin.userId(), "ADMIN", "WALLET_PROMO_GRANTED", "WALLET", userId.toString(), null,
                AuditClient.fields("amount", a, "reason", reason, "lotId", lot));
        return lot;
    }

    // ------------------------------------------------------------------ hoàn tiền nạp về nguồn

    private List<Transaction> refundableTopups(UUID userId, OffsetDateTime now) {
        return transactions.findRefundableTopupsSince(userId, now.minus(refundWindow));
    }

    private BigDecimal remainingRefundable(Transaction t) {
        return t.getAmount().subtract(refunds.sumByTransactionId(t.getId()));
    }

    private int requestsInLastMonth(UUID userId) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM topup_refund_requests WHERE user_id = ? AND status <> 'REJECTED' "
                + "AND created_at > now() - interval '30 days'", Integer.class, userId);
        return n == null ? 0 : n;
    }

    /**
     * Yêu cầu hoàn tiền nạp (tiền nạp khả dụng, không gồm tiền đang tạm giữ hay khuyến mãi). Hợp lệ theo bản chốt → xử lý ngay;
     * ngoài quy tắc (hết 7 ngày, quá số lần, vượt mức) → 409, trừ khi gửi {@code exceptionReason} để admin xét ngoại lệ.
     */
    public TopupRefundView requestTopupRefund(AuthUser user, BigDecimal amount, String exceptionReason) {
        user.requireVerifiedEmail();
        BigDecimal a = amount.setScale(0, java.math.RoundingMode.HALF_UP);
        if (a.signum() <= 0) throw ApiException.badRequest("INVALID_REFUND_AMOUNT", "Số tiền hoàn phải lớn hơn 0");
        OffsetDateTime now = OffsetDateTime.now();
        requireUsable(ledger.find(user.userId()));
        RefundEligibility e = refundEligibility(user.userId(), now);
        String violation = !e.windowOpen() ? "REFUND_WINDOW_CLOSED"
                : e.remainingRequests() <= 0 ? "REFUND_LIMIT_REACHED"
                : a.compareTo(e.maxAmount()) > 0 ? "REFUND_AMOUNT_EXCEEDED" : null;
        if (violation != null) {
            if (exceptionReason == null || exceptionReason.isBlank()) {
                throw ApiException.conflict(violation, switch (violation) {
                    case "REFUND_WINDOW_CLOSED" -> "Đã quá 7 ngày kể từ lần nạp gần nhất";
                    case "REFUND_LIMIT_REACHED" -> "Đã đạt số yêu cầu hoàn tiền tối đa trong tháng";
                    default -> "Mức hoàn tối đa hiện tại là " + e.maxAmount().toPlainString() + "đ";
                });
            }
            UUID id = jdbc.queryForObject("INSERT INTO topup_refund_requests (user_id, amount, kind, user_reason) "
                    + "VALUES (?, ?, 'EXCEPTION', ?) RETURNING id", UUID.class, user.userId(), a, exceptionReason.trim());
            audit.record(user.userId(), user.role(), "TOPUP_REFUND_EXCEPTION_REQUESTED", "WALLET", user.userId().toString(), null,
                    AuditClient.fields("requestId", id, "amount", a, "violation", violation));
            return requestView(id);
        }
        UUID id = tx.execute(s -> {
            ledger.lock(user.userId());
            UUID rid = jdbc.queryForObject("INSERT INTO topup_refund_requests (user_id, amount, kind, status, decided_at) "
                    + "VALUES (?, ?, 'AUTO', 'DONE', now()) RETURNING id", UUID.class, user.userId(), a);
            executeTopupRefund(user.userId(), a, rid, null, false, now);
            return rid;
        });
        audit.record(user.userId(), user.role(), "TOPUP_REFUND_DONE", "WALLET", user.userId().toString(), null,
                AuditClient.fields("requestId", id, "amount", a));
        return requestView(id);
    }

    /**
     * Trả tiền nạp về nguồn (mới nhất trước) qua cổng đã nạp. {@code anyAge} = admin duyệt ngoại lệ: không giới hạn cửa sổ 7 ngày.
     * Chạy trong transaction của bên gọi; cổng từ chối → 502 và rollback toàn bộ.
     */
    private void executeTopupRefund(UUID userId, BigDecimal amount, UUID requestId, UUID actorId, boolean anyAge, OffsetDateTime now) {
        BigDecimal cash = ledger.cash(userId);
        if (amount.compareTo(cash) > 0) {
            throw ApiException.conflict("REFUND_AMOUNT_EXCEEDS_CASH", "Số tiền nạp khả dụng chỉ còn " + cash.toPlainString() + "đ");
        }
        List<Transaction> candidates = anyAge ? transactions.findRefundableTopupsSince(userId, OffsetDateTime.now().minusYears(5))
                : refundableTopups(userId, now);
        BigDecimal left = amount;
        for (Transaction t : candidates) {
            if (left.signum() <= 0) break;
            Transaction locked = transactions.lockById(t.getId()).orElseThrow();
            BigDecimal already = refunds.sumByTransactionId(locked.getId());
            BigDecimal take = locked.getAmount().subtract(already).min(left);
            if (take.signum() <= 0) continue;
            boolean full = already.signum() == 0 && take.compareTo(locked.getAmount()) == 0;
            PaymentGateway.ChargeResult r = redirectGateways.stream().filter(g -> g.provider().equals(locked.getProvider())).findFirst()
                    .map(g -> g.refund(locked, take, full, actorId == null ? null : actorId.toString()))
                    .orElseGet(() -> sandbox.refund(locked.getProviderReference(), take));
            if (!r.success()) {
                throw new ApiException(HttpStatus.BAD_GATEWAY, "REFUND_FAILED", "Cổng thanh toán từ chối hoàn tiền");
            }
            refunds.save(new Refund(locked.getId(), take, "TOPUP_REFUND", actorId, r.providerReference()));
            locked.setStatus(PaymentRules.statusAfterRefund(locked.getAmount(), already.add(take)));
            ledger.debitTopupRefund(userId, take, locked.getId(), requestId, "Hoàn tiền nạp về nguồn thanh toán");
            left = left.subtract(take);
        }
        if (left.signum() > 0) {
            throw ApiException.conflict("REFUND_AMOUNT_EXCEEDED", "Không đủ tiền nạp còn hoàn được cho yêu cầu này");
        }
    }

    public TopupRefundView requestView(UUID id) {
        return jdbc.queryForObject("SELECT id, user_id, amount, status, kind, user_reason, admin_reason, created_at, decided_at "
                + "FROM topup_refund_requests WHERE id = ?", REQUEST_MAPPER, id);
    }

    private static final org.springframework.jdbc.core.RowMapper<TopupRefundView> REQUEST_MAPPER = (rs, i) -> new TopupRefundView(
            rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class), rs.getBigDecimal("amount"), rs.getString("status"),
            rs.getString("kind"), rs.getString("user_reason"), rs.getString("admin_reason"),
            rs.getObject("created_at", OffsetDateTime.class), rs.getObject("decided_at", OffsetDateTime.class));

    public List<TopupRefundView> mineRequests(AuthUser user) {
        return jdbc.query("SELECT id, user_id, amount, status, kind, user_reason, admin_reason, created_at, decided_at "
                + "FROM topup_refund_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", REQUEST_MAPPER, user.userId());
    }

    public List<TopupRefundView> adminRequests(String status) {
        return status == null || status.isBlank()
                ? jdbc.query("SELECT id, user_id, amount, status, kind, user_reason, admin_reason, created_at, decided_at "
                + "FROM topup_refund_requests ORDER BY created_at DESC LIMIT 200", REQUEST_MAPPER)
                : jdbc.query("SELECT id, user_id, amount, status, kind, user_reason, admin_reason, created_at, decided_at "
                + "FROM topup_refund_requests WHERE status = ? ORDER BY created_at DESC LIMIT 200", REQUEST_MAPPER, status.toUpperCase());
    }

    /** Admin duyệt / từ chối yêu cầu ngoại lệ; bắt buộc lý do. Duyệt = hoàn ngay, tối đa bằng tiền nạp khả dụng. */
    public TopupRefundView decide(AuthUser admin, UUID requestId, String decision, String reason) {
        if (reason == null || reason.isBlank()) throw ApiException.badRequest("REASON_REQUIRED", "Bắt buộc ghi lý do");
        boolean approve = "APPROVE".equalsIgnoreCase(decision);
        TopupRefundView before = tx.execute(s -> {
            Map<String, Object> row = jdbc.queryForMap("SELECT user_id, amount, status FROM topup_refund_requests WHERE id = ? FOR UPDATE", requestId);
            if (!"PENDING".equals(row.get("status"))) throw ApiException.conflict("REQUEST_NOT_PENDING", "Yêu cầu đã được xử lý");
            UUID userId = (UUID) row.get("user_id");
            if (approve) {
                ledger.lock(userId);
                executeTopupRefund(userId, (BigDecimal) row.get("amount"), requestId, admin.userId(), true, OffsetDateTime.now());
            }
            jdbc.update("UPDATE topup_refund_requests SET status = ?, admin_id = ?, admin_reason = ?, decided_at = now() WHERE id = ?",
                    approve ? "DONE" : "REJECTED", admin.userId(), reason.trim(), requestId);
            return requestView(requestId);
        });
        audit.record(admin.userId(), "ADMIN", approve ? "TOPUP_REFUND_APPROVED" : "TOPUP_REFUND_REJECTED", "WALLET",
                before.userId().toString(), null, AuditClient.fields("requestId", requestId, "amount", before.amount(), "reason", reason));
        return before;
    }

    // ------------------------------------------------------------------ job nền

    /** Hằng ngày: khuyến mãi quá hạn bị trừ; ví không hoạt động quá 12 tháng → DORMANT. Trả về {expiredLots, dormantWallets}. */
    public int[] runExpiry(OffsetDateTime now) {
        int lots = tx.execute(s -> ledger.expirePromo(now));
        int dormant = 0;
        for (UUID userId : ledger.usersWithEntriesInactiveSince(now.minusMonths(dormantAfterMonths))) {
            Boolean marked = tx.execute(s -> {
                WalletRow w = ledger.lock(userId);
                if ("ACTIVE".equals(w.status()) && WalletRules.isDormant(w.lastActivityAt(), now, dormantAfterMonths)) {
                    ledger.setStatus(userId, "DORMANT");
                    return true;
                }
                return false;
            });
            if (Boolean.TRUE.equals(marked)) dormant++;
        }
        return new int[]{lots, dormant};
    }

    /** Nhắc trước 30 ngày và 7 ngày: khuyến mãi sắp hết hạn, ví sắp "ngủ". Best-effort (thông báo lỗi không ảnh hưởng tiền). */
    public int sendReminders(OffsetDateTime now) {
        int sent = 0;
        for (int days : new int[]{30, 7}) {
            String col = days == 30 ? "notified_30d_at" : "notified_7d_at";
            List<Map<String, Object>> lots = jdbc.queryForList("SELECT id, user_id, remaining, expires_at FROM wallet_promo_lots "
                    + "WHERE remaining > 0 AND expires_at > ? AND expires_at <= ? AND " + col + " IS NULL", now, now.plusDays(days));
            for (Map<String, Object> lot : lots) {
                UUID userId = (UUID) lot.get("user_id");
                mentoring.notify(userId, null, "WALLET_PROMO_EXPIRING", "Tiền khuyến mãi sắp hết hạn",
                        "Bạn có " + lot.get("remaining") + "đ khuyến mãi sẽ hết hạn trong " + days + " ngày. Hãy dùng trước khi hết hạn.", "/wallet");
                jdbc.update("UPDATE wallet_promo_lots SET " + col + " = now() WHERE id = ?", lot.get("id"));
                sent++;
            }
        }
        List<UUID> soonDormant = jdbc.queryForList("SELECT user_id FROM wallets WHERE status = 'ACTIVE' AND dormant_notified_at IS NULL "
                + "AND last_activity_at < ? AND last_activity_at >= ?", UUID.class,
                now.minusMonths(dormantAfterMonths).plusDays(30), now.minusMonths(dormantAfterMonths));
        for (UUID userId : soonDormant) {
            mentoring.notify(userId, null, "WALLET_DORMANT_SOON", "Ví sắp chuyển sang trạng thái ngủ",
                    "Ví của bạn chưa có giao dịch gần 12 tháng. Hãy sử dụng ví trong 30 ngày tới để giữ ví hoạt động.", "/wallet");
            jdbc.update("UPDATE wallets SET dormant_notified_at = now() WHERE user_id = ?", userId);
            sent++;
        }
        return sent;
    }
}
