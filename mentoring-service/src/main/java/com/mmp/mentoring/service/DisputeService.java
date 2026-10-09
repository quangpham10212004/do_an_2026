package com.mmp.mentoring.service;

import com.mmp.mentoring.client.AuditClient;
import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.MentoringDtos.*;
import com.mmp.mentoring.entity.Dispute;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.DisputeRepository;
import com.mmp.mentoring.repository.SessionRepository;
import com.mmp.mentoring.security.AuthUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * US-32 (PRD-ADM-1) — tranh chấp phiên mentoring. Quy tắc ở {@link DisputeRules}.
 *
 * <p>Tiền đi qua outbox (ghi cùng transaction với tranh chấp, gửi ngay sau commit, job gửi lại nếu lỗi; các bản ghi của
 * cùng phiên được gửi đúng thứ tự):
 * <ul>
 *   <li>Mở → HOLD (giao dịch SUCCESS → ON_HOLD; job giải phóng thu nhập US-25 bỏ qua giao dịch ON_HOLD).</li>
 *   <li>Kết luận → RELEASE (ON_HOLD → SUCCESS) → REFUND theo % (FULL/SUSPEND 100, PARTIAL p) → FINAL_STATE
 *       DISPUTE_RESOLVED releaseNow (trừ khi hoàn 100%) để payment-service giải phóng ngay phần thu nhập còn lại.</li>
 *   <li>SUSPEND: thêm profile-service PUT /internal/mentor/{id}/status SUSPENDED (reason DISPUTE) và huỷ + hoàn 100% các
 *       phiên sắp tới của mentor ({@link MentorSuspensionService}).</li>
 * </ul>
 */
@Service
public class DisputeService {

    private static final Logger log = LoggerFactory.getLogger(DisputeService.class);
    private static final DateTimeFormatter DISPLAY = DateTimeFormatter.ofPattern("HH:mm dd/MM/yyyy");
    private static final String LINK = "/mentoring/sessions";
    static final List<Dispute.Status> OPEN = List.of(Dispute.Status.OPEN, Dispute.Status.IN_REVIEW);

    private final DisputeRepository disputeRepo;
    private final SessionRepository sessionRepo;
    private final PaymentOutboxService outbox;
    private final NotificationService notifications;
    private final ProfileClient profileClient;
    private final MentorSuspensionService suspension;
    private final AuditClient audit;
    private final TransactionTemplate tx;
    private final Duration openWindow;
    private final Duration firstResponseSla;
    private final ZoneId zone;

    public DisputeService(DisputeRepository disputeRepo, SessionRepository sessionRepo, PaymentOutboxService outbox,
                          NotificationService notifications, ProfileClient profileClient, MentorSuspensionService suspension,
                          AuditClient audit, TransactionTemplate tx,
                          @Value("${app.disputes.open-window:P7D}") Duration openWindow,
                          @Value("${app.disputes.first-response-sla:PT48H}") Duration firstResponseSla,
                          @Value("${app.timezone}") String timezone) {
        this.disputeRepo = disputeRepo;
        this.sessionRepo = sessionRepo;
        this.outbox = outbox;
        this.notifications = notifications;
        this.profileClient = profileClient;
        this.suspension = suspension;
        this.audit = audit;
        this.tx = tx;
        this.openWindow = openWindow;
        this.firstResponseSla = firstResponseSla;
        this.zone = ZoneId.of(timezone);
    }

    // ---------- mở ----------

