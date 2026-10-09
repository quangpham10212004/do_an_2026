package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.MentoringDtos.EndRequestInput;
import com.mmp.mentoring.dto.MentoringDtos.RequestView;
import com.mmp.mentoring.entity.MentoringRequest;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.MentoringRequestRepository;
import com.mmp.mentoring.repository.SessionRepository;
import com.mmp.mentoring.security.AuthUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * US-31 (PRD-REQ-6) — kết thúc quan hệ mentoring (ACCEPTED → ENDED).
 *
 * <ul>
 *   <li>Mentee / mentor (hoặc admin) kết thúc kèm lý do: các phiên sắp tới PENDING/CONFIRMED của cặp bị huỷ theo chính
 *       sách huỷ hiện có như thể người kết thúc huỷ (mentee &lt; 72 giờ → hoàn 0%, mentor → hoàn 100% + điểm xin lỗi +
 *       strike, admin → SYSTEM hoàn 100%). Huỷ phiên trước rồi mới ENDED: lỗi hoàn tiền (502) → quan hệ vẫn ACCEPTED, gọi
 *       lại an toàn (phiên đã huỷ không bị huỷ lại).</li>
 *   <li>Job không hoạt động ({@link InactivityRules}): 30 ngày → nhắc hai bên "Bạn có muốn tiếp tục?"; thêm 7 ngày vẫn
 *       không có phiên mới → ENDED reason INACTIVE, endedBy SYSTEM. Đặt phiên mới xoá nhắc (SessionService.book).</li>
 *   <li>Số mentee đang hướng dẫn đồng bộ sang profile-service chỉ đếm ACCEPTED.</li>
 * </ul>
 */
@Service
public class MentorshipEndService {

    private static final Logger log = LoggerFactory.getLogger(MentorshipEndService.class);
    private static final String LINK = "/mentoring/requests";

    private final MentoringRequestRepository requestRepo;
    private final SessionRepository sessionRepo;
    private final SessionService sessionService;
    private final MentoringRequestService requestService;
    private final ProfileClient profileClient;
    private final NotificationService notifications;
    private final TransactionTemplate tx;
    private final Duration warnAfter;
    private final Duration endAfter;

    public MentorshipEndService(MentoringRequestRepository requestRepo, SessionRepository sessionRepo, SessionService sessionService,
                                MentoringRequestService requestService, ProfileClient profileClient, NotificationService notifications,
                                TransactionTemplate tx,
                                @Value("${app.requests.inactivity-warn-after:P30D}") Duration warnAfter,
                                @Value("${app.requests.inactivity-end-after:P7D}") Duration endAfter) {
        this.requestRepo = requestRepo;
        this.sessionRepo = sessionRepo;
        this.sessionService = sessionService;
        this.requestService = requestService;
        this.profileClient = profileClient;
        this.notifications = notifications;
        this.tx = tx;
        this.warnAfter = warnAfter;
        this.endAfter = endAfter;
    }

