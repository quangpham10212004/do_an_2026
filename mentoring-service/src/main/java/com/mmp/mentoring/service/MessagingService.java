package com.mmp.mentoring.service;

import com.mmp.mentoring.client.AuditClient;
import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.MessagingDtos.*;
import com.mmp.mentoring.entity.MentoringRequest;
import com.mmp.mentoring.entity.Message;
import com.mmp.mentoring.entity.MessageReport;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.MentoringRequestRepository;
import com.mmp.mentoring.repository.MessageReportRepository;
import com.mmp.mentoring.repository.MessageRepository;
import com.mmp.mentoring.repository.SessionRepository;
import com.mmp.mentoring.security.AuthUser;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Stream;

/**
 * US-33 (PRD-MSG-1..4) — nhắn tin trong yêu cầu / quan hệ mentoring.
 *
 * - Cuộc trò chuyện = yêu cầu mentoring (id giống nhau), chỉ hai bên tham gia đọc/gửi; ADMIN chỉ xem qua hồ sơ kiểm duyệt.
 * - Gửi được khi yêu cầu PENDING / ACCEPTED và 30 ngày sau ENDED / REJECTED / EXPIRED (MessageRules.isWritable).
 * - Trước khi được chấp nhận, mentee gửi tối đa 3 tin (kiểm tra dưới khoá advisory theo cuộc trò chuyện).
 * - SĐT/email lưu nguyên văn, che khi trả về cho tới khi cặp có phiên trả phí đã xác nhận.
 * - Cập nhật theo polling 10 giây (không WebSocket); mở luồng = đánh dấu đã đọc.
 * - Tên hiển thị lấy từ profile-service NGOÀI transaction.
 */
@Service
public class MessagingService {

    public static final int POLL_SECONDS = 10;
    static final int PAGE = 200;
    private static final String ROLE_MENTEE = "MENTEE";
    private static final String ROLE_MENTOR = "MENTOR";

    private final MentoringRequestRepository requestRepo;
    private final MessageRepository messageRepo;
    private final MessageReportRepository reportRepo;
    private final SessionRepository sessionRepo;
    private final ProfileClient profileClient;
    private final NotificationService notifications;
    private final AuditClient audit;
    private final TransactionTemplate tx;

    public MessagingService(MentoringRequestRepository requestRepo, MessageRepository messageRepo,
                            MessageReportRepository reportRepo, SessionRepository sessionRepo, ProfileClient profileClient,
                            NotificationService notifications, AuditClient audit, TransactionTemplate tx) {
        this.requestRepo = requestRepo;
        this.messageRepo = messageRepo;
        this.reportRepo = reportRepo;
        this.sessionRepo = sessionRepo;
        this.profileClient = profileClient;
        this.notifications = notifications;
        this.audit = audit;
        this.tx = tx;
    }

    // ------------------------------------------------------------------ hộp thư

    public List<ConversationSummary> list(AuthUser user) {
        List<MentoringRequest> requests = Stream.concat(
                        requestRepo.findByMenteeIdOrderByCreatedAtDesc(user.userId()).stream(),
                        requestRepo.findByMentorIdOrderByCreatedAtDesc(user.userId()).stream())
                .toList();
        if (requests.isEmpty()) return List.of();
        Map<UUID, Object[]> stats = new HashMap<>();
        for (Object[] row : messageRepo.conversationStats(user.userId(), requests.stream().map(MentoringRequest::getId).toList())) {
            stats.put(UUID.fromString((String) row[0]), row);
        }
        Map<UUID, String> names = profileClient.displayNames(requests.stream().map(r -> counterpart(r, user)).toList());
        OffsetDateTime now = OffsetDateTime.now();
        List<ConversationSummary> out = new ArrayList<>();
        for (MentoringRequest r : requests) {
            Object[] row = stats.get(r.getId());
            // Yêu cầu đã đóng và không có tin nào thì không hiện trong hộp thư.
            if (row == null && !MessageRules.isWritable(status(r), closedAt(r), now)) continue;
            boolean masked = row != null && !contactsVisible(r);
            out.add(summary(r, user, names, row, masked, now));
        }
        out.sort(Comparator.comparing((ConversationSummary c) -> c.lastMessageAt() == null ? OffsetDateTime.MIN : c.lastMessageAt())
                .reversed());
        return out;
    }