    /** "Báo cáo sự cố" — mentee hoặc mentor của phiên. */
    public DisputeView open(AuthUser user, UUID sessionId, OpenDisputeInput in) {
        String description = MentoringRequestService.trimToNull(in.description());
        List<String> links = in.evidenceLinks() == null ? List.of()
                : in.evidenceLinks().stream().map(MentoringRequestService::trimToNull).filter(Objects::nonNull).toList();
        DisputeRules.validateInput(description, links).ifPresent(code -> {
            throw ApiException.badRequest(code, switch (code) {
                case "INVALID_DESCRIPTION" -> "Mô tả sự cố phải dài từ " + DisputeRules.DESCRIPTION_MIN + " đến "
                        + DisputeRules.DESCRIPTION_MAX + " ký tự";
                case "TOO_MANY_EVIDENCE_LINKS" -> "Tối đa " + DisputeRules.MAX_EVIDENCE_LINKS + " link bằng chứng";
                default -> "Link bằng chứng phải là URL https hợp lệ";
            });
        });
        OffsetDateTime now = OffsetDateTime.now();
        Dispute saved;
        try {
            saved = tx.execute(s -> {
                MentoringSession ss = sessionRepo.findForUpdate(sessionId)
                        .orElseThrow(() -> ApiException.notFound("SESSION_NOT_FOUND", "Không tìm thấy phiên mentoring"));
                Dispute.OpenedByRole role = roleOf(user, ss);
                if (disputeRepo.existsBySessionIdAndStatusIn(sessionId, OPEN)) {
                    throw ApiException.conflict("DISPUTE_ALREADY_OPEN", "Phiên này đã có một báo cáo sự cố đang được xử lý");
                }
                DisputeRules.canOpen(ss, openWindow, now).ifPresent(code -> {
                    throw ApiException.conflict(code, "DISPUTE_WINDOW_CLOSED".equals(code)
                            ? "Chỉ báo cáo sự cố được trong " + openWindow.toDays() + " ngày sau khi phiên kết thúc"
                            : "Chỉ báo cáo sự cố được cho phiên đã diễn ra (hoàn thành, vắng mặt hoặc đang chờ xác nhận tham dự)");
                });
                Dispute d = disputeRepo.saveAndFlush(new Dispute(sessionId, user.userId(), role, in.type(), description, links));
                if (paid(ss)) outbox.enqueueHold(sessionId, "DISPUTE_OPENED");
                return d;
            });
        } catch (DataIntegrityViolationException e) {
            throw ApiException.conflict("DISPUTE_ALREADY_OPEN", "Phiên này đã có một báo cáo sự cố đang được xử lý");
        }
        MentoringSession session = sessionRepo.findById(sessionId).orElseThrow();
        if (paid(session)) outbox.flushSession(sessionId);
        afterOpen(saved, session, user.role());
        audit.record(user.userId(), user.role(), "DISPUTE_OPENED", "DISPUTE", saved.getId().toString(), null,
                AuditClient.fields("sessionId", sessionId, "type", saved.getType(), "paymentHold", paid(session)));
        return toView(saved, session, names(session));
    }

    /**
     * US-12 → US-32 — phiên vừa chuyển DISPUTED (hai bên trả lời tham dự mâu thuẫn): tạo tranh chấp NO_SHOW do hệ thống mở.
     * Giao dịch đã được xếp hàng HOLD ở AttendanceService. Bỏ qua nếu phiên đã có tranh chấp đang mở.
     */
    public Optional<Dispute> openAutomatic(MentoringSession s) {
        String description = "Hai bên xác nhận tham dự khác nhau: mentee " + s.getMenteeAttendance() + ", mentor "
                + s.getMentorAttendance() + ".";
        Dispute saved;
        try {
            saved = tx.execute(st -> disputeRepo.existsBySessionIdAndStatusIn(s.getId(), OPEN) ? null
                    : disputeRepo.saveAndFlush(new Dispute(s.getId(), null, Dispute.OpenedByRole.SYSTEM, Dispute.Type.NO_SHOW,
                    description, List.of())));
        } catch (DataIntegrityViolationException e) {
            return Optional.empty();
        }
        if (saved == null) return Optional.empty();
        afterOpen(saved, s, "SYSTEM");
        audit.record(null, "SYSTEM", "DISPUTE_OPENED", "DISPUTE", saved.getId().toString(), null,
                AuditClient.fields("sessionId", s.getId(), "type", saved.getType(), "paymentHold", paid(s)));
        return Optional.of(saved);
    }

    private void afterOpen(Dispute d, MentoringSession s, String byRole) {
        String when = s.getScheduledAt().atZoneSameInstant(zone).format(DISPLAY);
        String hold = paid(s) ? " Khoản thanh toán của phiên được tạm giữ cho tới khi quản trị viên xử lý." : "";
        String by = switch (byRole) {
            case "MENTEE" -> "Mentee";
            case "MENTOR" -> "Mentor";
            default -> "Hệ thống";
        };
        String msg = by + " đã báo cáo sự cố (" + typeLabel(d.getType()) + ") cho phiên lúc " + when + "." + hold
                + " Quản trị viên sẽ phản hồi trong " + firstResponseSla.toHours() + " giờ.";
        notifications.notifyUser(s.getMenteeId(), "DISPUTE_OPENED", "Phiên mentoring có báo cáo sự cố", msg, LINK);
        notifications.notifyUser(s.getMentorId(), "DISPUTE_OPENED", "Phiên mentoring có báo cáo sự cố", msg, LINK);
        // Phiên DISPUTED giữ loại thông báo SESSION_DISPUTED của US-12 cho admin
        notifications.notifyRole("ADMIN", "SYSTEM".equals(byRole) ? "SESSION_DISPUTED" : "DISPUTE_OPENED", "Tranh chấp mới cần xử lý",
                "Phiên " + s.getId() + ": " + typeLabel(d.getType()) + " — " + abbreviate(d.getDescription(), 140),
                "/admin/disputes/" + d.getId());
    }

