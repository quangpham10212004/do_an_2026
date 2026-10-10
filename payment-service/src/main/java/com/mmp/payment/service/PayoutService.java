package com.mmp.payment.service;

import com.mmp.payment.client.AuditClient;
import com.mmp.payment.client.MentoringClient;
import com.mmp.payment.client.ProfileClient;
import com.mmp.payment.dto.PayoutDtos.*;
import com.mmp.payment.entity.*;
import com.mmp.payment.exception.ApiException;
import com.mmp.payment.repository.*;
import com.mmp.payment.security.AuthUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * US-42 (PRD-PAY-5) — rút tiền sandbox: mentor lưu tài khoản ngân hàng (che số), yêu cầu rút toàn bộ số dư khả dụng khi
 * ≥ 200.000đ (tối đa 1 yêu cầu mở); admin đánh dấu PAID kèm mã tham chiếu → ghi dòng PAYOUT vào sổ thu nhập (append-only)
 * phân bổ FIFO theo giao dịch, hoặc từ chối kèm lý do. Gọi mentoring-service (thông báo) NGOÀI transaction.
 */
@Service
public class PayoutService {

    private final BankAccountRepository banks;
    private final PayoutRepository payouts;
    private final LedgerRepository ledger;
    private final TransactionRepository transactions;
    private final EarningService earnings;
    private final MentoringClient mentoring;
    private final ProfileClient profiles;
    private final AuditClient audit;
    private final TransactionTemplate tx;

    public PayoutService(BankAccountRepository banks, PayoutRepository payouts, LedgerRepository ledger,
                         TransactionRepository transactions, EarningService earnings, MentoringClient mentoring,
                         ProfileClient profiles, AuditClient audit, TransactionTemplate tx) {
        this.banks = banks;
        this.payouts = payouts;
        this.ledger = ledger;
        this.transactions = transactions;
        this.earnings = earnings;
        this.mentoring = mentoring;
        this.profiles = profiles;
        this.audit = audit;
        this.tx = tx;
    }

    // ------------------------------------------------------------------ mentor

    public BankAccountView saveBankAccount(UUID mentorId, BankAccountInput in) {
        String bank = PayoutRules.requireText(in.bankName(), "Tên ngân hàng");
        String number = PayoutRules.normalizeAccountNumber(in.accountNumber());
        String holder = PayoutRules.requireText(in.holderName(), "Tên chủ tài khoản").toUpperCase(Locale.ROOT);
        BankAccount saved = tx.execute(s -> {
            BankAccount b = banks.findById(mentorId).orElseGet(() -> new BankAccount(mentorId));
            b.update(bank, number, holder, OffsetDateTime.now());
            return banks.save(b);
        });
        audit.record(mentorId, "MENTOR", "BANK_ACCOUNT_UPDATED", "MENTOR", mentorId.toString(), null,
                AuditClient.fields("bankName", bank, "account", PayoutRules.mask(number)));
        return bankView(saved);
    }

    public PayoutOverview overview(UUID mentorId) {
        BigDecimal available = earnings.summary(mentorId).available();
        Optional<Payout> open = payouts.findFirstByMentorIdAndStatus(mentorId, Payout.Status.REQUESTED);
        BigDecimal requested = open.map(Payout::getAmount).orElse(BigDecimal.ZERO);
        BankAccountView bank = banks.findById(mentorId).map(PayoutService::bankView).orElse(null);
        boolean can = open.isEmpty() && bank != null && available.compareTo(PayoutRules.MINIMUM) >= 0;
        List<PayoutView> history = payouts.findByMentorIdOrderByRequestedAtDesc(mentorId).stream()
                .map(p -> PayoutView.from(p, null, false)).toList();
        return new PayoutOverview(available, requested, PayoutRules.MINIMUM, can, bank,
                open.map(p -> PayoutView.from(p, null, false)).orElse(null), history);
    }

    public PayoutView request(AuthUser mentor) {
        UUID mentorId = mentor.userId();
        Payout saved = tx.execute(s -> {
            payouts.lockMentor(mentorId);
            if (payouts.findFirstByMentorIdAndStatus(mentorId, Payout.Status.REQUESTED).isPresent()) {
                throw ApiException.conflict("PAYOUT_ALREADY_OPEN", "Bạn đang có một yêu cầu rút tiền chờ xử lý");
            }
            BankAccount bank = banks.findById(mentorId).orElseThrow(() ->
                    ApiException.badRequest("BANK_ACCOUNT_REQUIRED", "Hãy thêm tài khoản ngân hàng trước khi rút tiền"));
            BigDecimal available = earnings.summary(mentorId).available();
            PayoutRules.requireMinimum(available);
            return payouts.save(new Payout(mentorId, available, bank, OffsetDateTime.now()));
        });
        audit.record(mentorId, "MENTOR", "PAYOUT_REQUESTED", "PAYOUT", saved.getId().toString(), null,
                AuditClient.fields("amount", saved.getAmount()));
        mentoring.notify(null, "ADMIN", "PAYOUT_REQUESTED", "Có yêu cầu rút tiền mới",
                "Mentor yêu cầu rút " + saved.getAmount().toPlainString() + "đ.", "/admin/payouts");
        return PayoutView.from(saved, null, false);
    }