    public UnreadCount unread(AuthUser user) {
        return new UnreadCount(user.userId() == null ? 0 : messageRepo.countUnread(user.userId()));
    }

    // ------------------------------------------------------------------ luồng tin nhắn

    /** Toàn bộ luồng (tối đa 200 tin mới nhất) hoặc chỉ tin sau {@code after} khi polling; luôn đánh dấu đã đọc. */
    public ConversationView get(AuthUser user, UUID conversationId, OffsetDateTime after) {
        MentoringRequest r = findConversation(conversationId);
        requireParticipant(user, r);
        OffsetDateTime now = OffsetDateTime.now();
        List<Message> messages = tx.execute(s -> {
            List<Message> page;
            if (after != null) {
                page = messageRepo.findByConversationIdAndCreatedAtAfterOrderByCreatedAtAsc(conversationId, after);
            } else {
                page = new ArrayList<>(messageRepo.findByConversationIdOrderByCreatedAtDesc(conversationId, PageRequest.of(0, PAGE)));
                Collections.reverse(page);
            }
            messageRepo.markRead(conversationId, user.userId(), now);
            return page;
        });
        boolean visible = contactsVisible(r);
        Map<UUID, String> names = profileClient.displayNames(List.of(counterpart(r, user)));
        boolean isMentee = user.userId().equals(r.getMenteeId());
        long menteeSent = isMentee && !GoalRules.isRelationship(status(r))
                ? messageRepo.countByConversationIdAndSenderId(conversationId, r.getMenteeId()) : 0;
        Message last = messages.isEmpty() ? null : messages.get(messages.size() - 1);
        Object[] lastRow = last == null ? null
                : new Object[]{conversationId.toString(), last.getCreatedAt(), last.getBody(), last.getSenderId().toString(), 0L};
        OffsetDateTime closed = closedAt(r);
        OffsetDateTime readOnlyAt = "CANCELLED".equals(status(r)) ? r.getRespondedAt()
                : closed == null ? null : closed.plus(MessageRules.CLOSE_GRACE);
        return new ConversationView(summary(r, user, names, lastRow, !visible, now),
                messages.stream().map(m -> view(m, user, !visible)).toList(), !visible,
                MessageRules.remainingPreAccept(isMentee, status(r), menteeSent), readOnlyAt, POLL_SECONDS);
    }

    public MessageView send(AuthUser user, UUID conversationId, SendMessageInput in) {
        String body = MessageRules.validateBody(in.body());
        MentoringRequest r = findConversation(conversationId);
        requireParticipant(user, r);
        boolean isMentee = user.userId().equals(r.getMenteeId());
        record Sent(Message message, boolean firstUnread) {
        }
        Sent sent = tx.execute(s -> {
            messageRepo.lockConversation(conversationId);
            MentoringRequest fresh = findConversation(conversationId);
            // Postgres lưu tới micro giây — cắt trước để createdAt trả về khớp mốc `after` khi polling.
            OffsetDateTime now = OffsetDateTime.now().truncatedTo(ChronoUnit.MICROS);
            MessageRules.requireWritable(status(fresh), closedAt(fresh), now);
            if (isMentee) {
                MessageRules.requirePreAcceptQuota(true, status(fresh),
                        messageRepo.countByConversationIdAndSenderId(conversationId, user.userId()));
            }
            UUID recipient = counterpart(fresh, user);
            boolean firstUnread = messageRepo.countUnreadIn(conversationId, recipient) == 0;
            Message m = messageRepo.save(new Message(conversationId, user.userId(),
                    isMentee ? Message.SenderRole.MENTEE : Message.SenderRole.MENTOR, body, now));
            // Người gửi đã đọc hết luồng tới tin của chính mình.
            messageRepo.markRead(conversationId, user.userId(), now);
            return new Sent(m, firstUnread);
        });
        if (sent.firstUnread()) {
            // Chỉ báo 1 lần cho mỗi đợt tin chưa đọc để không spam trung tâm thông báo.
            String from = profileClient.displayNames(List.of(user.userId())).getOrDefault(user.userId(), "Người dùng");
            notifications.notifyUser(counterpart(r, user), "MESSAGE_RECEIVED", "Tin nhắn mới",
                    from + " vừa gửi tin nhắn cho bạn.", "/messages/" + conversationId);
        }
        return view(sent.message(), user, !contactsVisible(r));
    }

