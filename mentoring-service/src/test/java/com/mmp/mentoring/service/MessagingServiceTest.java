package com.mmp.mentoring.service;

import com.mmp.mentoring.client.AuditClient;
import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.MessagingDtos.*;
import com.mmp.mentoring.entity.MentoringRequest;
import com.mmp.mentoring.entity.Message;
import com.mmp.mentoring.entity.MessageReport;
import com.mmp.mentoring.entity.SessionType;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.MentoringRequestRepository;
import com.mmp.mentoring.repository.MessageReportRepository;
import com.mmp.mentoring.repository.MessageRepository;
import com.mmp.mentoring.repository.SessionRepository;
import com.mmp.mentoring.security.AuthUser;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** US-33 (PRD-MSG-1..4) — quyền, giới hạn trước khi chấp nhận, che liên hệ, thông báo, báo cáo tin nhắn. */
class MessagingServiceTest {

    private final MentoringRequestRepository requestRepo = mock(MentoringRequestRepository.class);
    private final MessageRepository messageRepo = mock(MessageRepository.class);
    private final MessageReportRepository reportRepo = mock(MessageReportRepository.class);
    private final SessionRepository sessionRepo = mock(SessionRepository.class);
    private final ProfileClient profileClient = mock(ProfileClient.class);
    private final NotificationService notifications = mock(NotificationService.class);
    private final AuditClient audit = mock(AuditClient.class);
    private final TransactionTemplate tx = mock(TransactionTemplate.class);
    private final MessagingService service = new MessagingService(requestRepo, messageRepo, reportRepo, sessionRepo,
            profileClient, notifications, audit, tx);

    private final UUID mentorId = UUID.randomUUID();
    private final UUID menteeId = UUID.randomUUID();
    private final AuthUser mentor = new AuthUser(mentorId, "m@x", "MENTOR");
    private final AuthUser mentee = new AuthUser(menteeId, "e@x", "MENTEE");
    private final AuthUser admin = new AuthUser(UUID.randomUUID(), "a@x", "ADMIN");
    private final AuthUser stranger = new AuthUser(UUID.randomUUID(), "s@x", "MENTEE");
    private final MentoringRequest request = new MentoringRequest(menteeId, mentorId, "Muốn học Spring Boot ".repeat(4),
            SessionType.CODE_REVIEW, MentoringRequest.Frequency.WEEKLY, 3, "Xin chào");
    private final UUID convId = UUID.randomUUID();
    private final List<Message> store = new ArrayList<>();

    @SuppressWarnings("unchecked")
    MessagingServiceTest() {
        ReflectionTestUtils.setField(request, "id", convId);
        when(requestRepo.findById(convId)).thenReturn(Optional.of(request));
        when(tx.execute(any())).thenAnswer(inv -> ((TransactionCallback<Object>) inv.getArgument(0)).doInTransaction(null));
        when(messageRepo.save(any())).thenAnswer(inv -> {
            Message m = inv.getArgument(0);
            ReflectionTestUtils.setField(m, "id", UUID.randomUUID());
            store.add(m);
            return m;
        });
        when(messageRepo.countByConversationIdAndSenderId(eq(convId), any())).thenAnswer(inv ->
                store.stream().filter(m -> m.getSenderId().equals(inv.getArgument(1))).count());
        when(messageRepo.findByConversationIdOrderByCreatedAtDesc(eq(convId), any())).thenAnswer(inv ->
                new ArrayList<>(store.reversed()));
        when(profileClient.displayNames(any())).thenReturn(Map.of(mentorId, "Mentor A", menteeId, "Mentee B"));
    }

    private MessageView send(AuthUser who, String body) {
        return service.send(who, convId, new SendMessageInput(body));
    }

    @Test
    void menteeCanSendThreeMessagesBeforeAcceptThenGets429() {
        send(mentee, "Chào anh 1");
        send(mentee, "Chào anh 2");
        send(mentee, "Chào anh 3");
        assertThatThrownBy(() -> send(mentee, "Chào anh 4"))
                .isInstanceOf(ApiException.class)
                .hasFieldOrPropertyWithValue("status", HttpStatus.TOO_MANY_REQUESTS)
                .hasFieldOrPropertyWithValue("code", "MESSAGE_LIMIT_BEFORE_ACCEPT");
        assertThat(store).hasSize(3);
    }

    @Test
    void mentorRepliesAndAcceptedMenteeAreNotLimited() {
        for (int i = 0; i < 5; i++) send(mentor, "Trả lời " + i);
        request.setStatus(MentoringRequest.Status.ACCEPTED);
        for (int i = 0; i < 5; i++) send(mentee, "Tin " + i);
        assertThat(store).hasSize(10);
    }

    @Test
    void strangerAndAdminCannotReadOrSend() {
        assertThatThrownBy(() -> send(stranger, "hi")).hasFieldOrPropertyWithValue("status", HttpStatus.FORBIDDEN);
        assertThatThrownBy(() -> service.get(admin, convId, null)).hasFieldOrPropertyWithValue("status", HttpStatus.FORBIDDEN);
    }

    @Test
    void phoneIsStoredAsTypedButMaskedBeforeFirstPaidSession() {
        when(sessionRepo.existsPaidConfirmedForPair(menteeId, mentorId)).thenReturn(false);
        MessageView sent = send(mentee, "call me 0912345678");
        assertThat(store.get(0).getBody()).isEqualTo("call me 0912345678");
        assertThat(sent.body()).isEqualTo("call me 09•••••••78");

        ConversationView view = service.get(mentor, convId, null);
        assertThat(view.contactsMasked()).isTrue();
        assertThat(view.messages()).extracting(MessageView::body).containsExactly("call me 09•••••••78");
        assertThat(view.conversation().lastMessage()).isEqualTo("call me 09•••••••78");
    }