    /** POST /api/mentoring/requests/{id}/end. */
    public RequestView end(AuthUser user, UUID requestId, EndRequestInput in) {
        if (in.reason() == MentoringRequest.EndReason.INACTIVE) {
            throw ApiException.badRequest("INVALID_END_REASON", "Lý do phải là GOAL_REACHED, NO_LONGER_NEEDED, NOT_A_FIT hoặc OTHER");
        }
        String note = MentoringRequestService.trimToNull(in.note());
        MentoringRequest r = requestRepo.findById(requestId)
                .orElseThrow(() -> ApiException.notFound("REQUEST_NOT_FOUND", "Không tìm thấy yêu cầu"));
        String endedBy = enderOf(user, r);
        requireActive(r);
        CancellationPolicy.Actor actor = switch (endedBy) {
            case "MENTEE" -> CancellationPolicy.Actor.MENTEE;
            case "MENTOR" -> CancellationPolicy.Actor.MENTOR;
            default -> CancellationPolicy.Actor.SYSTEM;
        };
        int cancelled = cancelUpcoming(r, actor);
        MentoringRequest ended = tx.execute(s -> {
            MentoringRequest x = requestRepo.findForUpdate(requestId).orElseThrow();
            requireActive(x);
            x.end(endedBy, in.reason(), note, OffsetDateTime.now());
            return x;
        });
        requestService.syncActiveMentees(ended.getMentorId());
        String who = switch (endedBy) {
            case "MENTEE" -> "Mentee";
            case "MENTOR" -> "Mentor";
            default -> "Quản trị viên";
        };
        String msg = who + " đã kết thúc quan hệ mentoring. Lý do: " + reasonLabel(in.reason()) + "."
                + (note == null ? "" : " Ghi chú: " + note)
                + (cancelled > 0 ? " " + cancelled + " phiên sắp tới đã được huỷ theo chính sách huỷ." : "");
        if (!"MENTEE".equals(endedBy)) notifications.notifyUser(ended.getMenteeId(), "MENTORING_ENDED", "Kết thúc mentoring", msg, LINK);
        if (!"MENTOR".equals(endedBy)) notifications.notifyUser(ended.getMentorId(), "MENTORING_ENDED", "Kết thúc mentoring", msg, LINK);
        log.info("Mentoring request {} ended by {} ({}), {} upcoming sessions cancelled", requestId, endedBy, in.reason(), cancelled);
        return view(ended);
    }

    private int cancelUpcoming(MentoringRequest r, CancellationPolicy.Actor actor) {
        int n = 0;
        String reason = actor == CancellationPolicy.Actor.SYSTEM ? "Quan hệ mentoring đã kết thúc" : "Kết thúc mentoring";
        for (MentoringSession s : sessionRepo.findUpcomingHoldingByPair(r.getMenteeId(), r.getMentorId(), OffsetDateTime.now())) {
            try {
                sessionService.cancelWithPolicy(s, actor, reason);
                n++;
            } catch (ApiException e) {
                if ("SESSION_NOT_CANCELLABLE".equals(e.getCode()) || "SESSION_ALREADY_STARTED".equals(e.getCode())) continue;
                throw e; // vd. 502 REFUND_FAILED — quan hệ giữ ACCEPTED, người dùng thử lại
            }
        }
        return n;
    }

    // ---------- job không hoạt động ----------

    @Scheduled(fixedDelayString = "${app.requests.inactivity-interval:PT1H}", initialDelayString = "PT90S")
    public void scheduled() {
        runInactivity(OffsetDateTime.now());
    }

    /** @return [đã nhắc, đã kết thúc] */
    public int[] runInactivity(OffsetDateTime now) {
        int warned = 0;
        int ended = 0;
        for (Object[] row : requestRepo.findAcceptedActivity()) {
            UUID id = UUID.fromString((String) row[0]);
            InactivityRules.Action action = InactivityRules.decide(odt(row[1]), odt(row[2]), now, warnAfter, endAfter);
            try {
                switch (action) {
                    case WARN -> warned += warn(id, now) ? 1 : 0;
                    case CLEAR -> tx.executeWithoutResult(s -> requestRepo.clearInactivityWarning(id));
                    case END -> ended += endInactive(id, now) ? 1 : 0;
                    case NONE -> { }
                }
            } catch (RuntimeException e) {
                log.warn("Inactivity {} on request {} failed: {}", action, id, e.getMessage());
            }
        }
        if (warned + ended > 0) log.info("Inactivity job: {} warned, {} ended", warned, ended);
        return new int[]{warned, ended};
    }