    // ------------------------------------------------------------------ kiểm duyệt (PRD-MSG-4)

    public MessageReportView report(AuthUser user, UUID messageId, ReportMessageInput in) {
        Message m = messageRepo.findById(messageId)
                .orElseThrow(() -> ApiException.notFound("MESSAGE_NOT_FOUND", "Không tìm thấy tin nhắn"));
        MentoringRequest r = findConversation(m.getConversationId());
        requireParticipant(user, r);
        if (m.getSenderId().equals(user.userId())) {
            throw ApiException.badRequest("CANNOT_REPORT_OWN_MESSAGE", "Không thể báo cáo tin nhắn của chính bạn");
        }
        String note = in.note() == null || in.note().isBlank() ? null : in.note().strip();
        MessageReport saved = tx.execute(s -> {
            messageRepo.lockConversation(m.getConversationId());
            if (reportRepo.existsByMessageIdAndReporterIdAndStatus(messageId, user.userId(), MessageReport.Status.OPEN)) {
                throw ApiException.conflict("ALREADY_REPORTED", "Bạn đã báo cáo tin nhắn này, quản trị viên đang xem xét");
            }
            return reportRepo.save(new MessageReport(messageId, m.getConversationId(), user.userId(), in.reason(), note,
                    OffsetDateTime.now()));
        });
        notifications.notifyRole("ADMIN", "MESSAGE_REPORTED", "Có tin nhắn bị báo cáo",
                "Lý do: " + in.reason() + ". Cần xem xét trong hàng đợi kiểm duyệt.", "/admin/message-reports/" + saved.getId());
        audit.record(user.userId(), user.role(), "MESSAGE_REPORTED", "MESSAGE_REPORT", saved.getId().toString(), null,
                AuditClient.fields("messageId", messageId, "conversationId", m.getConversationId(), "reason", in.reason()));
        return reportView(saved, m, false, Map.of());
    }

    public List<MessageReportView> adminList(String status) {
        List<MessageReport> reports;
        if (status == null || status.isBlank()) {
            reports = reportRepo.findAllByOrderByCreatedAtDesc();
        } else {
            MessageReport.Status st;
            try {
                st = MessageReport.Status.valueOf(status);
            } catch (IllegalArgumentException e) {
                throw ApiException.badRequest("INVALID_STATUS", "Trạng thái không hợp lệ: " + status);
            }
            reports = reportRepo.findByStatusOrderByCreatedAtAsc(st);
        }
        Map<UUID, Message> messages = new HashMap<>();
        messageRepo.findAllById(reports.stream().map(MessageReport::getMessageId).distinct().toList())
                .forEach(m -> messages.put(m.getId(), m));
        Map<UUID, String> names = profileClient.displayNames(Stream.concat(reports.stream().map(MessageReport::getReporterId),
                messages.values().stream().map(Message::getSenderId)).toList());
        return reports.stream().map(rep -> reportView(rep, messages.get(rep.getMessageId()), false, names)).toList();
    }

