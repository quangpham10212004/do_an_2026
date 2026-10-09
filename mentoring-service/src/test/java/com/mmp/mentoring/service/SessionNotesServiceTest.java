package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.SessionNotesDtos.*;
import com.mmp.mentoring.entity.ActionItem;
import com.mmp.mentoring.entity.MentorPrivateNote;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.entity.SessionNote;
import com.mmp.mentoring.repository.ActionItemRepository;
import com.mmp.mentoring.repository.MentorPrivateNoteRepository;
import com.mmp.mentoring.repository.SessionNoteRepository;
import com.mmp.mentoring.repository.SessionRepository;
import com.mmp.mentoring.security.AuthUser;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** US-40 (PRD-SES-10..12) — ghi chú chung có version, action item mang sang phiên sau, ghi chú riêng chỉ mentor thấy. */
class SessionNotesServiceTest {

    private final SessionRepository sessionRepo = mock(SessionRepository.class);
    private final SessionNoteRepository noteRepo = mock(SessionNoteRepository.class);
    private final ActionItemRepository itemRepo = mock(ActionItemRepository.class);
    private final MentorPrivateNoteRepository privateRepo = mock(MentorPrivateNoteRepository.class);
    private final ProfileClient profileClient = mock(ProfileClient.class);
    private final NotificationService notifications = mock(NotificationService.class);
    private final TransactionTemplate tx = mock(TransactionTemplate.class);
    private final SessionNotesService service = new SessionNotesService(sessionRepo, noteRepo, itemRepo, privateRepo,
            profileClient, notifications, tx, "Asia/Ho_Chi_Minh");

    private final UUID mentorId = UUID.randomUUID();
    private final UUID menteeId = UUID.randomUUID();
    private final AuthUser mentor = new AuthUser(mentorId, "m@x", "MENTOR");
    private final AuthUser mentee = new AuthUser(menteeId, "e@x", "MENTEE");
    private final AuthUser admin = new AuthUser(UUID.randomUUID(), "a@x", "ADMIN");
    private final MentoringSession session = new MentoringSession();
    private final UUID sessionId = UUID.randomUUID();
    private final Map<UUID, SessionNote> notes = new HashMap<>();
    private final Map<UUID, MentorPrivateNote> privates = new HashMap<>();
    private final List<ActionItem> items = new ArrayList<>();
    private final LocalDate today = LocalDate.now(ZoneId.of("Asia/Ho_Chi_Minh"));

