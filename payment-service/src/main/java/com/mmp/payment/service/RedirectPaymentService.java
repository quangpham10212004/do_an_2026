package com.mmp.payment.service;

import com.mmp.payment.client.AuditClient;
import com.mmp.payment.client.MentoringClient.SessionInfo;
import com.mmp.payment.dto.PaymentDtos.CheckoutResponse;
import com.mmp.payment.dto.PaymentDtos.TransactionResponse;
import com.mmp.payment.entity.Transaction;
import com.mmp.payment.exception.ApiException;
import com.mmp.payment.gateway.PaymentGateway;
import com.mmp.payment.gateway.RedirectGateway;
import com.mmp.payment.gateway.VnpayClient;
import com.mmp.payment.repository.TransactionRepository;
import com.mmp.payment.security.AuthUser;
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
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * US-56 (PRD-PAY-9..14) — thanh toán phiên qua cổng chuyển hướng (MoMo, VNPay).
 * <pre>
 * checkout ─→ giao dịch PENDING (provider = cổng đang chọn) + link ─→ trình duyệt sang trang của cổng
 *   IPN (cổng gọi server)          ┐
 *   trang return → truy vấn cổng   ├─→ settle(): PENDING → SUCCESS | FAILED (chỉ một lần, khoá dòng)
 *   job đối soát → truy vấn cổng   ┘
 * </pre>
 * Chỉ IPN (có chữ ký) và kết quả truy vấn (gọi thẳng cổng qua HTTPS) mới đổi trạng thái; tham số trang return do trình
 * duyệt mang về chỉ được dùng sau khi kiểm chữ ký, để kích hoạt truy vấn. Nhờ vậy chạy local (cổng không gọi được IPN vào
 * localhost) vẫn xác nhận được phiên.
 */
@Service
public class RedirectPaymentService {

    private static final Logger log = LoggerFactory.getLogger(RedirectPaymentService.class);

    /** Kết quả xử lý một IPN; controller của từng cổng đổi sang định dạng phản hồi cổng đó yêu cầu. */
    public enum IpnResult { OK, ALREADY_CONFIRMED, BAD_SIGNATURE, NOT_FOUND, BAD_AMOUNT, ERROR }

    enum Settle { APPLIED, ALREADY_FINAL, DUPLICATE }

    private final PaymentService payments;
    private final Map<String, RedirectGateway> gateways;
    private final String selected;
    private final TransactionRepository transactions;
    private final ReferralService referralService;
    private final EarningService earnings;
    private final AuditClient audit;
    private final TransactionTemplate tx;
    private final JdbcTemplate jdbc;
    private final WalletLedger walletLedger;
    private final WalletService wallet;

    public RedirectPaymentService(PaymentService payments, List<RedirectGateway> gateways,
                                  @Value("${app.payment.gateway:sandbox}") String selected,
                                  TransactionRepository transactions, ReferralService referralService, EarningService earnings,
                                  AuditClient audit, TransactionTemplate tx, JdbcTemplate jdbc,
                                  WalletLedger walletLedger, @org.springframework.context.annotation.Lazy WalletService wallet) {
        this.payments = payments;
        this.gateways = gateways.stream().collect(Collectors.toMap(RedirectGateway::provider, Function.identity()));
        this.selected = selected.trim().toUpperCase(Locale.ROOT);
        this.transactions = transactions;
        this.referralService = referralService;
        this.earnings = earnings;
        this.audit = audit;
        this.tx = tx;
        this.jdbc = jdbc;
        this.walletLedger = walletLedger;
        this.wallet = wallet;
        if (!"SANDBOX".equals(this.selected) && active().isEmpty()) {
            log.warn("PAYMENT_GATEWAY={} is not configured (missing keys) — only the in-process sandbox card form is available", selected);
        }
    }

    /** Cổng chuyển hướng đang dùng cho thanh toán mới (PAYMENT_GATEWAY), nếu có đủ khoá. */
    public Optional<RedirectGateway> active() {
        return Optional.ofNullable(gateways.get(selected)).filter(RedirectGateway::configured);
    }