    /** Chi tiết hồ sơ: kèm toàn bộ cuộc trò chuyện (nguyên văn) chỉ khi hồ sơ còn OPEN. */
    public MessageReportView adminGet(AuthUser admin, UUID reportId) {
        MessageReport rep = findReport(reportId);
        Message m = messageRepo.findById(rep.getMessageId()).orElse(null);
        Map<UUID, String> names = profileClient.displayNames(m == null ? List.of(rep.getReporterId())
                : List.of(rep.getReporterId(), m.getSenderId()));
        boolean open = rep.getStatus() == MessageReport.Status.OPEN;
        if (open) {
            audit.record(admin.userId(), admin.role(), "MESSAGE_THREAD_VIEWED", "MESSAGE_REPORT", reportId.toString(), null,
                    AuditClient.fields("conversationId", rep.getConversationId()));
        }
        return reportView(rep, m, open, names);
    }

    public MessageReportView resolve(AuthUser admin, UUID reportId, ResolveReportInput in) {
        String note = in.note() == null || in.note().isBlank() ? null : in.note().strip();
        MessageReport rep = tx.execute(s -> {
            MessageReport r = findReport(reportId);
            if (r.getStatus() != MessageReport.Status.OPEN) {
                throw ApiException.conflict("REPORT_ALREADY_RESOLVED", "Hồ sơ kiểm duyệt đã được xử lý");
            }
            r.resolve(in.outcome(), note, admin.userId(), OffsetDateTime.now());
            return reportRepo.save(r);
        });
        Message m = messageRepo.findById(rep.getMessageId()).orElse(null);
        notifications.notifyUser(rep.getReporterId(), "MESSAGE_REPORT_RESOLVED", "Báo cáo tin nhắn đã được xử lý",
                in.outcome() == MessageReport.Outcome.WARNED
                        ? "Quản trị viên đã cảnh cáo người gửi. Cảm ơn bạn đã báo cáo."
                        : "Quản trị viên đã xem xét và không thấy vi phạm.", "/messages/" + rep.getConversationId());
        if (in.outcome() == MessageReport.Outcome.WARNED && m != null) {
            notifications.notifyUser(m.getSenderId(), "MESSAGE_WARNING", "Cảnh cáo về tin nhắn",
                    "Một tin nhắn của bạn vi phạm quy định cộng đồng" + (note == null ? "." : ": " + note),
                    "/messages/" + rep.getConversationId());
        }
        audit.record(admin.userId(), admin.role(), "MESSAGE_REPORT_RESOLVED", "MESSAGE_REPORT", reportId.toString(),
                AuditClient.fields("status", "OPEN"),
                AuditClient.fields("status", "RESOLVED", "outcome", in.outcome(), "note", note));
        Map<UUID, String> names = profileClient.displayNames(m == null ? List.of(rep.getReporterId())
                : List.of(rep.getReporterId(), m.getSenderId()));
        return reportView(rep, m, false, names);
    }

    // ------------------------------------------------------------------

    private MentoringRequest findConversation(UUID id) {
        return requestRepo.findById(id)
                .orElseThrow(() -> ApiException.notFound("CONVERSATION_NOT_FOUND", "Không tìm thấy cuộc trò chuyện"));
    }

    private MessageReport findReport(UUID id) {
        return reportRepo.findById(id)
                .orElseThrow(() -> ApiException.notFound("REPORT_NOT_FOUND", "Không tìm thấy hồ sơ kiểm duyệt"));
    }

    /** Chỉ hai bên tham gia — kể cả ADMIN cũng không đọc tin nhắn ngoài hồ sơ kiểm duyệt đang mở. */
    static void requireParticipant(AuthUser user, MentoringRequest r) {
        if (!GoalRules.isParticipant(user, r.getMentorId(), r.getMenteeId())) {
            throw ApiException.forbidden(user.isAdmin()
                    ? "Quản trị viên chỉ xem tin nhắn trong hồ sơ kiểm duyệt đang mở"
                    : "Bạn không thuộc cuộc trò chuyện này");
        }
    }

