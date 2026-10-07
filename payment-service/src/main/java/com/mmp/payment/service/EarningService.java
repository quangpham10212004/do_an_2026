package com.mmp.payment.service;

import com.mmp.payment.client.AuditClient;
import com.mmp.payment.dto.PaymentDtos.*;
import com.mmp.payment.entity.EarningSchedule;
import com.mmp.payment.entity.LedgerEntry;
import com.mmp.payment.entity.Refund;
import com.mmp.payment.entity.Transaction;
import com.mmp.payment.exception.ApiException;
import com.mmp.payment.repository.EarningScheduleRepository;
import com.mmp.payment.repository.LedgerRepository;
import com.mmp.payment.repository.TransactionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * US-25 (PRD-PAY-3, PRD-SES-9) — sổ thu nhập mentor append-only và đồng hồ giải phóng 48 giờ.
 *
 * <ul>
 *   <li>Charge SUCCESS → EARNING_PENDING = mentor_earning ({@link #recordPending}, trong transaction của charge).</li>
 *   <li>Mỗi lần hoàn tiền → REVERSAL = earning × refund / amount ({@link #recordReversal}, trong transaction của refund).</li>
 *   <li>mentoring-service báo trạng thái cuối ({@link #finalState}); COMPLETED / NO_SHOW_MENTEE / CANCELLED (mentee huỷ muộn)
 *       → release_at = endedAt + {@code app.earnings.release-delay} (48h); releaseNow (tranh chấp đã xử lý) → ngay.</li>
 *   <li>Job {@link #releaseDue} ghi EARNING_AVAILABLE = phần pending còn lại cho lịch tới hạn. Giao dịch ON_HOLD (tranh chấp
 *       đang mở) bị bỏ qua, chờ lần sau. Idempotent: số tiền giải phóng tính lại từ sổ dưới khoá dòng giao dịch, đã giải
 *       phóng hết thì không ghi gì.</li>
 * </ul>
 */
@Service
public class EarningService {

    private static final Logger log = LoggerFactory.getLogger(EarningService.class);

    private final LedgerRepository ledger;
    private final EarningScheduleRepository schedules;
    private final TransactionRepository transactions;
    private final TransactionTemplate tx;
    private final AuditClient audit;
    private final Duration releaseDelay;

    public EarningService(LedgerRepository ledger, EarningScheduleRepository schedules, TransactionRepository transactions,
                          TransactionTemplate tx, AuditClient audit,
                          @Value("${app.earnings.release-delay:PT48H}") Duration releaseDelay) {
        this.ledger = ledger;
        this.schedules = schedules;
        this.transactions = transactions;
        this.tx = tx;
        this.audit = audit;
        this.releaseDelay = releaseDelay;
    }

    public Duration releaseDelay() {
        return releaseDelay;
    }

    /** Gọi TRONG transaction charge khi giao dịch vừa SUCCESS. */
    public Optional<LedgerEntry> recordPending(Transaction t) {
        if (t.getMentorEarning() == null || t.getMentorEarning().signum() <= 0) return Optional.empty();
        boolean exists = ledger.findByTransactionIdOrderByCreatedAtAsc(t.getId()).stream()
                .anyMatch(e -> e.getType() == LedgerEntry.Type.EARNING_PENDING);
        if (exists) return Optional.empty();
        return Optional.of(ledger.save(new LedgerEntry(t, LedgerEntry.Type.EARNING_PENDING, t.getMentorEarning(), null)));
    }

    /** Gọi TRONG transaction hoàn tiền (giao dịch đã bị khoá) sau khi lưu dòng refund. */
    public Optional<LedgerEntry> recordReversal(Transaction t, Refund refund, BigDecimal refundedBefore) {
        BigDecimal amount = EarningRules.reversal(t.getMentorEarning(), t.getAmount(), refundedBefore, refund.getAmount());
        if (amount.signum() <= 0) return Optional.empty();
        return Optional.of(ledger.save(new LedgerEntry(t, LedgerEntry.Type.REVERSAL, amount, refund.getId())));
    }

    /**
     * POST /internal/payments/sessions/{sessionId}/final-state. Ghi (lại) lịch cho giao dịch đã thu tiền của phiên; trạng
     * thái không giải phóng (vd. NO_SHOW_MENTOR, DISPUTED) được đánh dấu đã xử lý ngay. 404 nếu phiên không có giao dịch
     * đã thu tiền (phiên miễn phí).
     */
    public FinalStateResponse finalState(UUID sessionId, FinalStateRequest req) {
        String state = req.state().trim().toUpperCase();
        OffsetDateTime now = OffsetDateTime.now();
        boolean releaseNow = Boolean.TRUE.equals(req.releaseNow());
        EarningSchedule saved = tx.execute(s -> {
            Transaction t = transactions.lockBySessionIdAndStatusIn(sessionId, Transaction.EARNING_STATUSES).stream().findFirst()
                    .orElseThrow(() -> ApiException.notFound("NO_SUCCESS_TRANSACTION", "Phiên chưa có giao dịch thành công"));
            EarningSchedule e = schedules.findById(t.getId()).orElseGet(() -> new EarningSchedule(t));
            e.schedule(state, req.endedAt(), releaseNow ? now : req.endedAt().plus(releaseDelay));
            if (!EarningRules.releasableState(state)) e.settle(now);
            return schedules.save(e);
        });
        log.info("Session {} final state {} (ended {}) → release at {}", sessionId, state, req.endedAt(), saved.getReleaseAt());
        if (saved.getSettledAt() == null && !saved.getReleaseAt().isAfter(now)) {
            release(saved.getTransactionId(), now);
        }
        EarningSchedule current = schedules.findById(saved.getTransactionId()).orElse(saved);
        EarningRules.Balance b = EarningRules.balance(ledger.findByTransactionIdOrderByCreatedAtAsc(saved.getTransactionId()));
        return new FinalStateResponse(sessionId, current.getTransactionId(), current.getFinalState(), current.getEndedAt(),
                current.getReleaseAt(), current.getSettledAt(), b.pending(), b.available());
    }

    @Scheduled(fixedDelayString = "${app.earnings.release-interval:PT5M}", initialDelayString = "PT60S")
    public void scheduledRelease() {
        releaseDue(OffsetDateTime.now());
    }

    /** Giải phóng mọi lịch tới hạn; trả về số dòng EARNING_AVAILABLE đã ghi. */
    public int releaseDue(OffsetDateTime now) {
        int n = 0;
        for (UUID transactionId : schedules.findDueTransactionIds(now)) {
            try {
                if (release(transactionId, now).isPresent()) n++;
            } catch (RuntimeException e) {
                log.warn("Could not release earning of transaction {}: {}", transactionId, e.getMessage());
            }
        }
        if (n > 0) log.info("Earning release job: {} entries EARNING_AVAILABLE", n);
        return n;
    }

    /** Giải phóng 1 giao dịch nếu tới hạn và không bị tạm giữ. Idempotent. */
    Optional<LedgerEntry> release(UUID transactionId, OffsetDateTime now) {
        Optional<LedgerEntry> written = tx.execute(s -> {
            Transaction t = transactions.lockById(transactionId).orElse(null);
            EarningSchedule e = schedules.findById(transactionId).orElse(null);
            if (t == null || e == null || e.getSettledAt() != null || e.getReleaseAt().isAfter(now)) return Optional.<LedgerEntry>empty();
            if (t.getStatus() == Transaction.Status.ON_HOLD) return Optional.<LedgerEntry>empty(); // tranh chấp đang mở → chờ
            BigDecimal pending = EarningRules.balance(ledger.findByTransactionIdOrderByCreatedAtAsc(transactionId)).pending();
            e.settle(now);
            if (pending.signum() <= 0) return Optional.<LedgerEntry>empty();
            return Optional.of(ledger.save(new LedgerEntry(t, LedgerEntry.Type.EARNING_AVAILABLE, pending, null)));
        });
        written.ifPresent(x -> audit.system("EARNING_RELEASED", "TRANSACTION", x.getTransactionId(),
                AuditClient.fields("sessionId", x.getSessionId(), "mentorId", x.getMentorId(), "amount", x.getAmount())));
        return written;
    }

    // ---------- đọc ----------

    public EarningSummary summary(UUID mentorId) {
        EarningRules.Balance total = byTransaction(ledger.findByMentorIdOrderByCreatedAtAsc(mentorId)).values().stream()
                .map(EarningRules::balance).reduce(EarningRules.Balance.ZERO, EarningRules.Balance::plus);
        return new EarningSummary(total.pending(), total.available(), total.paidOut(), total.reversed(), total.earned(), "VND",
                releaseDelay.toHours());
    }

    public List<EarningRow> rows(UUID mentorId) {
        List<Transaction> list = transactions.findByMentorIdAndStatusInOrderByCreatedAtDesc(mentorId, Transaction.EARNING_STATUSES);
        if (list.isEmpty()) return List.of();
        List<UUID> ids = list.stream().map(Transaction::getId).toList();
        Map<UUID, List<LedgerEntry>> entries = byTransaction(ledger.findByTransactionIdInOrderByCreatedAtAsc(ids));
        Map<UUID, EarningSchedule> sched = schedules.findByTransactionIdIn(ids).stream()
                .collect(Collectors.toMap(EarningSchedule::getTransactionId, x -> x));
        return list.stream().map(t -> {
            List<LedgerEntry> es = entries.getOrDefault(t.getId(), List.of());
            EarningRules.Balance b = EarningRules.balance(es);
            EarningSchedule e = sched.get(t.getId());
            OffsetDateTime releasedAt = es.stream().filter(x -> x.getType() == LedgerEntry.Type.EARNING_AVAILABLE)
                    .map(LedgerEntry::getCreatedAt).max(Comparator.naturalOrder()).orElse(null);
            return new EarningRow(t.getSessionId(), t.getId(), t.getAmount(), t.getMentorEarning(), t.getStatus().name(),
                    b.pending(), b.available(), b.paidOut(), b.reversed(),
                    e == null ? null : e.getFinalState(), e == null ? null : e.getEndedAt(), e == null ? null : e.getReleaseAt(),
                    releasedAt, t.getCreatedAt(),
                    es.stream().map(x -> new LedgerEntryView(x.getId(), x.getType().name(), x.getAmount(), x.getRefundId(),
                            x.getCreatedAt())).toList());
        }).toList();
    }

    private static Map<UUID, List<LedgerEntry>> byTransaction(List<LedgerEntry> entries) {
        return entries.stream().collect(Collectors.groupingBy(LedgerEntry::getTransactionId, LinkedHashMap::new, Collectors.toList()));
    }

    /** Chỉ dùng cho endpoint dev (e2e): đưa lịch của phiên tới hạn ngay. */
    public int makeDue(UUID sessionId) {
        Integer n = tx.execute(s -> {
            List<EarningSchedule> list = schedules.findBySessionId(sessionId);
            list.forEach(e -> e.moveReleaseAt(OffsetDateTime.now().minusMinutes(1)));
            return list.size();
        });
        return n == null ? 0 : n;
    }
}
