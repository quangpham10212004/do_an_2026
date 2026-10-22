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
 * Bản chốt v2.0 §2.1 — admin khoá / mở khoá tài khoản (auth-service gọi sau khi đổi trạng thái, kèm lý do):
 * <ul>
 *   <li>Khoá: mọi buổi chưa diễn ra của người đó (mentee hoặc mentor) bị huỷ bởi hệ thống, mentee được hoàn 100% về ví;
 *       ví bị đóng băng (không đặt, không hoàn ra nguồn, không rút thu nhập) đến khi mở khoá.</li>
 *   <li>Khoá mentor: thu nhập đang chờ của các buổi đã diễn ra bị giữ bằng tranh chấp do hệ thống mở, tới khi admin kết luận
 *       giải phóng hoặc hoàn cho mentee ({@link DisputeService#openForLockedMentor}).</li>
 *   <li>Người bị khoá / mở khoá nhận thông báo trong hệ thống + email (kể cả khi đang bị khoá); bên còn lại của mỗi buổi bị huỷ
 *       nhận thông báo huỷ buổi như mọi lần huỷ.</li>
 *   <li>Mở khoá: chỉ mở ví; buổi đã huỷ không tự khôi phục, tranh chấp đã mở vẫn chờ admin.</li>
 * </ul>
 * Idempotent: gọi lại không huỷ lại buổi đã huỷ, không mở thêm tranh chấp. Lỗi (vd. hoàn tiền 502, payment không trả lời) được đếm
 * vào {@code failed} để bên gọi thử lại.
 */
@Service
public class AccountLockService {

    private static final Logger log = LoggerFactory.getLogger(AccountLockService.class);
    static final String CANCEL_REASON = "Tài khoản đã bị khoá";

    public record Result(UUID userId, boolean locked, int cancelledSessions, int heldEarnings, int failed) {
    }

    private final SessionRepository sessionRepo;
    private final SessionService sessionService;
    private final DisputeService disputes;
    private final PaymentClient paymentClient;
    private final NotificationService notifications;
    private final AuditClient audit;

    public AccountLockService(SessionRepository sessionRepo, SessionService sessionService, DisputeService disputes,
                              PaymentClient paymentClient, NotificationService notifications, AuditClient audit) {
        this.sessionRepo = sessionRepo;
        this.sessionService = sessionService;
        this.disputes = disputes;
        this.paymentClient = paymentClient;
        this.notifications = notifications;
        this.audit = audit;
    }

    public Result onLockChanged(UUID userId, boolean locked, UUID actorId, String reason) {
        int cancelled = 0;
        int held = 0;
        int failed = 0;
        if (locked) {
            OffsetDateTime now = OffsetDateTime.now();   // mốc tìm buổi chưa diễn ra
            List<MentoringSession> upcoming = sessionRepo.findUpcomingHoldingByUser(userId, now);
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
            try {
                for (UUID sessionId : paymentClient.pendingEarningSessions(userId)) {
                    MentoringSession s = sessionRepo.findById(sessionId).orElse(null);
                    // buổi người này dạy đã diễn ra hoặc đã bị mentee huỷ muộn (thu nhập vẫn chờ); buổi vừa huỷ do khoá đã hoàn 100% ở trên
                    if (s == null || !userId.equals(s.getMentorId()) || stillUpcoming(s) || CANCEL_REASON.equals(s.getCancelReason())) continue;
                    if (disputes.openForLockedMentor(s, reason).isPresent()) held++;
                }
            } catch (RuntimeException e) {
                failed++;
                log.warn("Could not hold pending earnings of locked user {}: {}", userId, e.getMessage());
            }
        }
        paymentClient.freezeWallet(userId, locked);
        notifyUser(userId, locked, reason, cancelled);
        log.info("Account {} {}: {} upcoming sessions cancelled, {} earnings held, {} failed",
                userId, locked ? "locked" : "unlocked", cancelled, held, failed);
        audit.record(actorId, actorId == null ? "SYSTEM" : "ADMIN", locked ? "ACCOUNT_SESSIONS_CANCELLED" : "ACCOUNT_UNLOCKED", "USER",
                userId.toString(), null, AuditClient.fields("cancelledSessions", cancelled, "heldEarnings", held, "failed", failed));
        return new Result(userId, locked, cancelled, held, failed);
    }

    private static boolean stillUpcoming(MentoringSession s) {
        return s.getStatus() == MentoringSession.Status.PENDING || s.getStatus() == MentoringSession.Status.AWAITING_MENTOR
                || s.getStatus() == MentoringSession.Status.CONFIRMED;
    }

    private void notifyUser(UUID userId, boolean locked, String reason, int cancelled) {
        String why = reason == null ? "" : " Lý do: " + reason + ".";
        if (locked) {
            notifications.notifyUser(userId, "ACCOUNT_LOCKED", "Tài khoản của bạn đã bị khoá",
                    "Quản trị viên đã khoá tài khoản của bạn." + why + (cancelled > 0 ? " " + cancelled
                            + " buổi chưa diễn ra đã bị huỷ và hoàn 100% học phí về ví của mentee." : "")
                            + " Ví của bạn bị đóng băng tới khi tài khoản được mở khoá. Vui lòng liên hệ quản trị viên.", null);
        } else {
            notifications.notifyUser(userId, "ACCOUNT_UNLOCKED", "Tài khoản của bạn đã được mở khoá",
                    "Bạn có thể đăng nhập và sử dụng ví trở lại. Các buổi đã huỷ khi khoá không được khôi phục." + why, "/wallet");
        }
    }
}
