package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.SessionNotesDtos.*;
import com.mmp.mentoring.entity.ActionItem;
import com.mmp.mentoring.entity.MentorPrivateNote;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.entity.SessionNote;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.ActionItemRepository;
import com.mmp.mentoring.repository.MentorPrivateNoteRepository;
import com.mmp.mentoring.repository.SessionNoteRepository;
import com.mmp.mentoring.repository.SessionRepository;
import com.mmp.mentoring.security.AuthUser;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

/**
 * US-40 (PRD-SES-10..12) — ghi chú phiên.
 *
 * - Ghi chú chung (markdown): cả hai bên sửa, frontend autosave; mỗi lần lưu tăng version, lưu với baseVersion cũ → 409
 *   NOTES_CONFLICT (dòng ghi chú bị khoá FOR UPDATE nên hai lần lưu đồng thời không ghi đè nhau).
 * - Action item thuộc về cặp mentor–mentee: trang phiên hiện việc của phiên này + việc còn mở từ phiên trước;
 *   không gian mentoring hiện mọi việc còn mở của cặp (RelationshipWorkspaceService).
 * - Ghi chú riêng của mentor: chỉ mentor của phiên đọc/ghi.
 * - Tên hiển thị lấy từ profile-service NGOÀI transaction.
 */
@Service
public class SessionNotesService {

    private final SessionRepository sessionRepo;
    private final SessionNoteRepository noteRepo;
    private final ActionItemRepository itemRepo;
    private final MentorPrivateNoteRepository privateRepo;
    private final ProfileClient profileClient;
    private final NotificationService notifications;
    private final TransactionTemplate tx;
    private final ZoneId zone;

    public SessionNotesService(SessionRepository sessionRepo, SessionNoteRepository noteRepo, ActionItemRepository itemRepo,
                               MentorPrivateNoteRepository privateRepo, ProfileClient profileClient,
                               NotificationService notifications, TransactionTemplate tx,
                               @Value("${app.timezone}") String timezone) {
        this.sessionRepo = sessionRepo;
        this.noteRepo = noteRepo;
        this.itemRepo = itemRepo;
        this.privateRepo = privateRepo;
        this.profileClient = profileClient;
        this.notifications = notifications;
        this.tx = tx;
        this.zone = ZoneId.of(timezone);
    }

    public SessionNotesView get(AuthUser user, UUID sessionId) {
        MentoringSession s = findSession(sessionId);
        SessionNoteRules.requireParticipant(user, s.getMentorId(), s.getMenteeId());
        SessionNote note = noteRepo.findById(sessionId).orElse(null);
        List<ActionItem> items = itemRepo.findForSession(sessionId, s.getMenteeId(), s.getMentorId(), s.getScheduledAt());
        boolean isMentor = user.userId().equals(s.getMentorId());
        PrivateNoteView privateNote = !isMentor ? null : privateRepo.findById(sessionId)
                .map(p -> new PrivateNoteView(p.getContent(), p.getUpdatedAt()))
                .orElse(new PrivateNoteView("", null));
        return new SessionNotesView(sessionId, shared(note), items(items, sessionId), privateNote,
                SessionNoteRules.isEditable(s.getStatus().name()), isMentor ? "MENTOR" : "MENTEE",
                SessionNoteRules.MAX_ITEMS_PER_SESSION);
    }

    public SharedNoteView saveShared(AuthUser user, UUID sessionId, SaveNoteInput in) {
        String content = SessionNoteRules.validateNotes(in.content(), SessionNoteRules.NOTES_MAX);
        SessionNote saved = tx.execute(st -> {
            MentoringSession s = findSession(sessionId);
            SessionNoteRules.requireParticipant(user, s.getMentorId(), s.getMenteeId());
            SessionNoteRules.requireEditable(s.getStatus().name());
            noteRepo.ensureExists(sessionId);
            SessionNote n = noteRepo.findForUpdate(sessionId).orElseThrow();
            SessionNoteRules.requireVersion(in.baseVersion(), n.getVersion());
            if (!content.equals(n.getContent())) {
                n.edit(content, user.userId(), OffsetDateTime.now());
            }
            return noteRepo.save(n);
        });
        return shared(saved);
    }