    // ---------- admin ----------

    public List<DisputeView> list(String status) {
        List<Dispute> list;
        if (status == null || status.isBlank()) {
            list = disputeRepo.findAllByOrderByCreatedAtDesc();
        } else if ("ACTIVE".equalsIgnoreCase(status)) {
            list = disputeRepo.findByStatusInOrderByCreatedAtAsc(OPEN);
        } else {
            Dispute.Status st;
            try {
                st = Dispute.Status.valueOf(status.trim().toUpperCase());
            } catch (IllegalArgumentException e) {
                throw ApiException.badRequest("INVALID_STATUS", "Trạng thái phải là OPEN, IN_REVIEW, RESOLVED hoặc ACTIVE");
            }
            list = disputeRepo.findByStatusInOrderByCreatedAtAsc(List.of(st));
        }
        return views(list);
    }

    public DisputeView get(UUID id) {
        return views(List.of(find(id))).get(0);
    }

    /** Tranh chấp của 1 phiên — người tham gia phiên hoặc admin. */
    public List<DisputeView> forSession(AuthUser user, UUID sessionId) {
        MentoringSession s = sessionRepo.findById(sessionId)
                .orElseThrow(() -> ApiException.notFound("SESSION_NOT_FOUND", "Không tìm thấy phiên mentoring"));
        if (!user.isAdmin() && !s.getMenteeId().equals(user.userId()) && !s.getMentorId().equals(user.userId())) {
            throw ApiException.forbidden("Bạn không tham gia phiên này");
        }
        return views(disputeRepo.findBySessionIdOrderByCreatedAtDesc(sessionId));
    }

    /** OPEN → IN_REVIEW, ghi first_response_at. */
    public DisputeView startReview(AuthUser admin, UUID id) {
        Dispute d = tx.execute(s -> {
            Dispute x = disputeRepo.findForUpdate(id)
                    .orElseThrow(() -> ApiException.notFound("DISPUTE_NOT_FOUND", "Không tìm thấy tranh chấp"));
            if (x.getStatus() != Dispute.Status.OPEN) {
                throw ApiException.conflict("DISPUTE_NOT_OPEN", "Chỉ bắt đầu xem xét được tranh chấp đang mở");
            }
            x.startReview(OffsetDateTime.now());
            return x;
        });
        MentoringSession s = sessionRepo.findById(d.getSessionId()).orElseThrow();
        String msg = "Quản trị viên đang xem xét báo cáo sự cố của phiên lúc " + s.getScheduledAt().atZoneSameInstant(zone).format(DISPLAY) + ".";
        notifications.notifyUser(s.getMenteeId(), "DISPUTE_IN_REVIEW", "Báo cáo sự cố đang được xem xét", msg, LINK);
        notifications.notifyUser(s.getMentorId(), "DISPUTE_IN_REVIEW", "Báo cáo sự cố đang được xem xét", msg, LINK);
        audit.record(admin.userId(), "ADMIN", "DISPUTE_REVIEW_STARTED", "DISPUTE", id.toString(),
                AuditClient.fields("status", "OPEN"), AuditClient.fields("status", "IN_REVIEW", "sessionId", d.getSessionId()));
        return toView(d, s, names(s));
    }

