package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.MockInterviewDtos.MockInterviewView;
import com.mmp.mentoring.dto.MockInterviewDtos.ScorecardInput;
import com.mmp.mentoring.entity.ActionItem;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.entity.MockIntake;
import com.mmp.mentoring.entity.MockScorecard;
import com.mmp.mentoring.entity.SessionType;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.ActionItemRepository;
import com.mmp.mentoring.repository.MockIntakeRepository;
import com.mmp.mentoring.repository.MockScorecardRepository;
import com.mmp.mentoring.repository.SessionRepository;
import com.mmp.mentoring.security.AuthUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
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

/** US-58 — phiếu đánh giá phỏng vấn thử: quyền, thời điểm, 3 việc cần làm tạo đúng 1 lần, nhắc / thiếu phiếu. */
class MockInterviewServiceTest {

    private final SessionRepository sessionRepo = mock(SessionRepository.class);
    private final MockIntakeRepository intakeRepo = mock(MockIntakeRepository.class);
    private final MockScorecardRepository cardRepo = mock(MockScorecardRepository.class);
    private final ActionItemRepository itemRepo = mock(ActionItemRepository.class);
    private final ProfileClient profileClient = mock(ProfileClient.class);
    private final NotificationService notifications = mock(NotificationService.class);
    private final TransactionTemplate tx = mock(TransactionTemplate.class);

    private final UUID mentorId = UUID.randomUUID();
    private final UUID menteeId = UUID.randomUUID();
    private final AuthUser mentor = new AuthUser(mentorId, "mentor@test", "MENTOR");
    private final AuthUser mentee = new AuthUser(menteeId, "mentee@test", "MENTEE");
    private final List<ActionItem> items = new ArrayList<>();
    private MentoringSession session;
    private MockScorecard stored;
    private MockInterviewService service;

    private static final ScorecardInput INPUT = new ScorecardInput(8, 6, 7, 5, null, MockScorecard.Verdict.LEAN_NO,
            List.of("Nói rõ độ phức tạp thuật toán", "Hỏi lại yêu cầu trước khi code", "Viết test cho trường hợp biên"),
            "Cố lên, nền tảng tốt.");

    @BeforeEach
    void setUp() {
        when(tx.execute(any())).thenAnswer(inv -> inv.<TransactionCallback<?>>getArgument(0).doInTransaction(null));
        session = new MentoringSession();
        ReflectionTestUtils.setField(session, "id", UUID.randomUUID());
        session.setMentorId(mentorId);
        session.setMenteeId(menteeId);
        session.setSessionType(SessionType.MOCK_INTERVIEW);
        session.setDurationMinutes(60);
        session.setScheduledAt(OffsetDateTime.now().minusHours(3)); // đã kết thúc 2 giờ trước
        session.setStatus(MentoringSession.Status.AWAITING_ATTENDANCE);
        when(sessionRepo.findById(session.getId())).thenReturn(Optional.of(session));
        when(intakeRepo.findById(session.getId())).thenReturn(Optional.of(new MockIntake(session.getId(),
                MockIntake.InterviewType.BACKEND, MockIntake.Level.FRESHER, "Backend Java Fresher", null, null, null)));
        when(cardRepo.findById(session.getId())).thenAnswer(inv -> Optional.ofNullable(stored));
        when(cardRepo.save(any())).thenAnswer(inv -> stored = inv.getArgument(0));
        when(itemRepo.save(any())).thenAnswer(inv -> {
            items.add(inv.getArgument(0));
            return inv.getArgument(0);
        });
        when(profileClient.displayNames(any())).thenReturn(Map.of(mentorId, "Long"));
        service = new MockInterviewService(sessionRepo, intakeRepo, cardRepo, itemRepo, profileClient, notifications, tx);
    }