    public PrivateNoteView savePrivate(AuthUser user, UUID sessionId, SavePrivateNoteInput in) {
        String content = SessionNoteRules.validateNotes(in.content(), SessionNoteRules.PRIVATE_MAX);
        MentorPrivateNote saved = tx.execute(st -> {
            MentoringSession s = findSession(sessionId);
            SessionNoteRules.requireMentor(user, s.getMentorId());
            OffsetDateTime now = OffsetDateTime.now();
            MentorPrivateNote p = privateRepo.findById(sessionId).orElseGet(() -> new MentorPrivateNote(sessionId, s.getMentorId(), now));
            p.edit(content, now);
            return privateRepo.save(p);
        });
        return new PrivateNoteView(saved.getContent(), saved.getUpdatedAt());
    }

    public ActionItemView addItem(AuthUser user, UUID sessionId, ActionItemInput in) {
        String text = SessionNoteRules.validateItemText(in.text());
        SessionNoteRules.validateDueDate(in.dueDate(), today());
        MentoringSession session = findSession(sessionId);
        ActionItem saved = tx.execute(st -> {
            MentoringSession s = sessionRepo.findForUpdate(sessionId).orElseThrow();
            SessionNoteRules.requireParticipant(user, s.getMentorId(), s.getMenteeId());
            SessionNoteRules.requireEditable(s.getStatus().name());
            SessionNoteRules.requireCanAddItem(itemRepo.countBySessionId(sessionId));
            return itemRepo.save(new ActionItem(s, text, in.owner(), in.dueDate(), user.userId(), OffsetDateTime.now()));
        });
        notifyAssignee(user, session, saved);
        return ActionItemView.from(saved, sessionId, today());
    }

    public ActionItemView updateItem(AuthUser user, UUID itemId, ActionItemUpdate in) {
        String text = in.text() == null ? null : SessionNoteRules.validateItemText(in.text());
        boolean clear = Boolean.TRUE.equals(in.clearDueDate());
        if (!clear) SessionNoteRules.validateDueDate(in.dueDate(), today());
        ActionItem saved = tx.execute(st -> {
            ActionItem a = findItem(itemId);
            SessionNoteRules.requireParticipant(user, a.getMentorId(), a.getMenteeId());
            a.update(text, in.owner(), in.dueDate(), clear, in.done(), OffsetDateTime.now());
            return itemRepo.save(a);
        });
        return ActionItemView.from(saved, null, today());
    }

    public void deleteItem(AuthUser user, UUID itemId) {
        tx.executeWithoutResult(st -> {
            ActionItem a = findItem(itemId);
            SessionNoteRules.requireParticipant(user, a.getMentorId(), a.getMenteeId());
            itemRepo.delete(a);
        });
    }

    /** Không gian mentoring: việc còn mở của cặp (mọi phiên). */
    public List<ActionItemView> openItemsForPair(UUID menteeId, UUID mentorId) {
        LocalDate today = today();
        return itemRepo.findByMenteeIdAndMentorIdAndDoneFalseOrderByDueDateAscCreatedAtAsc(menteeId, mentorId).stream()
                .map(a -> ActionItemView.from(a, null, today)).toList();
    }

    // ------------------------------------------------------------------

    private void notifyAssignee(AuthUser user, MentoringSession s, ActionItem a) {
        UUID assignee = a.getOwner() == ActionItem.Owner.MENTOR ? s.getMentorId() : s.getMenteeId();
        if (assignee.equals(user.userId())) return;
        notifications.notifyUser(assignee, "ACTION_ITEM_ASSIGNED", "Bạn có việc cần làm mới",
                a.getText() + (a.getDueDate() == null ? "" : " (hạn " + a.getDueDate() + ")"),
                "/mentoring/sessions/" + s.getId() + "/notes");
    }

    private List<ActionItemView> items(List<ActionItem> items, UUID sessionId) {
        LocalDate today = today();
        return items.stream().map(a -> ActionItemView.from(a, sessionId, today)).toList();
    }

    private SharedNoteView shared(SessionNote n) {
        if (n == null) return new SharedNoteView("", 0, null, null, null);
        String name = n.getUpdatedBy() == null ? null
                : profileClient.displayNames(List.of(n.getUpdatedBy())).getOrDefault(n.getUpdatedBy(), null);
        return new SharedNoteView(n.getContent(), n.getVersion(), n.getUpdatedBy(), name, n.getUpdatedAt());
    }

    private LocalDate today() {
        return LocalDate.now(zone);
    }

    private MentoringSession findSession(UUID id) {
        return sessionRepo.findById(id)
                .orElseThrow(() -> ApiException.notFound("SESSION_NOT_FOUND", "Không tìm thấy phiên mentoring"));
    }

    private ActionItem findItem(UUID id) {
        return itemRepo.findById(id)
                .orElseThrow(() -> ApiException.notFound("ACTION_ITEM_NOT_FOUND", "Không tìm thấy việc cần làm"));
    }
}