    // ------------------------------------------------------------------ admin

    public List<PayoutView> adminList(String status) {
        List<Payout> list;
        if (status == null || status.isBlank()) {
            list = payouts.findAllByOrderByRequestedAtDesc();
        } else {
            try {
                list = payouts.findByStatusOrderByRequestedAtAsc(Payout.Status.valueOf(status));
            } catch (IllegalArgumentException e) {
                throw ApiException.badRequest("INVALID_STATUS", "Trạng thái không hợp lệ: " + status);
            }
        }
        Map<UUID, String> names = new HashMap<>();
        return list.stream().map(p -> PayoutView.from(p,
                names.computeIfAbsent(p.getMentorId(), profiles::displayName), true)).toList();
    }

    public PayoutView markPaid(AuthUser admin, UUID payoutId, MarkPaidInput in) {
        String reference = in.reference().strip();
        String note = in.note() == null || in.note().isBlank() ? null : in.note().strip();
        Payout saved = tx.execute(s -> {
            Payout p = requireOpen(payoutId);
            payouts.lockMentor(p.getMentorId());
            Map<UUID, BigDecimal> allocation = PayoutRules.allocate(availableByTransaction(p.getMentorId()), p.getAmount());
            Map<UUID, Transaction> txs = transactions.findAllById(allocation.keySet()).stream()
                    .collect(Collectors.toMap(Transaction::getId, t -> t));
            allocation.forEach((txId, amount) -> ledger.save(LedgerEntry.payout(txs.get(txId), amount, p.getId())));
            p.decide(Payout.Status.PAID, reference, note, admin.userId(), OffsetDateTime.now());
            return payouts.save(p);
        });
        audit.record(admin.userId(), "ADMIN", "PAYOUT_PAID", "PAYOUT", payoutId.toString(),
                AuditClient.fields("status", "REQUESTED"),
                AuditClient.fields("status", "PAID", "amount", saved.getAmount(), "reference", reference));
        mentoring.notify(saved.getMentorId(), null, "PAYOUT_PAID", "Đã chuyển tiền rút",
                saved.getAmount().toPlainString() + "đ đã được chuyển vào tài khoản " + PayoutRules.mask(saved.getAccountNumber())
                        + " (mã tham chiếu " + reference + ").", "/earnings");
        return PayoutView.from(saved, profiles.displayName(saved.getMentorId()), true);
    }

    public PayoutView reject(AuthUser admin, UUID payoutId, RejectInput in) {
        String reason = in.reason().strip();
        Payout saved = tx.execute(s -> {
            Payout p = requireOpen(payoutId);
            p.decide(Payout.Status.REJECTED, null, reason, admin.userId(), OffsetDateTime.now());
            return payouts.save(p);
        });
        audit.record(admin.userId(), "ADMIN", "PAYOUT_REJECTED", "PAYOUT", payoutId.toString(),
                AuditClient.fields("status", "REQUESTED"), AuditClient.fields("status", "REJECTED", "reason", reason));
        mentoring.notify(saved.getMentorId(), null, "PAYOUT_REJECTED", "Yêu cầu rút tiền bị từ chối", reason, "/earnings");
        return PayoutView.from(saved, profiles.displayName(saved.getMentorId()), true);
    }

    // ------------------------------------------------------------------

    /** Số dư khả dụng từng giao dịch của mentor, giao dịch cũ trước (thứ tự phân bổ FIFO). */
    private Map<UUID, BigDecimal> availableByTransaction(UUID mentorId) {
        Map<UUID, List<LedgerEntry>> byTx = ledger.findByMentorIdOrderByCreatedAtAsc(mentorId).stream()
                .collect(Collectors.groupingBy(LedgerEntry::getTransactionId, LinkedHashMap::new, Collectors.toList()));
        Map<UUID, BigDecimal> out = new LinkedHashMap<>();
        byTx.forEach((txId, entries) -> {
            BigDecimal a = EarningRules.balance(entries).available();
            if (a.signum() > 0) out.put(txId, a);
        });
        return out;
    }

    private Payout requireOpen(UUID payoutId) {
        Payout p = payouts.findForUpdate(payoutId)
                .orElseThrow(() -> ApiException.notFound("PAYOUT_NOT_FOUND", "Không tìm thấy yêu cầu rút tiền"));
        if (p.getStatus() != Payout.Status.REQUESTED) {
            throw ApiException.conflict("PAYOUT_NOT_OPEN", "Yêu cầu rút tiền đã được xử lý");
        }
        return p;
    }

    private static BankAccountView bankView(BankAccount b) {
        return new BankAccountView(b.getBankName(), PayoutRules.mask(b.getAccountNumber()), b.getHolderName(), b.getUpdatedAt());
    }
}
