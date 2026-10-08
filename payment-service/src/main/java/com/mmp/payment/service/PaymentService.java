package com.mmp.payment.service;

import com.mmp.payment.client.MentoringClient;
import com.mmp.payment.client.MentoringClient.SessionInfo;
import com.mmp.payment.dto.PaymentDtos.*;
import com.mmp.payment.entity.Transaction;
import com.mmp.payment.exception.ApiException;
import com.mmp.payment.gateway.PaymentGateway;
import com.mmp.payment.repository.TransactionRepository;
import com.mmp.payment.security.AuthUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.UUID;

/**
 * Thanh toán phiên mentoring (FR-6.1 → FR-6.3).
 *
 * Luồng charge: kiểm tra phiên (qua mentoring-service) → tạo giao dịch PENDING →
 * gọi gateway → cập nhật SUCCESS/FAILED → nếu SUCCESS: xử lý referral và báo
 * mentoring-service xác nhận phiên. Nếu bước báo xác nhận lỗi, giao dịch giữ cờ
 * session_synced=false và PaymentReconciliationJob sẽ gửi lại.
 */
@Service
public class PaymentService {

    private static final Logger log = LoggerFactory.getLogger(PaymentService.class);

    /** Trạng thái giao dịch đã thu tiền thành công (kể cả đã hoàn một phần). */
    private static final List<Transaction.Status> PAID_STATUSES =
            List.of(Transaction.Status.SUCCESS, Transaction.Status.PARTIALLY_REFUNDED);

    private final TransactionRepository transactionRepository;
    private final PaymentGateway gateway;
    private final MentoringClient mentoringClient;
    private final ReferralService referralService;
    private final TransactionTemplate tx;

    public PaymentService(TransactionRepository transactionRepository, PaymentGateway gateway,
                          MentoringClient mentoringClient, ReferralService referralService, TransactionTemplate tx) {
        this.transactionRepository = transactionRepository;
        this.gateway = gateway;
        this.mentoringClient = mentoringClient;
        this.referralService = referralService;
        this.tx = tx;
    }

    /** Đối tượng được thanh toán, đã xác thực với mentoring-service. */
    private record Target(UUID sessionId, UUID packageId, UUID payerId, UUID mentorId, java.math.BigDecimal price) {
    }

