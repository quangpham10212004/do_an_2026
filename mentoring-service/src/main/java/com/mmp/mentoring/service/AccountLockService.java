package com.mmp.mentoring.service;

import com.mmp.mentoring.client.AuditClient;
import com.mmp.mentoring.client.PaymentClient;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.SessionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Bản chốt v2.0 §2.1 — admin khoá / mở khoá tài khoản (auth-service gọi sau khi đổi trạng thái):
 * <ul>
 *   <li>Khoá: mọi buổi chưa diễn ra của người đó (mentee hoặc mentor) bị huỷ bởi hệ thống, mentee được hoàn 100% về ví;
 *       ví bị đóng băng (không đặt, không hoàn ra nguồn, không rút thu nhập) đến khi mở khoá.</li>
 *   <li>Mở khoá: chỉ mở ví; buổi đã huỷ không tự khôi phục.</li>
 * </ul>
 * Idempotent: gọi lại không huỷ lại buổi đã huỷ. Buổi huỷ lỗi (vd. hoàn tiền 502) được đếm vào {@code failed} để bên gọi thử lại.
 */
@Service
public class AccountLockService {

    private static final Logger log = LoggerFactory.getLogger(AccountLockService.class);
    static final String CANCEL_REASON = "Tài khoản đã bị khoá";

    public record Result(UUID userId, boolean locked, int cancelledSessions, int failed) {
    }

    private final SessionRepository sessionRepo;
    private final SessionService sessionService;
    private final PaymentClient paymentClient;
    private final AuditClient audit;

    public AccountLockService(SessionRepository sessionRepo, SessionService sessionService, PaymentClient paymentClient, AuditClient audit) {
        this.sessionRepo = sessionRepo;
        this.sessionService = sessionService;
        this.paymentClient = paymentClient;
        this.audit = audit;
    }

    public Result onLockChanged(UUID userId, boolean locked, UUID actorId) {
        int cancelled = 0;
        int failed = 0;
        if (locked) {
            List<MentoringSession> upcoming = sessionRepo.findUpcomingHoldingByUser(userId, OffsetDateTime.now());
            for (MentoringSession s : upcoming) {
                try {
                    sessionService.cancelWithPolicy(s, CancellationPolicy.Actor.SYSTEM, CANCEL_REASON);
                    cancelled++;
                } catch (ApiException e) {
                    if ("SESSION_NOT_CANCELLABLE".equals(e.getCode()) || "SESSION_ALREADY_STARTED".equals(e.getCode())) continue;
                    failed++;
                    log.warn("Could not cancel session {} of locked user {}: {}", s.getId(), userId, e.getMessage());
                }
            }
        }
        paymentClient.freezeWallet(userId, locked);
        log.info("Account {} {}: {} upcoming sessions cancelled, {} failed", userId, locked ? "locked" : "unlocked", cancelled, failed);
        audit.record(actorId, actorId == null ? "SYSTEM" : "ADMIN", locked ? "ACCOUNT_SESSIONS_CANCELLED" : "ACCOUNT_UNLOCKED", "USER",
                userId.toString(), null, AuditClient.fields("cancelledSessions", cancelled, "failed", failed));
        return new Result(userId, locked, cancelled, failed);
    }
}