    private boolean contactsVisible(MentoringRequest r) {
        return sessionRepo.existsPaidConfirmedForPair(r.getMenteeId(), r.getMentorId());
    }

    static String status(MentoringRequest r) {
        return r.effectiveStatus().name();
    }

    /** Mốc yêu cầu đóng lại (bắt đầu tính 30 ngày còn nhắn được); null khi yêu cầu còn mở hoặc đã huỷ. */
    static OffsetDateTime closedAt(MentoringRequest r) {
        return switch (r.effectiveStatus()) {
            case ENDED -> r.getEndedAt() != null ? r.getEndedAt() : r.getRespondedAt();
            case REJECTED -> r.getRespondedAt();
            case EXPIRED -> r.getExpiredAt() != null ? r.getExpiredAt() : r.getCreatedAt();
            default -> null;
        };
    }

    private static UUID counterpart(MentoringRequest r, AuthUser user) {
        return user.userId().equals(r.getMenteeId()) ? r.getMentorId() : r.getMenteeId();
    }

    private ConversationSummary summary(MentoringRequest r, AuthUser user, Map<UUID, String> names, Object[] row,
                                        boolean masked, OffsetDateTime now) {
        UUID other = counterpart(r, user);
        String lastBody = row == null ? null : (String) row[2];
        OffsetDateTime lastAt = row == null ? null : toOffset(row[1]);
        boolean lastFromMe = row != null && user.userId().toString().equals(row[3]);
        long unread = row == null ? 0 : ((Number) row[4]).longValue();
        return new ConversationSummary(r.getId(), other, names.get(other),
                other.equals(r.getMentorId()) ? ROLE_MENTOR : ROLE_MENTEE, status(r),
                masked ? MessageRules.mask(lastBody) : lastBody, lastAt, lastFromMe, unread,
                MessageRules.isWritable(status(r), closedAt(r), now));
    }

    private static MessageView view(Message m, AuthUser viewer, boolean masked) {
        return new MessageView(m.getId(), m.getSenderId(), m.getSenderRole().name(),
                masked ? MessageRules.mask(m.getBody()) : m.getBody(),
                viewer != null && m.getSenderId().equals(viewer.userId()), m.getCreatedAt());
    }

    private MessageReportView reportView(MessageReport rep, Message m, boolean withThread, Map<UUID, String> names) {
        List<MessageView> thread = null;
        if (withThread) {
            List<Message> all = new ArrayList<>(messageRepo.findByConversationIdOrderByCreatedAtDesc(rep.getConversationId(),
                    PageRequest.of(0, PAGE)));
            Collections.reverse(all);
            thread = all.stream().map(x -> view(x, null, false)).toList();
        }
        return new MessageReportView(rep.getId(), rep.getConversationId(), rep.getReporterId(), names.get(rep.getReporterId()),
                rep.getReason().name(), rep.getNote(), rep.getStatus().name(),
                rep.getOutcome() == null ? null : rep.getOutcome().name(), rep.getResolutionNote(), rep.getCreatedAt(),
                rep.getResolvedAt(), m == null ? null : view(m, null, false), m == null ? null : names.get(m.getSenderId()),
                thread);
    }

    private static OffsetDateTime toOffset(Object v) {
        if (v == null) return null;
        if (v instanceof OffsetDateTime o) return o;
        if (v instanceof java.time.Instant i) return i.atOffset(java.time.ZoneOffset.UTC);
        if (v instanceof java.sql.Timestamp t) return t.toInstant().atOffset(java.time.ZoneOffset.UTC);
        throw new IllegalStateException("Unexpected timestamp type " + v.getClass());
    }
}