    @Test
    void contactsVisibleAfterPaidSessionConfirmed() {
        send(mentee, "call me 0912345678");
        when(sessionRepo.existsPaidConfirmedForPair(menteeId, mentorId)).thenReturn(true);
        ConversationView view = service.get(mentor, convId, null);
        assertThat(view.contactsMasked()).isFalse();
        assertThat(view.messages().get(0).body()).isEqualTo("call me 0912345678");
    }

    @Test
    void openingThreadMarksReadAndShowsRemainingQuota() {
        send(mentee, "Chào anh");
        ConversationView view = service.get(mentee, convId, null);
        verify(messageRepo, atLeastOnce()).markRead(eq(convId), eq(menteeId), any());
        assertThat(view.remainingBeforeAccept()).isEqualTo(2);
        assertThat(view.pollIntervalSeconds()).isEqualTo(10);
        assertThat(view.messages().get(0).mine()).isTrue();
        assertThat(service.get(mentor, convId, null).remainingBeforeAccept()).isNull();
    }

    @Test
    void endedMoreThan30DaysAgoIsReadOnly() {
        request.setStatus(MentoringRequest.Status.ACCEPTED);
        request.end("MENTEE", MentoringRequest.EndReason.GOAL_REACHED, null, OffsetDateTime.now().minusDays(31));
        assertThatThrownBy(() -> send(mentor, "Chào em"))
                .hasFieldOrPropertyWithValue("code", "CONVERSATION_READ_ONLY");
        assertThat(service.get(mentor, convId, null).conversation().writable()).isFalse();
    }

    @Test
    void endedRecentlyIsStillWritable() {
        request.setStatus(MentoringRequest.Status.ACCEPTED);
        request.end("MENTEE", MentoringRequest.EndReason.GOAL_REACHED, null, OffsetDateTime.now().minusDays(3));
        send(mentor, "Chúc em thành công");
        assertThat(store).hasSize(1);
    }

    @Test
    void notifiesRecipientOnlyForFirstUnreadMessage() {
        when(messageRepo.countUnreadIn(convId, mentorId)).thenReturn(0L, 1L);
        send(mentee, "Tin 1");
        send(mentee, "Tin 2");
        verify(notifications, times(1)).notifyUser(eq(mentorId), eq("MESSAGE_RECEIVED"), any(), any(), eq("/messages/" + convId));
    }

    @Test
    void reportCreatesOpenCaseAndNotifiesAdmins() {
        send(mentor, "Chuyển khoản riêng cho anh nhé");
        Message m = store.get(0);
        when(messageRepo.findById(m.getId())).thenReturn(Optional.of(m));
        when(reportRepo.save(any())).thenAnswer(inv -> {
            MessageReport r = inv.getArgument(0);
            ReflectionTestUtils.setField(r, "id", UUID.randomUUID());
            return r;
        });
        MessageReportView v = service.report(mentee, m.getId(),
                new ReportMessageInput(MessageReport.Reason.OFF_PLATFORM_PAYMENT, "Đòi trả ngoài nền tảng"));
        assertThat(v.status()).isEqualTo("OPEN");
        assertThat(v.thread()).isNull();
        verify(notifications).notifyRole(eq("ADMIN"), eq("MESSAGE_REPORTED"), any(), any(), any());
    }

    @Test
    void cannotReportOwnMessageOrTwice() {
        send(mentor, "Tin của mentor");
        Message m = store.get(0);
        when(messageRepo.findById(m.getId())).thenReturn(Optional.of(m));
        assertThatThrownBy(() -> service.report(mentor, m.getId(), new ReportMessageInput(MessageReport.Reason.SPAM, null)))
                .hasFieldOrPropertyWithValue("code", "CANNOT_REPORT_OWN_MESSAGE");
        when(reportRepo.existsByMessageIdAndReporterIdAndStatus(m.getId(), menteeId, MessageReport.Status.OPEN)).thenReturn(true);
        assertThatThrownBy(() -> service.report(mentee, m.getId(), new ReportMessageInput(MessageReport.Reason.SPAM, null)))
                .hasFieldOrPropertyWithValue("code", "ALREADY_REPORTED");
    }

    @Test
    void moderatorSeesRawThreadOnlyWhileCaseOpen() {
        when(sessionRepo.existsPaidConfirmedForPair(any(), any())).thenReturn(false);
        send(mentor, "Gọi anh 0912345678");
        Message m = store.get(0);
        when(messageRepo.findById(m.getId())).thenReturn(Optional.of(m));
        MessageReport rep = new MessageReport(m.getId(), convId, menteeId, MessageReport.Reason.OFF_PLATFORM_PAYMENT, null,
                OffsetDateTime.now());
        UUID repId = UUID.randomUUID();
        ReflectionTestUtils.setField(rep, "id", repId);
        when(reportRepo.findById(repId)).thenReturn(Optional.of(rep));
        when(reportRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        MessageReportView open = service.adminGet(admin, repId);
        assertThat(open.thread()).extracting(MessageView::body).containsExactly("Gọi anh 0912345678");

        MessageReportView resolved = service.resolve(admin, repId,
                new ResolveReportInput(MessageReport.Outcome.WARNED, "Không hẹn giao dịch ngoài"));
        assertThat(resolved.status()).isEqualTo("RESOLVED");
        assertThat(service.adminGet(admin, repId).thread()).isNull();
        verify(notifications).notifyUser(eq(mentorId), eq("MESSAGE_WARNING"), any(), any(), any());
        assertThatThrownBy(() -> service.resolve(admin, repId, new ResolveReportInput(MessageReport.Outcome.DISMISSED, null)))
                .hasFieldOrPropertyWithValue("code", "REPORT_ALREADY_RESOLVED");
    }
}