    @Test
    void firstSubmitScoresWithTypeWeightsAndCreatesThreeMenteeActionItems() {
        MockInterviewView v = service.submit(mentor, session.getId(), INPUT);
        assertThat(v.scorecard().overall()).isEqualByComparingTo(new BigDecimal("6.80"));
        assertThat(v.scorecard().verdict()).isEqualTo(MockScorecard.Verdict.LEAN_NO);
        assertThat(items).hasSize(3).allMatch(i -> i.getOwner() == ActionItem.Owner.MENTEE);
        verify(notifications).notifyUser(eq(menteeId), eq("MOCK_SCORECARD_READY"), any(), any(), any());

        // Sửa lại: cập nhật điểm, không tạo thêm việc cần làm, không báo lại
        service.submit(mentor, session.getId(), new ScorecardInput(9, 6, 7, 5, 8, MockScorecard.Verdict.HIRE, INPUT.fixes(), null));
        assertThat(stored.getTechnical()).isEqualTo(9);
        assertThat(stored.getLiveCoding()).isEqualTo(8);
        assertThat(items).hasSize(3);
        verify(notifications, times(1)).notifyUser(any(), eq("MOCK_SCORECARD_READY"), any(), any(), any());
    }

    @Test
    void onlyTheSessionsMentorScoresAndOnlyAfterTheSessionEnded() {
        AuthUser other = new AuthUser(UUID.randomUUID(), "x@test", "MENTOR");
        assertThatThrownBy(() -> service.submit(other, session.getId(), INPUT)).isInstanceOf(ApiException.class);
        session.setScheduledAt(OffsetDateTime.now().plusHours(1));
        session.setStatus(MentoringSession.Status.CONFIRMED);
        assertThat(code(() -> service.submit(mentor, session.getId(), INPUT))).isEqualTo("SESSION_NOT_ENDED");
        assertThat(items).isEmpty();
    }

    @Test
    void menteeSeesTheScorecardButCannotScore() {
        service.submit(mentor, session.getId(), INPUT);
        MockInterviewView v = service.get(mentee, session.getId());
        assertThat(v.viewerRole()).isEqualTo("MENTEE");
        assertThat(v.canScore()).isFalse();
        assertThat(v.scorecard().privateNote()).isEqualTo("Cố lên, nền tảng tốt.");
        assertThat(v.intake().targetRole()).isEqualTo("Backend Java Fresher");
        assertThat(service.get(mentor, session.getId()).canScore()).isTrue();
        assertThatThrownBy(() -> service.get(new AuthUser(UUID.randomUUID(), "x@test", "MENTEE"), session.getId()))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void nonMockSessionIsNotFound() {
        session.setSessionType(SessionType.CODE_REVIEW);
        assertThat(code(() -> service.get(mentor, session.getId()))).isEqualTo("NOT_MOCK_INTERVIEW");
    }

    @Test
    void jobRemindsThenMarksMissingOnce() {
        OffsetDateTime now = OffsetDateTime.now();
        when(cardRepo.findAwaitingScorecard(any())).thenReturn(List.<Object[]>of(
                new Object[] {session.getId().toString(), now.minusHours(13), false, false}));
        when(cardRepo.claimReminder12h(session.getId(), now)).thenReturn(1);
        assertThat(service.runScorecardJob(now)).isEqualTo(1);
        verify(notifications).notifyUser(eq(mentorId), eq("MOCK_SCORECARD_REMINDER"), any(), any(), any());

        when(cardRepo.findAwaitingScorecard(any())).thenReturn(List.<Object[]>of(
                new Object[] {session.getId().toString(), now.minusHours(49), true, true}));
        when(cardRepo.markMissing(session.getId(), now)).thenReturn(1, 0);
        assertThat(service.runScorecardJob(now)).isEqualTo(1);
        assertThat(service.runScorecardJob(now)).isZero(); // đã đánh dấu → không báo lại
        verify(notifications, times(1)).notifyUser(eq(mentorId), eq("MOCK_SCORECARD_MISSING"), any(), any(), any());
    }

    private static String code(Runnable r) {
        try {
            r.run();
        } catch (ApiException e) {
            return e.getCode();
        }
        return "OK";
    }
}