    /** Kết luận tranh chấp và thực hiện quyết định tiền (qua outbox) — xem mô tả lớp. */
    public DisputeView resolve(AuthUser admin, UUID id, ResolveDisputeInput in) {
        String note = MentoringRequestService.trimToNull(in.note());
        if (note == null) throw ApiException.badRequest("NOTE_REQUIRED", "Vui lòng nhập ghi chú kết luận");
        DisputeRules.validateResolution(in.outcome(), in.refundPercent()).ifPresent(code -> {
            throw ApiException.badRequest(code, in.outcome() == Dispute.Outcome.PARTIAL_REFUND
                    ? "Hoàn một phần cần refundPercent từ 1 đến 99"
                    : "Chỉ kết luận hoàn một phần mới có refundPercent");
        });
        OffsetDateTime now = OffsetDateTime.now();
        int percent = DisputeRules.refundPercent(in.outcome(), in.refundPercent());
        String[] before = new String[2];
        Dispute d = tx.execute(st -> {
            Dispute x = disputeRepo.findForUpdate(id)
                    .orElseThrow(() -> ApiException.notFound("DISPUTE_NOT_FOUND", "Không tìm thấy tranh chấp"));
            if (!x.isOpen()) throw ApiException.conflict("DISPUTE_ALREADY_RESOLVED", "Tranh chấp đã được kết luận");
            MentoringSession s = sessionRepo.findForUpdate(x.getSessionId()).orElseThrow();
            before[0] = x.getStatus().name();
            before[1] = s.getStatus().name();
            x.resolve(in.outcome(), percent, note, admin.userId(), now);
            DisputeRules.sessionStatusAfter(in.outcome(), s.getStatus())
                    .ifPresent(status -> s.resolve(status, "DISPUTE_RESOLVED", now));
            if (paid(s)) {
                if (percent > 0) s.setRefundPercent(percent);
                outbox.enqueueRelease(s.getId());
                if (percent > 0) outbox.enqueueRefund(s.getId(), percent, "DISPUTE_" + in.outcome().name());
                if (DisputeRules.releasesEarning(in.outcome())) {
                    outbox.enqueueFinalState(s.getId(), "DISPUTE_RESOLVED", s.endsAt(), true);
                }
            }
            return x;
        });
        MentoringSession s = sessionRepo.findById(d.getSessionId()).orElseThrow();
        if (paid(s)) outbox.flushSession(s.getId());
        if (in.outcome() == Dispute.Outcome.SUSPEND) suspendMentor(admin, s, d);
        notifyResolved(d, s);
        audit.record(admin.userId(), "ADMIN", "DISPUTE_RESOLVED", "DISPUTE", id.toString(),
                AuditClient.fields("status", before[0], "sessionStatus", before[1]),
                AuditClient.fields("status", "RESOLVED", "outcome", d.getOutcome(), "refundPercent", percent,
                        "sessionId", s.getId(), "sessionStatus", s.getStatus(), "note", note));
        log.info("Dispute {} resolved {} ({}%) by {}", id, d.getOutcome(), percent, admin.userId());
        return toView(d, s, names(s));
    }

    private void suspendMentor(AuthUser admin, MentoringSession s, Dispute d) {
        boolean statusSet = profileClient.updateMentorStatus(s.getMentorId(), "SUSPENDED", "DISPUTE");
        int cancelled = 0;
        try {
            cancelled = suspension.suspend(s.getMentorId(), "DISPUTE", admin.userId());
        } catch (ApiException e) {
            log.warn("Suspension of mentor {} after dispute {} incomplete: {}", s.getMentorId(), d.getId(), e.getMessage());
        }
        audit.record(admin.userId(), "ADMIN", "MENTOR_SUSPENDED", "MENTOR", s.getMentorId().toString(), null,
                AuditClient.fields("reason", "DISPUTE", "disputeId", d.getId(), "profileStatusUpdated", statusSet,
                        "cancelledSessions", cancelled));
        notifications.notifyUser(s.getMentorId(), "MENTOR_SUSPENDED", "Tài khoản mentor bị tạm khoá",
                "Sau khi xem xét tranh chấp, quản trị viên đã tạm khoá tài khoản mentor của bạn. Các phiên sắp tới đã được huỷ"
                        + " và hoàn tiền cho mentee. Vui lòng liên hệ quản trị viên.", "/profile");
    }