    private boolean warn(UUID id, OffsetDateTime now) {
        MentoringRequest r = tx.execute(s -> requestRepo.findForUpdate(id)
                .filter(x -> x.getStatus() == MentoringRequest.Status.ACCEPTED && x.getInactivityWarnedAt() == null)
                .map(x -> {
                    x.warnInactive(now);
                    return x;
                }).orElse(null));
        if (r == null) return false;
        String msg = "Quan hệ mentoring chưa có phiên nào trong " + warnAfter.toDays() + " ngày. Bạn có muốn tiếp tục? Hãy đặt một phiên"
                + " mới trong " + endAfter.toDays() + " ngày tới, nếu không quan hệ mentoring sẽ tự kết thúc.";
        notifications.notifyUser(r.getMenteeId(), "MENTORING_INACTIVE", "Bạn có muốn tiếp tục?", msg, LINK);
        notifications.notifyUser(r.getMentorId(), "MENTORING_INACTIVE", "Bạn có muốn tiếp tục?", msg, LINK);
        return true;
    }

    private boolean endInactive(UUID id, OffsetDateTime now) {
        MentoringRequest r = tx.execute(s -> requestRepo.findForUpdate(id)
                .filter(x -> x.getStatus() == MentoringRequest.Status.ACCEPTED && x.getInactivityWarnedAt() != null)
                .map(x -> {
                    x.end("SYSTEM", MentoringRequest.EndReason.INACTIVE, null, now);
                    return x;
                }).orElse(null));
        if (r == null) return false;
        requestService.syncActiveMentees(r.getMentorId());
        String msg = "Quan hệ mentoring đã tự kết thúc vì không có phiên mới " + endAfter.toDays() + " ngày sau lời nhắc. Bạn có thể"
                + " gửi yêu cầu mới bất cứ lúc nào.";
        notifications.notifyUser(r.getMenteeId(), "MENTORING_ENDED", "Kết thúc mentoring", msg, LINK);
        notifications.notifyUser(r.getMentorId(), "MENTORING_ENDED", "Kết thúc mentoring", msg, LINK);
        return true;
    }

    // ---------- tiện ích ----------

    private static String enderOf(AuthUser user, MentoringRequest r) {
        if (user.userId() != null && user.userId().equals(r.getMenteeId())) return "MENTEE";
        if (user.userId() != null && user.userId().equals(r.getMentorId())) return "MENTOR";
        if (user.isAdmin()) return "ADMIN";
        throw ApiException.forbidden("Bạn không thuộc quan hệ mentoring này");
    }

    private static void requireActive(MentoringRequest r) {
        if (r.getStatus() != MentoringRequest.Status.ACCEPTED) {
            throw ApiException.conflict("REQUEST_NOT_ACTIVE", "Quan hệ mentoring không còn hoạt động");
        }
    }

    private RequestView view(MentoringRequest r) {
        Map<UUID, String> names = profileClient.displayNames(List.of(r.getMenteeId(), r.getMentorId()));
        return MentoringRequestService.toView(r, names, Map.of());
    }

    static String reasonLabel(MentoringRequest.EndReason reason) {
        return switch (reason) {
            case GOAL_REACHED -> "đã đạt mục tiêu";
            case NO_LONGER_NEEDED -> "không còn nhu cầu";
            case NOT_A_FIT -> "không phù hợp";
            case OTHER -> "lý do khác";
            case INACTIVE -> "không hoạt động";
        };
    }

    /** Giá trị thời gian từ truy vấn native (tuỳ driver: Timestamp / Instant / OffsetDateTime). */
    static OffsetDateTime odt(Object v) {
        if (v == null) return null;
        if (v instanceof OffsetDateTime o) return o;
        if (v instanceof Instant i) return i.atOffset(ZoneOffset.UTC);
        if (v instanceof Timestamp t) return t.toInstant().atOffset(ZoneOffset.UTC);
        if (v instanceof java.time.ZonedDateTime z) return z.toOffsetDateTime();
        if (v instanceof java.time.LocalDateTime l) return l.atOffset(ZoneOffset.UTC);
        return OffsetDateTime.parse(v.toString());
    }
}