    @SuppressWarnings("unchecked")
    SessionNotesServiceTest() {
        ReflectionTestUtils.setField(session, "id", sessionId);
        session.setMentorId(mentorId);
        session.setMenteeId(menteeId);
        session.setScheduledAt(OffsetDateTime.now().plusDays(1));
        session.setStatus(MentoringSession.Status.CONFIRMED);
        when(sessionRepo.findById(sessionId)).thenReturn(Optional.of(session));
        when(sessionRepo.findForUpdate(sessionId)).thenReturn(Optional.of(session));
        when(tx.execute(any())).thenAnswer(inv -> ((TransactionCallback<Object>) inv.getArgument(0)).doInTransaction(null));
        doAnswer(inv -> {
            inv.<java.util.function.Consumer<org.springframework.transaction.TransactionStatus>>getArgument(0).accept(null);
            return null;
        }).when(tx).executeWithoutResult(any());
        when(noteRepo.ensureExists(sessionId)).thenAnswer(inv -> {
            notes.computeIfAbsent(sessionId, id -> new SessionNote(id, OffsetDateTime.now()));
            return 1;
        });
        when(noteRepo.findForUpdate(sessionId)).thenAnswer(inv -> Optional.ofNullable(notes.get(sessionId)));
        when(noteRepo.findById(sessionId)).thenAnswer(inv -> Optional.ofNullable(notes.get(sessionId)));
        when(noteRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(privateRepo.findById(sessionId)).thenAnswer(inv -> Optional.ofNullable(privates.get(sessionId)));
        when(privateRepo.save(any())).thenAnswer(inv -> {
            MentorPrivateNote p = inv.getArgument(0);
            privates.put(p.getSessionId(), p);
            return p;
        });
        when(itemRepo.save(any())).thenAnswer(inv -> {
            ActionItem a = inv.getArgument(0);
            if (a.getId() == null) {
                ReflectionTestUtils.setField(a, "id", UUID.randomUUID());
                items.add(a);
            }
            return a;
        });
        when(itemRepo.countBySessionId(sessionId)).thenAnswer(inv -> items.stream().filter(a -> a.getSessionId().equals(sessionId)).count());
        when(itemRepo.findForSession(eq(sessionId), any(), any(), any())).thenAnswer(inv -> new ArrayList<>(items));
        when(itemRepo.findById(any())).thenAnswer(inv -> items.stream().filter(a -> a.getId().equals(inv.getArgument(0))).findFirst());
        when(profileClient.displayNames(any())).thenReturn(Map.of(mentorId, "Mentor A", menteeId, "Mentee B"));
    }

    @Test
    void bothSidesEditSharedNotesAndLastEditorIsShown() {
        SharedNoteView v1 = service.saveShared(mentee, sessionId, new SaveNoteInput("# Câu hỏi\n- REST", 0));
        assertThat(v1.version()).isEqualTo(1);
        SharedNoteView v2 = service.saveShared(mentor, sessionId, new SaveNoteInput("# Câu hỏi\n- REST\n- Cache", 1));
        assertThat(v2.version()).isEqualTo(2);
        assertThat(v2.updatedBy()).isEqualTo(mentorId);
        assertThat(v2.updatedByName()).isEqualTo("Mentor A");
    }

    @Test
    void staleBaseVersionIs409Conflict() {
        service.saveShared(mentee, sessionId, new SaveNoteInput("bản của mentee", 0));
        assertThatThrownBy(() -> service.saveShared(mentor, sessionId, new SaveNoteInput("bản của mentor", 0)))
                .hasFieldOrPropertyWithValue("status", HttpStatus.CONFLICT)
                .hasFieldOrPropertyWithValue("code", "NOTES_CONFLICT");
        assertThat(notes.get(sessionId).getContent()).isEqualTo("bản của mentee");
    }

    @Test
    void unchangedContentDoesNotBumpVersion() {
        service.saveShared(mentee, sessionId, new SaveNoteInput("abc", 0));
        assertThat(service.saveShared(mentee, sessionId, new SaveNoteInput("abc", 1)).version()).isEqualTo(1);
    }

    @Test
    void cancelledSessionNotesAreReadOnly() {
        session.setStatus(MentoringSession.Status.CANCELLED);
        assertThatThrownBy(() -> service.saveShared(mentee, sessionId, new SaveNoteInput("x", 0)))
                .hasFieldOrPropertyWithValue("code", "SESSION_NOTES_READ_ONLY");
        assertThat(service.get(mentee, sessionId).editable()).isFalse();
    }

    @Test
    void privateNoteIsMentorOnly() {
        service.savePrivate(mentor, sessionId, new SavePrivateNoteInput("Mentee yếu SQL, cần bài tập join"));
        assertThat(service.get(mentor, sessionId).privateNote().content()).isEqualTo("Mentee yếu SQL, cần bài tập join");
        assertThat(service.get(mentee, sessionId).privateNote()).isNull();
        assertThatThrownBy(() -> service.savePrivate(mentee, sessionId, new SavePrivateNoteInput("x")))
                .hasFieldOrPropertyWithValue("status", HttpStatus.FORBIDDEN);
    }

    @Test
    void adminCannotReadNotes() {
        assertThatThrownBy(() -> service.get(admin, sessionId)).hasFieldOrPropertyWithValue("status", HttpStatus.FORBIDDEN);
    }

    @Test
    void actionItemAssignedToOtherSideNotifiesThem() {
        ActionItemView v = service.addItem(mentor, sessionId,
                new ActionItemInput("Đọc chương 3 sách Clean Code", ActionItem.Owner.MENTEE, today.plusDays(7)));
        assertThat(v.owner()).isEqualTo("MENTEE");
        assertThat(v.carriedOver()).isFalse();
        verify(notifications).notifyUser(eq(menteeId), eq("ACTION_ITEM_ASSIGNED"), any(), any(), any());
        service.addItem(mentor, sessionId, new ActionItemInput("Gửi tài liệu", ActionItem.Owner.MENTOR, null));
        verifyNoMoreInteractions(notifications);
    }

    @Test
    void dueDateInPastIsRejected() {
        assertThatThrownBy(() -> service.addItem(mentee, sessionId,
                new ActionItemInput("Làm bài", ActionItem.Owner.MENTEE, today.minusDays(1))))
                .hasFieldOrPropertyWithValue("code", "INVALID_DUE_DATE");
    }

    @Test
    void itemFromEarlierSessionIsCarriedOverUntilDone() {
        MentoringSession earlier = new MentoringSession();
        ReflectionTestUtils.setField(earlier, "id", UUID.randomUUID());
        earlier.setMentorId(mentorId);
        earlier.setMenteeId(menteeId);
        ActionItem old = new ActionItem(earlier, "Hoàn thiện CV", ActionItem.Owner.MENTEE, today.minusDays(2), mentorId,
                OffsetDateTime.now().minusDays(9));
        ReflectionTestUtils.setField(old, "id", UUID.randomUUID());
        items.add(old);
        ActionItemView carried = service.get(mentee, sessionId).actionItems().get(0);
        assertThat(carried.carriedOver()).isTrue();
        assertThat(carried.overdue()).isTrue();

        ActionItemView done = service.updateItem(mentee, old.getId(), new ActionItemUpdate(null, null, null, null, true));
        assertThat(done.done()).isTrue();
        assertThat(done.doneAt()).isNotNull();
        assertThat(done.overdue()).isFalse();
    }

    @Test
    void sessionHasAtMost20Items() {
        for (int i = 0; i < SessionNoteRules.MAX_ITEMS_PER_SESSION; i++) {
            service.addItem(mentee, sessionId, new ActionItemInput("Việc " + i, ActionItem.Owner.MENTEE, null));
        }
        assertThatThrownBy(() -> service.addItem(mentee, sessionId, new ActionItemInput("Việc thừa", ActionItem.Owner.MENTEE, null)))
                .hasFieldOrPropertyWithValue("code", "ACTION_ITEM_LIMIT");
    }

    @Test
    void strangerCannotEditItem() {
        ActionItemView v = service.addItem(mentee, sessionId, new ActionItemInput("Việc", ActionItem.Owner.MENTEE, null));
        AuthUser stranger = new AuthUser(UUID.randomUUID(), "s@x", "MENTEE");
        assertThatThrownBy(() -> service.updateItem(stranger, v.id(), new ActionItemUpdate("hack", null, null, null, null)))
                .hasFieldOrPropertyWithValue("status", HttpStatus.FORBIDDEN);
        assertThatThrownBy(() -> service.deleteItem(stranger, v.id()))
                .hasFieldOrPropertyWithValue("status", HttpStatus.FORBIDDEN);
    }
}