    private void notifyResolved(Dispute d, MentoringSession s) {
        String when = s.getScheduledAt().atZoneSameInstant(zone).format(DISPLAY);
        String money = !paid(s) ? "" : switch (d.getOutcome()) {
            case FULL_REFUND, SUSPEND -> " Mentee được hoàn 100% học phí.";
            case PARTIAL_REFUND -> " Mentee được hoàn " + d.getRefundPercent() + "% học phí; phần còn lại được trả cho mentor.";
            case NO_REFUND, WARNING -> " Khoản thanh toán được trả cho mentor.";
        };
        String msg = "Báo cáo sự cố của phiên lúc " + when + " đã được kết luận: " + DisputeRules.outcomeLabel(d.getOutcome()) + "."
                + money + " Ghi chú: " + d.getResolutionNote();
        notifications.notifyUser(s.getMenteeId(), "DISPUTE_RESOLVED", "Tranh chấp đã được giải quyết", msg, LINK);
        notifications.notifyUser(s.getMentorId(), "DISPUTE_RESOLVED", "Tranh chấp đã được giải quyết", msg, LINK);
        if (d.getOutcome() == Dispute.Outcome.WARNING) {
            notifications.notifyUser(s.getMentorId(), "MENTOR_WARNING", "Bạn nhận một cảnh cáo",
                    "Quản trị viên cảnh cáo bạn sau khi xem xét phiên lúc " + when + ". Ghi chú: " + d.getResolutionNote(), LINK);
        }
    }

    // ---------- view ----------

    private Dispute find(UUID id) {
        return disputeRepo.findById(id).orElseThrow(() -> ApiException.notFound("DISPUTE_NOT_FOUND", "Không tìm thấy tranh chấp"));
    }

    private List<DisputeView> views(List<Dispute> list) {
        if (list.isEmpty()) return List.of();
        Map<UUID, MentoringSession> sessions = sessionRepo.findAllById(list.stream().map(Dispute::getSessionId).distinct().toList())
                .stream().collect(Collectors.toMap(MentoringSession::getId, x -> x));
        Map<UUID, String> names = profileClient.displayNames(sessions.values().stream()
                .flatMap(s -> Stream.of(s.getMenteeId(), s.getMentorId())).toList());
        return list.stream().map(d -> toView(d, sessions.get(d.getSessionId()), names)).toList();
    }

    private Map<UUID, String> names(MentoringSession s) {
        return profileClient.displayNames(List.of(s.getMenteeId(), s.getMentorId()));
    }

    DisputeView toView(Dispute d, MentoringSession s, Map<UUID, String> names) {
        DisputeSessionSummary summary = s == null ? null : new DisputeSessionSummary(s.getId(), s.getMenteeId(), names.get(s.getMenteeId()),
                s.getMentorId(), names.get(s.getMentorId()), s.getScheduledAt(), s.endsAt(), s.getPrice(), s.getStatus().name(),
                s.getMenteeAttendance() == null ? null : s.getMenteeAttendance().name(),
                s.getMentorAttendance() == null ? null : s.getMentorAttendance().name(), s.getRefundPercent());
        String openedByName = d.getOpenedBy() == null ? "Hệ thống" : names.getOrDefault(d.getOpenedBy(), null);
        return new DisputeView(d.getId(), d.getSessionId(), d.getOpenedBy(), d.getOpenedByRole().name(), openedByName,
                d.getType().name(), d.getDescription(), d.getEvidenceLinks(), d.getStatus().name(),
                d.getOutcome() == null ? null : d.getOutcome().name(), d.getRefundPercent(), d.getResolutionNote(),
                d.getResolvedBy(), d.getCreatedAt(), d.getFirstResponseAt(), DisputeRules.firstResponseDue(d, firstResponseSla),
                DisputeRules.overdue(d, firstResponseSla, OffsetDateTime.now()), d.getResolvedAt(), summary);
    }

    private static Dispute.OpenedByRole roleOf(AuthUser user, MentoringSession s) {
        if (user.userId() != null && user.userId().equals(s.getMenteeId())) return Dispute.OpenedByRole.MENTEE;
        if (user.userId() != null && user.userId().equals(s.getMentorId())) return Dispute.OpenedByRole.MENTOR;
        throw ApiException.forbidden("Chỉ mentee hoặc mentor của phiên mới được báo cáo sự cố");
    }

    private static boolean paid(MentoringSession s) {
        return s.getPrice() != null && s.getPrice().signum() > 0;
    }

    static String typeLabel(Dispute.Type t) {
        return switch (t) {
            case NO_SHOW -> "vắng mặt";
            case QUALITY -> "chất lượng phiên";
            case BEHAVIOR -> "thái độ / hành vi";
            case PAYMENT -> "thanh toán";
            case OTHER -> "khác";
        };
    }

    private static String abbreviate(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max - 1) + "…";
    }
}
