package com.mmp.payment.service;

import com.mmp.payment.client.AuditClient;
import com.mmp.payment.client.MentoringClient;
import com.mmp.payment.client.MentoringClient.SessionInfo;
import com.mmp.payment.dto.PaymentDtos.*;
import com.mmp.payment.entity.ChargeIdempotencyKey;
import com.mmp.payment.entity.LedgerEntry;
import com.mmp.payment.entity.Refund;
import com.mmp.payment.entity.Transaction;
import com.mmp.payment.exception.ApiException;
import com.mmp.payment.gateway.PaymentGateway;
import com.mmp.payment.repository.ChargeIdempotencyKeyRepository;
import com.mmp.payment.repository.RefundRepository;
import com.mmp.payment.repository.TransactionRepository;
import com.mmp.payment.security.AuthUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Thanh toán phiên mentoring (FR-6.1 → FR-6.3, US-13).
 *
 * Luồng charge: Idempotency-Key (cùng người gọi + key trong 24 giờ → trả giao dịch lần đầu) → kiểm tra phiên (qua
 * mentoring-service) → tạo giao dịch PENDING với phí nền tảng chốt tại thời điểm này → gọi gateway → SUCCESS/FAILED →
 * nếu SUCCESS: xử lý referral và báo mentoring-service xác nhận phiên. Nếu bước báo xác nhận lỗi, giao dịch giữ cờ
 * session_synced=false và PaymentReconciliationJob sẽ gửi lại.
 */
@Service
public class PaymentService {

    private static final Logger log = LoggerFactory.getLogger(PaymentService.class);

    private final TransactionRepository transactionRepository;
    private final RefundRepository refundRepository;
    private final ChargeIdempotencyKeyRepository idemRepository;
    private final PaymentGateway gateway;
    private final MentoringClient mentoringClient;
    private final ReferralService referralService;
    private final EarningService earnings;
    private final AuditClient audit;
    private final TransactionTemplate tx;
    private final BigDecimal feeRate;
    private final Duration idempotencyTtl;

    public PaymentService(TransactionRepository transactionRepository, RefundRepository refundRepository,
                          ChargeIdempotencyKeyRepository idemRepository, PaymentGateway gateway,
                          MentoringClient mentoringClient, ReferralService referralService, EarningService earnings,
                          AuditClient audit, TransactionTemplate tx,
                          @Value("${app.payment.platform-fee-rate:0.15}") BigDecimal feeRate,
                          @Value("${app.payment.idempotency-ttl:PT24H}") Duration idempotencyTtl) {
        this.transactionRepository = transactionRepository;
        this.refundRepository = refundRepository;
        this.idemRepository = idemRepository;
        this.gateway = gateway;
        this.mentoringClient = mentoringClient;
        this.referralService = referralService;
        this.earnings = earnings;
        this.audit = audit;
        this.tx = tx;
        PaymentRules.split(BigDecimal.ZERO, feeRate); // kiểm tra cấu hình ngay khi khởi động
        this.feeRate = feeRate;
        this.idempotencyTtl = idempotencyTtl;
    }

