package com.mmp.mentoring.service;

import com.mmp.mentoring.client.AuditClient;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.SessionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * US-27 (phía mentoring) — khoá mentor: huỷ mọi phiên sắp tới PENDING/CONFIRMED của mentor với cancelledBy = SYSTEM theo
 * chính sách huỷ hiện có (SYSTEM → hoàn 100%, không strike, không điểm xin lỗi) và báo mentee (thông báo của
 * cancelWithPolicy). Idempotent: lần gọi sau không còn phiên nào để huỷ → 0. Trạng thái SUSPENDED của hồ sơ do
 * profile-service giữ (Team B gọi endpoint này sau khi đổi trạng thái; tranh chấp SUSPEND tự đổi qua ProfileClient).
 */
@Service
public class MentorSuspensionService {

    private static final Logger log = LoggerFactory.getLogger(MentorSuspensionService.class);
    static final String CANCEL_REASON = "Mentor đã bị tạm khoá";

    private final SessionRepository sessionRepo;
    private final SessionService sessionService;
    private final AuditClient audit;

    public MentorSuspensionService(SessionRepository sessionRepo, SessionService sessionService, AuditClient audit) {
        this.sessionRepo = sessionRepo;
        this.sessionService = sessionService;
        this.audit = audit;
    }

    /**
     * @return số phiên đã huỷ ở lần gọi này. Phiên nào huỷ lỗi (vd. hoàn tiền 502) được bỏ qua và báo 502 sau cùng để
     *         người gọi thử lại — các phiên đã huỷ không bị huỷ lại.
     */
    public int suspend(UUID mentorId, String reason, UUID actorId) {
        List<MentoringSession> upcoming = sessionRepo.findUpcomingHoldingByMentor(mentorId, OffsetDateTime.now());
        int cancelled = 0;
        int failed = 0;
        String why = reason == null || reason.isBlank() ? CANCEL_REASON : CANCEL_REASON + " (" + reason.trim() + ")";
        for (MentoringSession s : upcoming) {
            try {
                sessionService.cancelWithPolicy(s, CancellationPolicy.Actor.SYSTEM, why);
                cancelled++;
            } catch (ApiException e) {
                if ("SESSION_NOT_CANCELLABLE".equals(e.getCode()) || "SESSION_ALREADY_STARTED".equals(e.getCode())) continue;
                failed++;
                log.warn("Could not cancel session {} of suspended mentor {}: {}", s.getId(), mentorId, e.getMessage());
            }
        }
        log.info("Mentor {} suspended ({}): {} upcoming sessions cancelled, {} failed", mentorId, reason, cancelled, failed);
        if (cancelled > 0 || failed > 0) {
            audit.record(actorId, actorId == null ? "SYSTEM" : "ADMIN", "MENTOR_SESSIONS_CANCELLED", "MENTOR", mentorId.toString(), null,
                    AuditClient.fields("reason", reason, "cancelledSessions", cancelled, "failed", failed));
        }
        if (failed > 0) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "SUSPEND_INCOMPLETE",
                    "Đã huỷ " + cancelled + " phiên, còn " + failed + " phiên chưa huỷ được (lỗi hoàn tiền) — vui lòng thử lại");
        }
        return cancelled;
    }
}