    /** PRD-PAY-10, 13 — mỗi lần bấm "Thanh toán" là 1 giao dịch PENDING mới (mã đơn mới phía cổng). */
    public CheckoutResponse checkout(AuthUser payer, UUID sessionId, BigDecimal amount, String clientIp) {
        payments.requireDirectPaymentEnabled();
        RedirectGateway gw = active().orElseThrow(() -> new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                "GATEWAY_DISABLED", "Cổng thanh toán chưa được bật"));
        payer.requireVerifiedEmail(); // US-39
        SessionInfo session = payments.payableSession(payer, sessionId, amount);
        PaymentRules.FeeSplit split = payments.feeSplit(session.price());
        Transaction saved = tx.execute(s -> {
            Transaction t = new Transaction();
            t.setSessionId(session.id());
            t.setPayerId(session.menteeId());
            t.setMentorId(session.mentorId());
            t.setAmount(session.price());
            t.applyFee(split.rate(), split.fee(), split.mentorEarning());
            t.setProvider(gw.provider());
            t.setProviderCreatedAt(VnpayClient.now());
            Transaction first = transactions.saveAndFlush(t);
            first.setProviderTxnRef(gw.txnRef(first.getId()));
            return first;
        });
        String url;
        try {
            url = gw.createPaymentUrl(saved, clientIp);
        } catch (RuntimeException e) {
            settle(saved.getId(), false, null, gw.provider() + "_UNAVAILABLE");
            log.warn("{} checkout for session {} failed: {}", gw.provider(), sessionId, e.getMessage());
            throw new ApiException(HttpStatus.BAD_GATEWAY, "GATEWAY_UNAVAILABLE", "Không tạo được link thanh toán, vui lòng thử lại");
        }
        log.info("{} checkout: transaction {} for session {} ({} VND)", gw.provider(), saved.getId(), sessionId, saved.getAmount());
        return new CheckoutResponse(saved.getId(), gw.provider(), url);
    }

    /**
     * Bản chốt v2.0 §8.2 — nạp ví qua cổng chuyển hướng: giao dịch kind = TOPUP (PENDING) + link; ví được cộng khi cổng xác nhận
     * (IPN / return / đối soát) — dùng lại toàn bộ luồng settle của cổng.
     */
    public CheckoutResponse checkoutTopup(AuthUser payer, String provider, BigDecimal amount, String clientIp) {
        RedirectGateway gw = Optional.ofNullable(gateways.get(provider)).filter(RedirectGateway::configured)
                .orElseThrow(() -> new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "GATEWAY_DISABLED", "Cổng thanh toán chưa được bật"));
        payer.requireVerifiedEmail();
        BigDecimal a = amount.setScale(0, java.math.RoundingMode.HALF_UP);
        wallet.requireTopupAllowed(payer.userId(), a);
        Transaction saved = tx.execute(s -> {
            Transaction t = Transaction.topup(payer.userId(), a, gw.provider());
            t.setProviderCreatedAt(VnpayClient.now());
            Transaction first = transactions.saveAndFlush(t);
            first.setProviderTxnRef(gw.txnRef(first.getId()));
            return first;
        });
        String url;
        try {
            url = gw.createPaymentUrl(saved, clientIp);
        } catch (RuntimeException e) {
            settle(saved.getId(), false, null, gw.provider() + "_UNAVAILABLE");
            log.warn("{} topup checkout failed: {}", gw.provider(), e.getMessage());
            throw new ApiException(HttpStatus.BAD_GATEWAY, "GATEWAY_UNAVAILABLE", "Không tạo được link thanh toán, vui lòng thử lại");
        }
        log.info("{} topup checkout: transaction {} ({} VND)", gw.provider(), saved.getId(), a);
        return new CheckoutResponse(saved.getId(), gw.provider(), url);
    }

    /**
     * PRD-PAY-11 — IPN: chữ ký → có giao dịch → đúng số tiền → còn PENDING → áp dụng. Mọi IPN được ghi nguyên văn vào
     * payment_ipn_log (kể cả chữ ký sai).
     */
    public IpnResult ipn(String provider, Map<String, String> params) {
        IpnResult result;
        String ref = null;
        try {
            RedirectGateway gw = gateways.get(provider);
            Optional<RedirectGateway.Callback> cb = gw == null ? Optional.empty() : gw.verifyCallback(params);
            ref = cb.map(RedirectGateway.Callback::txnRef).orElse(null);
            result = cb.map(c -> apply(provider, c)).orElse(IpnResult.BAD_SIGNATURE);
        } catch (Exception e) {
            log.error("{} IPN failed: {}", provider, e.getMessage(), e);
            result = IpnResult.ERROR;
        }
        logIpn(provider, ref, params, result);
        return result;
    }

    private IpnResult apply(String provider, RedirectGateway.Callback cb) {
        Optional<Transaction> found = transactions.findByProviderTxnRef(cb.txnRef())
                .filter(t -> provider.equals(t.getProvider()));
        if (found.isEmpty()) return IpnResult.NOT_FOUND;
        Transaction t = found.get();
        if (t.getAmount().compareTo(cb.amount()) != 0) return IpnResult.BAD_AMOUNT;
        if (t.getStatus() != Transaction.Status.PENDING) return IpnResult.ALREADY_CONFIRMED;
        Settle s = settle(t.getId(), cb.paid(), cb.providerReference(), cb.failureReason());
        return s == Settle.ALREADY_FINAL ? IpnResult.ALREADY_CONFIRMED : IpnResult.OK;
    }

    /**
     * PRD-PAY-12 — trang return gửi lại tham số cổng trả về. Chữ ký hợp lệ + giao dịch của người gọi còn PENDING → hỏi cổng
     * (truy vấn trạng thái) rồi mới đổi trạng thái; tham số return tự nó không bao giờ đổi trạng thái.
     */
    public TransactionResponse confirmReturn(AuthUser user, String provider, Map<String, String> params) {
        RedirectGateway gw = Optional.ofNullable(gateways.get(provider)).filter(RedirectGateway::configured)
                .orElseThrow(() -> ApiException.notFound("GATEWAY_NOT_FOUND", "Không có cổng thanh toán này"));
        RedirectGateway.Callback cb = gw.verifyCallback(params)
                .orElseThrow(() -> ApiException.badRequest("INVALID_SIGNATURE", "Chữ ký của cổng thanh toán không hợp lệ"));
        Transaction t = transactions.findByProviderTxnRef(cb.txnRef())
                .filter(x -> provider.equals(x.getProvider()))
                .orElseThrow(() -> ApiException.notFound("TRANSACTION_NOT_FOUND", "Không tìm thấy giao dịch"));
        if (!user.isAdmin() && !user.userId().equals(t.getPayerId())) {
            throw ApiException.forbidden("Bạn không có quyền xem giao dịch này");
        }
        if (t.getStatus() == Transaction.Status.PENDING) {
            reconcile(gw, t);
        }
        return payments.get(user, t.getId());
    }

    /** PRD-PAY-14 — giao dịch PENDING lâu hơn {@code olderThan}: hỏi cổng; quá hạn link + 5 phút mà chưa trả → FAILED. */
    public int reconcilePending(Duration olderThan) {
        int n = 0;
        for (RedirectGateway gw : gateways.values()) {
            if (!gw.configured()) continue;
            for (Transaction t : transactions.findByProviderAndStatusAndCreatedAtBefore(gw.provider(),
                    Transaction.Status.PENDING, OffsetDateTime.now().minus(olderThan))) {
                try {
                    if (reconcile(gw, t)) n++;
                } catch (Exception e) {
                    log.warn("{} reconcile of {} failed: {}", gw.provider(), t.getId(), e.getMessage());
                }
            }
        }
        return n;
    }

    /** Truy vấn cổng → settle. Trả true nếu giao dịch đã có kết quả cuối. */
    boolean reconcile(RedirectGateway gw, Transaction t) {
        RedirectGateway.QueryResult q = gw.query(t);
        switch (q.outcome()) {
            case SUCCESS -> {
                settle(t.getId(), true, q.providerReference(), null);
                return true;
            }
            case FAILED -> {
                settle(t.getId(), false, q.providerReference(), q.code());
                return true;
            }
            default -> {
                // Link đã hết hạn (+5 phút cho IPN muộn) mà cổng vẫn chưa có giao dịch thành công → người dùng bỏ dở
                if (t.getCreatedAt().plus(gw.linkTtl()).plusMinutes(5).isBefore(OffsetDateTime.now())) {
                    settle(t.getId(), false, null, "PAYMENT_EXPIRED");
                    return true;
                }
                return false;
            }
        }
    }

    /**
     * PENDING → SUCCESS | FAILED đúng một lần (khoá dòng). SUCCESS: referral + EARNING_PENDING như charge sandbox, rồi báo
     * mentoring xác nhận phiên (phiên đã EXPIRED/CANCELLED → mentoring tự hoàn tiền). Phiên đã có giao dịch thu tiền khác
     * (unique index) → FAILED DUPLICATE_PAYMENT và hoàn toàn bộ khoản vừa trả (PRD-PAY-13).
     */
    Settle settle(UUID id, boolean paid, String providerReference, String failureReason) {
        Settle result;
        try {
            result = tx.execute(s -> {
                Transaction t = transactions.lockById(id).orElseThrow();
                if (t.getStatus() != Transaction.Status.PENDING) return Settle.ALREADY_FINAL;
                if (providerReference != null && !providerReference.isBlank()) t.setProviderReference(providerReference);
                if (paid) {
                    t.setStatus(Transaction.Status.SUCCESS);
                    Transaction flushed = transactions.saveAndFlush(t);
                    if (flushed.isTopup()) {
                        walletLedger.creditTopup(flushed);   // V7 — nạp ví: cộng tiền nạp, không có referral / thu nhập mentor
                    } else {
                        referralService.onSuccessfulTransaction(flushed);
                        earnings.recordPending(flushed);
                    }
                } else {
                    t.setStatus(Transaction.Status.FAILED);
                    t.setFailureReason(failureReason == null ? "PAYMENT_FAILED" : failureReason);
                    t.setSessionSynced(true);
                }
                return Settle.APPLIED;
            });
        } catch (DataIntegrityViolationException e) {
            result = Settle.DUPLICATE;
            Transaction dup = tx.execute(s -> {
                Transaction t = transactions.lockById(id).orElseThrow();
                if (providerReference != null && !providerReference.isBlank()) t.setProviderReference(providerReference);
                t.setStatus(Transaction.Status.FAILED);
                t.setFailureReason("DUPLICATE_PAYMENT");
                t.setSessionSynced(true);
                return t;
            });
            log.warn("Duplicate {} payment {} for session {} — refunding in full", dup.getProvider(), id, dup.getSessionId());
            RedirectGateway gw = gateways.get(dup.getProvider());
            PaymentGateway.ChargeResult refund = gw == null
                    ? new PaymentGateway.ChargeResult(false, null, "NO_GATEWAY")
                    : gw.refund(dup, dup.getAmount(), true, "system");
            audit.system("DUPLICATE_PAYMENT_REFUND", "TRANSACTION", id, AuditClient.fields("sessionId", dup.getSessionId(),
                    "amount", dup.getAmount(), "refunded", refund.success(), "reason", refund.failureReason()));
        }
        if (result == Settle.APPLIED) {
            Transaction t = transactions.findById(id).orElseThrow();
            if (t.isTopup()) {
                if (t.getStatus() == Transaction.Status.SUCCESS) {
                    audit.record(t.getPayerId(), "MENTEE", "WALLET_TOPUP", "TRANSACTION", t.getId().toString(), null,
                            AuditClient.fields("amount", t.getAmount(), "provider", t.getProvider()));
                }
                log.info("{} topup {} → {}", t.getProvider(), id, t.getStatus());
                return result;
            }
            if (t.getStatus() == Transaction.Status.SUCCESS) {
                audit.record(t.getPayerId(), "MENTEE", "CHARGE_SUCCEEDED", "TRANSACTION", t.getId().toString(), null,
                        AuditClient.fields("sessionId", t.getSessionId(), "amount", t.getAmount(), "fee", t.getFee(),
                                "mentorEarning", t.getMentorEarning(), "provider", t.getProvider()));
                if (t.getMentorEarning().signum() > 0) {
                    audit.system("EARNING_PENDING", "TRANSACTION", t.getId(), AuditClient.fields("sessionId", t.getSessionId(),
                            "mentorId", t.getMentorId(), "amount", t.getMentorEarning()));
                }
                payments.syncSession(t.getId());
            }
            log.info("{} transaction {} → {}", t.getProvider(), id, t.getStatus());
        }
        return result;
    }

    private void logIpn(String provider, String txnRef, Map<String, String> params, IpnResult result) {
        try {
            String query = params.entrySet().stream().map(e -> e.getKey() + "=" + e.getValue()).collect(Collectors.joining("&"));
            jdbc.update("INSERT INTO payment_ipn_log (provider, txn_ref, query, result) VALUES (?, ?, ?, ?)",
                    provider, txnRef, query, result.name());
        } catch (Exception e) {
            log.warn("Could not log {} IPN: {}", provider, e.getMessage());
        }
    }
}