    /**
     * US-13 — charge idempotent theo (người gọi, Idempotency-Key). Key đã dùng trong 24 giờ: cùng phiên → trả giao dịch
     * đã tạo (không charge lần 2); khác phiên → 409 IDEMPOTENCY_KEY_REUSED; lần đầu chưa xử lý xong → 409
     * IDEMPOTENCY_IN_PROGRESS. Lỗi kiểm tra trước khi tạo giao dịch (phiên không hợp lệ...) không "tiêu" key.
     */
    public TransactionResponse charge(AuthUser payer, String idempotencyKey, ChargeRequest req) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw ApiException.badRequest("IDEMPOTENCY_KEY_REQUIRED", "Thiếu header Idempotency-Key");
        }
        String key = idempotencyKey.trim();
        if (!PaymentRules.validIdempotencyKey(key)) {
            throw ApiException.badRequest("INVALID_IDEMPOTENCY_KEY", "Idempotency-Key không hợp lệ (tối đa "
                    + PaymentRules.IDEMPOTENCY_KEY_MAX + " ký tự in được)");
        }
        Optional<TransactionResponse> replay = claimKey(payer.userId(), key, req.sessionId());
        if (replay.isPresent()) return replay.get();
        try {
            return doCharge(payer, key, req);
        } catch (RuntimeException e) {
            // Chưa tạo được giao dịch → trả key lại để người dùng sửa lỗi và thử lại với cùng key
            tx.executeWithoutResult(s -> idemRepository.findByUserIdAndIdemKey(payer.userId(), key)
                    .filter(k -> k.getTransactionId() == null)
                    .ifPresent(idemRepository::delete));
            throw e;
        }
    }

    /** Giữ key cho lần gọi này; trả về kết quả cũ nếu key đã được dùng. */
    Optional<TransactionResponse> claimKey(UUID userId, String key, UUID sessionId) {
        OffsetDateTime now = OffsetDateTime.now();
        Optional<ChargeIdempotencyKey> existing = idemRepository.findByUserIdAndIdemKey(userId, key);
        if (existing.isPresent()) {
            if (PaymentRules.idempotencyKeyLive(existing.get().getCreatedAt(), idempotencyTtl, now)) {
                return Optional.of(replay(existing.get(), sessionId));
            }
            tx.executeWithoutResult(s -> idemRepository.deleteById(existing.get().getId())); // hết hạn → dùng lại được
        }
        try {
            tx.executeWithoutResult(s -> idemRepository.saveAndFlush(new ChargeIdempotencyKey(userId, key, sessionId)));
            return Optional.empty();
        } catch (DataIntegrityViolationException e) {
            // Request song song cùng key vừa giữ trước
            return Optional.of(idemRepository.findByUserIdAndIdemKey(userId, key)
                    .map(k -> replay(k, sessionId))
                    .orElseThrow(() -> ApiException.conflict("IDEMPOTENCY_IN_PROGRESS", "Yêu cầu thanh toán đang được xử lý, vui lòng đợi")));
        }
    }

    private TransactionResponse replay(ChargeIdempotencyKey k, UUID sessionId) {
        if (!k.getSessionId().equals(sessionId)) {
            throw ApiException.conflict("IDEMPOTENCY_KEY_REUSED", "Idempotency-Key đã được dùng cho một phiên khác");
        }
        if (k.getTransactionId() == null) {
            throw ApiException.conflict("IDEMPOTENCY_IN_PROGRESS", "Yêu cầu thanh toán đang được xử lý, vui lòng đợi");
        }
        log.info("Idempotent replay of charge key for transaction {}", k.getTransactionId());
        return view(transactionRepository.findById(k.getTransactionId()).orElseThrow());
    }

    private TransactionResponse doCharge(AuthUser payer, String key, ChargeRequest req) {
        SessionInfo session = mentoringClient.getSession(req.sessionId());
        if (!payer.isAdmin() && !session.menteeId().equals(payer.userId())) {
            throw ApiException.forbidden("Bạn chỉ có thể thanh toán cho phiên của chính mình");
        }
        if (!"PENDING".equals(session.status())) {
            throw ApiException.conflict("SESSION_NOT_PAYABLE", "Phiên không ở trạng thái chờ thanh toán");
        }
        if (session.price() == null || session.price().signum() <= 0) {
            throw ApiException.badRequest("FREE_SESSION", "Phiên miễn phí, không cần thanh toán");
        }
        if (req.amount() != null && req.amount().compareTo(session.price()) != 0) {
            throw ApiException.badRequest("AMOUNT_MISMATCH", "Số tiền không khớp với giá của phiên");
        }
        if (transactionRepository.existsBySessionIdAndStatusIn(session.id(), Transaction.PAID_STATUSES)) {
            throw ApiException.conflict("ALREADY_PAID", "Phiên này đã được thanh toán");
        }
        PaymentRules.FeeSplit split = PaymentRules.split(session.price(), feeRate);

        Transaction pending = tx.execute(s -> {
            Transaction t = new Transaction();
            t.setSessionId(session.id());
            t.setPayerId(session.menteeId());
            t.setMentorId(session.mentorId());
            t.setAmount(session.price());
            t.applyFee(split.rate(), split.fee(), split.mentorEarning());
            Transaction saved = transactionRepository.save(t);
            idemRepository.findByUserIdAndIdemKey(payer.userId(), key).ifPresent(k -> k.setTransactionId(saved.getId()));
            return saved;
        });

        CardInput card = req.card();
        PaymentGateway.ChargeResult result = gateway.charge(pending.getId(), pending.getAmount(), pending.getCurrency(),
                new PaymentGateway.CardDetails(card.cardNumber(), card.cardHolder(), card.expiry(), card.cvv()));

        Transaction updated;
        try {
            updated = tx.execute(s -> {
                Transaction t = transactionRepository.findById(pending.getId()).orElseThrow();
                t.setProviderReference(result.providerReference());
                if (result.success()) {
                    t.setStatus(Transaction.Status.SUCCESS);
                    Transaction flushed = transactionRepository.saveAndFlush(t);
                    referralService.onSuccessfulTransaction(flushed);
                    earnings.recordPending(flushed); // US-25 — EARNING_PENDING khi phiên được xác nhận
                } else {
                    t.setStatus(Transaction.Status.FAILED);
                    t.setFailureReason(result.failureReason());
                    t.setSessionSynced(true);
                }
                return t;
            });
        } catch (DataIntegrityViolationException e) {
            // Unique index chỉ cho 1 giao dịch "đã thu tiền"/phiên — request song song đã thanh toán trước
            tx.executeWithoutResult(s -> transactionRepository.findById(pending.getId()).ifPresent(t -> {
                t.setStatus(Transaction.Status.FAILED);
                t.setFailureReason("DUPLICATE_PAYMENT");
                t.setSessionSynced(true);
            }));
            throw ApiException.conflict("ALREADY_PAID", "Phiên này đã được thanh toán");
        }

        if (updated.getStatus() == Transaction.Status.SUCCESS) {
            audit.record(payer.userId(), payer.role(), "CHARGE_SUCCEEDED", "TRANSACTION", updated.getId().toString(), null,
                    AuditClient.fields("sessionId", updated.getSessionId(), "amount", updated.getAmount(), "fee", updated.getFee(),
                            "mentorEarning", updated.getMentorEarning()));
            if (updated.getMentorEarning().signum() > 0) {
                audit.system("EARNING_PENDING", "TRANSACTION", updated.getId(), AuditClient.fields("sessionId", updated.getSessionId(),
                        "mentorId", updated.getMentorId(), "amount", updated.getMentorEarning()));
            }
            syncSession(updated.getId());
        }
        return view(transactionRepository.findById(updated.getId()).orElseThrow());
    }

    /** Sprint 1 — hoàn 100% (giữ cho caller cũ). */
    public TransactionResponse refund(UUID sessionId, String reason) {
        return refund(sessionId, reason, null, null, null);
    }

    /**
     * US-13 — hoàn tiền phiên (gọi nội bộ từ mentoring-service): theo {@code amount} hoặc {@code percent} giá gốc
     * (mặc định 100%). Ghi 1 dòng refunds; giao dịch chuyển PARTIALLY_REFUNDED hoặc REFUNDED (khi tổng hoàn = giá gốc),
     * không ghi đè failure_reason. Khoá dòng giao dịch để tổng hoàn không vượt giá gốc khi có request song song.
     * Gateway sandbox chạy trong tiến trình nên được gọi trong transaction; gateway thật cần bản ghi refund PENDING.
     */
    public TransactionResponse refund(UUID sessionId, String reason, Integer percent, BigDecimal amount, UUID actorId) {
        List<Object> moved = new java.util.ArrayList<>(); // [Refund, Optional<LedgerEntry>, statusBefore]
        Transaction updated = tx.execute(s -> {
            Transaction t = transactionRepository.lockBySessionIdAndStatusIn(sessionId, Transaction.PAID_STATUSES).stream()
                    .findFirst()
                    .orElseThrow(() -> ApiException.notFound("NO_SUCCESS_TRANSACTION", "Phiên chưa có giao dịch thành công"));
            if (t.getStatus() == Transaction.Status.ON_HOLD) {
                throw ApiException.conflict("TRANSACTION_ON_HOLD", "Giao dịch đang bị tạm giữ do tranh chấp, cần giải phóng trước khi hoàn tiền");
            }
            BigDecimal refunded = refundRepository.sumByTransactionId(t.getId());
            PaymentRules.RefundCalc calc = PaymentRules.refundAmount(t.getAmount(), refunded, percent, amount);
            if (!calc.ok()) {
                throw "REFUND_EXCEEDS_AMOUNT".equals(calc.errorCode())
                        ? ApiException.conflict("REFUND_EXCEEDS_AMOUNT", "Tổng số tiền hoàn vượt quá số tiền đã thanh toán (đã hoàn "
                        + refunded.toPlainString() + "/" + t.getAmount().toPlainString() + ")")
                        : ApiException.badRequest("INVALID_REFUND_AMOUNT", "Số tiền / phần trăm hoàn không hợp lệ (chỉ gửi amount > 0 hoặc percent 1–100)");
            }
            PaymentGateway.ChargeResult result = gateway.refund(t.getProviderReference(), calc.amount());
            if (!result.success()) {
                throw new ApiException(HttpStatus.BAD_GATEWAY, "REFUND_FAILED", "Cổng thanh toán từ chối hoàn tiền");
            }
            Refund saved = refundRepository.save(new Refund(t.getId(), calc.amount(), reason == null ? "SESSION_CANCELLED" : reason, actorId,
                    result.providerReference()));
            moved.add(saved);
            moved.add(earnings.recordReversal(t, saved, refunded)); // US-25 — REVERSAL theo tỉ lệ phần hoàn
            moved.add(t.getStatus().name());
            t.setStatus(PaymentRules.statusAfterRefund(t.getAmount(), refunded.add(calc.amount())));
            log.info("Refunded {} of transaction {} (session {}) → {}", calc.amount(), t.getId(), sessionId, t.getStatus());
            return t;
        });
        Refund r = (Refund) moved.get(0);
        audit.record(actorId, actorId == null ? "SYSTEM" : "ADMIN", "REFUND_CREATED", "TRANSACTION", updated.getId().toString(),
                AuditClient.fields("status", moved.get(2)),
                AuditClient.fields("status", updated.getStatus(), "sessionId", sessionId, "refundId", r.getId(), "amount", r.getAmount(),
                        "reason", r.getReason()));
        @SuppressWarnings("unchecked")
        Optional<LedgerEntry> reversal = (Optional<LedgerEntry>) moved.get(1);
        reversal.ifPresent(x -> audit.system("EARNING_REVERSED", "TRANSACTION", updated.getId(),
                AuditClient.fields("sessionId", sessionId, "mentorId", x.getMentorId(), "amount", x.getAmount(), "refundId", r.getId())));
        return view(updated);
    }

    /** US-12 — phiên tranh chấp: SUCCESS → ON_HOLD (đã ON_HOLD → trả về như cũ). */
    public TransactionResponse hold(UUID sessionId, String reason) {
        boolean[] changed = {false};
        Transaction t = tx.execute(s -> {
            Transaction x = transactionRepository.lockBySessionIdAndStatusIn(sessionId, Transaction.PAID_STATUSES).stream()
                    .findFirst()
                    .orElseThrow(() -> ApiException.notFound("NO_SUCCESS_TRANSACTION", "Phiên chưa có giao dịch thành công"));
            switch (x.getStatus()) {
                case ON_HOLD -> { }
                case SUCCESS -> {
                    x.hold(reason == null ? "SESSION_DISPUTED" : reason);
                    changed[0] = true;
                }
                default -> throw ApiException.conflict("TRANSACTION_NOT_HOLDABLE", "Chỉ tạm giữ được giao dịch thành công chưa hoàn tiền");
            }
            return x;
        });
        if (changed[0]) {
            audit.record(null, "SYSTEM", "PAYMENT_HELD", "TRANSACTION", t.getId().toString(), AuditClient.fields("status", "SUCCESS"),
                    AuditClient.fields("status", "ON_HOLD", "sessionId", sessionId, "reason", t.getHoldReason()));
        }
        return view(t);
    }

    /** US-12 — hết tranh chấp: ON_HOLD → SUCCESS (đã SUCCESS → trả về như cũ). */
    public TransactionResponse release(UUID sessionId) {
        boolean[] changed = {false};
        Transaction t = tx.execute(s -> {
            Transaction x = transactionRepository.lockBySessionIdAndStatusIn(sessionId, Transaction.PAID_STATUSES).stream()
                    .findFirst()
                    .orElseThrow(() -> ApiException.notFound("NO_SUCCESS_TRANSACTION", "Phiên chưa có giao dịch thành công"));
            switch (x.getStatus()) {
                case SUCCESS -> { }
                case ON_HOLD -> {
                    x.release();
                    changed[0] = true;
                }
                default -> throw ApiException.conflict("TRANSACTION_NOT_ON_HOLD", "Giao dịch không ở trạng thái tạm giữ");
            }
            return x;
        });
        if (changed[0]) {
            audit.record(null, "SYSTEM", "PAYMENT_RELEASED", "TRANSACTION", t.getId().toString(), AuditClient.fields("status", "ON_HOLD"),
                    AuditClient.fields("status", "SUCCESS", "sessionId", sessionId));
        }
        return view(t);
    }

    /** Gửi xác nhận sang mentoring-service; thất bại sẽ được job đối soát thử lại. */
    public void syncSession(UUID transactionId) {
        Transaction t = transactionRepository.findById(transactionId).orElseThrow();
        try {
            mentoringClient.notifyPaymentSucceeded(t.getSessionId(), t.getId());
            tx.executeWithoutResult(s -> transactionRepository.findById(transactionId).ifPresent(x -> x.setSessionSynced(true)));
        } catch (Exception e) {
            log.warn("Could not confirm session {} after payment {}: {}", t.getSessionId(), t.getId(), e.getMessage());
        }
    }

    public List<Transaction> unsyncedSuccessTransactions() {
        return transactionRepository.findByStatusInAndSessionSyncedFalse(List.of(Transaction.Status.SUCCESS));
    }

    /** Dọn Idempotency-Key quá hạn (gọi từ job đối soát). */
    public int purgeExpiredIdempotencyKeys() {
        Integer n = tx.execute(s -> idemRepository.deleteOlderThan(OffsetDateTime.now().minus(idempotencyTtl)));
        return n == null ? 0 : n;
    }

    public TransactionResponse get(AuthUser user, UUID id) {
        Transaction t = transactionRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("TRANSACTION_NOT_FOUND", "Không tìm thấy giao dịch"));
        if (!user.isAdmin() && !user.userId().equals(t.getPayerId()) && !user.userId().equals(t.getMentorId())) {
            throw ApiException.forbidden("Bạn không có quyền xem giao dịch này");
        }
        return view(t);
    }

    public List<TransactionResponse> mine(AuthUser user) {
        List<Transaction> list = "MENTOR".equals(user.role())
                ? transactionRepository.findByMentorIdOrderByCreatedAtDesc(user.userId())
                : transactionRepository.findByPayerIdOrderByCreatedAtDesc(user.userId());
        return views(list);
    }

    public List<TransactionResponse> bySession(AuthUser user, UUID sessionId) {
        return views(transactionRepository.findBySessionIdOrderByCreatedAtDesc(sessionId).stream()
                .filter(t -> user.isAdmin() || user.userId().equals(t.getPayerId()) || user.userId().equals(t.getMentorId()))
                .toList());
    }

    public PageResponse<TransactionResponse> search(String status, int page, int size) {
        Transaction.Status s = status == null || status.isBlank() ? null : Transaction.Status.valueOf(status.toUpperCase());
        Page<Transaction> result = transactionRepository.search(s, PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100)));
        return new PageResponse<>(views(result.getContent()), result.getNumber(),
                result.getSize(), result.getTotalElements(), result.getTotalPages());
    }

    public PaymentStats stats() {
        return new PaymentStats(transactionRepository.countByStatus(Transaction.Status.SUCCESS),
                transactionRepository.countByStatus(Transaction.Status.FAILED),
                transactionRepository.countByStatus(Transaction.Status.REFUNDED),
                transactionRepository.sumByStatus(Transaction.Status.SUCCESS),
                transactionRepository.countByStatus(Transaction.Status.PARTIALLY_REFUNDED),
                transactionRepository.countByStatus(Transaction.Status.ON_HOLD),
                transactionRepository.sumFeeByStatusIn(List.of(Transaction.Status.SUCCESS, Transaction.Status.PARTIALLY_REFUNDED)));
    }

    private TransactionResponse view(Transaction t) {
        return views(List.of(t)).get(0);
    }

    private List<TransactionResponse> views(List<Transaction> list) {
        if (list.isEmpty()) return List.of();
        Map<UUID, List<Refund>> refunds = refundRepository.findByTransactionIdInOrderByCreatedAtAsc(
                        list.stream().map(Transaction::getId).toList()).stream()
                .collect(Collectors.groupingBy(Refund::getTransactionId));
        return list.stream().map(t -> TransactionResponse.from(t, refunds.getOrDefault(t.getId(), List.of()))).toList();
    }
}