    public TransactionResponse charge(AuthUser payer, ChargeRequest req) {
        if ((req.sessionId() == null) == (req.packageId() == null)) {
            throw ApiException.badRequest("INVALID_TARGET", "Chỉ chọn một trong phiên hoặc gói để thanh toán");
        }
        Target target = req.sessionId() != null ? sessionTarget(payer, req) : packageTarget(payer, req);

        Transaction pending = tx.execute(s -> {
            Transaction t = new Transaction();
            t.setSessionId(target.sessionId());
            t.setPackageId(target.packageId());
            t.setPayerId(target.payerId());
            t.setMentorId(target.mentorId());
            t.setAmount(target.price());
            return transactionRepository.save(t);
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
                    referralService.onSuccessfulTransaction(transactionRepository.saveAndFlush(t));
                } else {
                    t.setStatus(Transaction.Status.FAILED);
                    t.setFailureReason(result.failureReason());
                    t.setSessionSynced(true);
                }
                return t;
            });
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            // Unique index chỉ cho 1 giao dịch SUCCESS/phiên (hoặc gói) — request song song đã thanh toán trước
            tx.executeWithoutResult(s -> transactionRepository.findById(pending.getId()).ifPresent(t -> {
                t.setStatus(Transaction.Status.FAILED);
                t.setFailureReason("DUPLICATE_PAYMENT");
                t.setSessionSynced(true);
            }));
            throw ApiException.conflict("ALREADY_PAID", target.sessionId() != null
                    ? "Phiên này đã được thanh toán" : "Gói này đã được thanh toán");
        }

        if (updated.getStatus() == Transaction.Status.SUCCESS) {
            syncSession(updated.getId());
        }
        return TransactionResponse.from(transactionRepository.findById(updated.getId()).orElseThrow());
    }

    private Target sessionTarget(AuthUser payer, ChargeRequest req) {
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
        if (transactionRepository.existsBySessionIdAndStatus(session.id(), Transaction.Status.SUCCESS)) {
            throw ApiException.conflict("ALREADY_PAID", "Phiên này đã được thanh toán");
        }
        return new Target(session.id(), null, session.menteeId(), session.mentorId(), session.price());
    }

    private Target packageTarget(AuthUser payer, ChargeRequest req) {
        MentoringClient.PackageInfo pack = mentoringClient.getPackage(req.packageId());
        if (!payer.isAdmin() && !pack.menteeId().equals(payer.userId())) {
            throw ApiException.forbidden("Bạn chỉ có thể thanh toán cho gói của chính mình");
        }
        if (!"PENDING_PAYMENT".equals(pack.status())) {
            throw ApiException.conflict("PACKAGE_NOT_PAYABLE", "Gói không ở trạng thái chờ thanh toán");
        }
        if (pack.totalPrice() == null || pack.totalPrice().signum() <= 0) {
            throw ApiException.badRequest("FREE_PACKAGE", "Gói miễn phí, không cần thanh toán");
        }
        if (req.amount() != null && req.amount().compareTo(pack.totalPrice()) != 0) {
            throw ApiException.badRequest("AMOUNT_MISMATCH", "Số tiền không khớp với giá của gói");
        }
        if (transactionRepository.existsByPackageIdAndStatusIn(pack.id(), PAID_STATUSES)) {
            throw ApiException.conflict("ALREADY_PAID", "Gói này đã được thanh toán");
        }
        return new Target(null, pack.id(), pack.menteeId(), pack.mentorId(), pack.totalPrice());
    }

    /** Hoàn tiền khi phiên đã thanh toán bị huỷ (gọi nội bộ từ mentoring-service). */
    public TransactionResponse refund(UUID sessionId, String reason) {
        return tx.execute(s -> {
            Transaction t = transactionRepository.findFirstBySessionIdAndStatus(sessionId, Transaction.Status.SUCCESS)
                    .orElseThrow(() -> ApiException.notFound("NO_SUCCESS_TRANSACTION", "Phiên chưa có giao dịch thành công"));
            PaymentGateway.ChargeResult result = gateway.refund(t.getProviderReference(), t.getAmount());
            if (!result.success()) {
                throw new ApiException(HttpStatus.BAD_GATEWAY, "REFUND_FAILED", "Cổng thanh toán từ chối hoàn tiền");
            }
            t.setStatus(Transaction.Status.REFUNDED);
            t.setRefundedAmount(t.getAmount());
            t.setFailureReason(reason == null ? "SESSION_CANCELLED" : reason);
            log.info("Refunded transaction {} for session {}", t.getId(), sessionId);
            return TransactionResponse.from(t);
        });
    }

    /**
     * Hoàn tiền các buổi chưa dùng của một gói. {@code refundedTotal} là tổng số tiền đã hoàn tính luỹ kế mong muốn:
     * chỉ hoàn phần chênh so với số đã hoàn, nên gọi lại cùng giá trị (mentoring-service thử lại sau lỗi mạng) không
     * hoàn trùng.
     */
    public TransactionResponse refundPackage(UUID packageId, java.math.BigDecimal refundedTotal, String reason) {
        return tx.execute(s -> {
            Transaction t = transactionRepository.findFirstByPackageIdAndStatusIn(packageId, PAID_STATUSES)
                    .orElseThrow(() -> ApiException.notFound("NO_SUCCESS_TRANSACTION", "Gói chưa có giao dịch thành công"));
            java.math.BigDecimal target = refundedTotal == null ? t.getAmount() : refundedTotal;
            if (target.signum() < 0 || target.compareTo(t.getAmount()) > 0) {
                throw ApiException.badRequest("INVALID_REFUND_AMOUNT", "Số tiền hoàn không hợp lệ");
            }
            java.math.BigDecimal delta = target.subtract(t.getRefundedAmount());
            if (delta.signum() <= 0) {
                return TransactionResponse.from(t); // đã hoàn đủ từ trước
            }
            PaymentGateway.ChargeResult result = gateway.refund(t.getProviderReference(), delta);
            if (!result.success()) {
                throw new ApiException(HttpStatus.BAD_GATEWAY, "REFUND_FAILED", "Cổng thanh toán từ chối hoàn tiền");
            }
            t.setRefundedAmount(target);
            t.setStatus(target.compareTo(t.getAmount()) == 0 ? Transaction.Status.REFUNDED : Transaction.Status.PARTIALLY_REFUNDED);
            t.setFailureReason(reason == null ? "PACKAGE_REFUND" : reason);
            log.info("Refunded {} of transaction {} for package {}", delta, t.getId(), packageId);
            return TransactionResponse.from(t);
        });
    }

    /** Gửi xác nhận sang mentoring-service (phiên hoặc gói); thất bại sẽ được job đối soát thử lại. */
    public void syncSession(UUID transactionId) {
        Transaction t = transactionRepository.findById(transactionId).orElseThrow();
        try {
            if (t.getPackageId() != null) {
                mentoringClient.notifyPackagePaid(t.getPackageId(), t.getId());
            } else {
                mentoringClient.notifyPaymentSucceeded(t.getSessionId(), t.getId());
            }
            tx.executeWithoutResult(s -> transactionRepository.findById(transactionId).ifPresent(x -> x.setSessionSynced(true)));
        } catch (Exception e) {
            log.warn("Could not confirm target of payment {}: {}", t.getId(), e.getMessage());
        }
    }

    public List<Transaction> unsyncedSuccessTransactions() {
        return transactionRepository.findByStatusInAndSessionSyncedFalse(PAID_STATUSES);
    }

    public TransactionResponse get(AuthUser user, UUID id) {
        Transaction t = transactionRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("TRANSACTION_NOT_FOUND", "Không tìm thấy giao dịch"));
        if (!user.isAdmin() && !user.userId().equals(t.getPayerId()) && !user.userId().equals(t.getMentorId())) {
            throw ApiException.forbidden("Bạn không có quyền xem giao dịch này");
        }
        return TransactionResponse.from(t);
    }

    public List<TransactionResponse> mine(AuthUser user) {
        List<Transaction> list = "MENTOR".equals(user.role())
                ? transactionRepository.findByMentorIdOrderByCreatedAtDesc(user.userId())
                : transactionRepository.findByPayerIdOrderByCreatedAtDesc(user.userId());
        return list.stream().map(TransactionResponse::from).toList();
    }

    public List<TransactionResponse> bySession(AuthUser user, UUID sessionId) {
        return transactionRepository.findBySessionIdOrderByCreatedAtDesc(sessionId).stream()
                .filter(t -> user.isAdmin() || user.userId().equals(t.getPayerId()) || user.userId().equals(t.getMentorId()))
                .map(TransactionResponse::from).toList();
    }

    public List<TransactionResponse> byPackage(AuthUser user, UUID packageId) {
        return transactionRepository.findByPackageIdOrderByCreatedAtDesc(packageId).stream()
                .filter(t -> user.isAdmin() || user.userId().equals(t.getPayerId()) || user.userId().equals(t.getMentorId()))
                .map(TransactionResponse::from).toList();
    }

    public PageResponse<TransactionResponse> search(String status, int page, int size) {
        Transaction.Status s = status == null || status.isBlank() ? null : Transaction.Status.valueOf(status.toUpperCase());
        Page<Transaction> result = transactionRepository.search(s, PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100)));
        return new PageResponse<>(result.map(TransactionResponse::from).getContent(), result.getNumber(),
                result.getSize(), result.getTotalElements(), result.getTotalPages());
    }

    public PaymentStats stats() {
        // Giao dịch đã hoàn một phần vẫn tính là thành công; doanh thu là số tiền ròng sau hoàn
        return new PaymentStats(transactionRepository.countByStatus(Transaction.Status.SUCCESS)
                        + transactionRepository.countByStatus(Transaction.Status.PARTIALLY_REFUNDED),
                transactionRepository.countByStatus(Transaction.Status.FAILED),
                transactionRepository.countByStatus(Transaction.Status.REFUNDED),
                transactionRepository.netRevenue());
    }
}
