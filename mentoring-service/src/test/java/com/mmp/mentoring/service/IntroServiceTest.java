package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.MentoringDtos.BookIntroInput;
import com.mmp.mentoring.dto.MentoringDtos.IntroDecisionInput;
import com.mmp.mentoring.dto.MentoringDtos.ReviewInput;
import com.mmp.mentoring.entity.MentoringRequest;
import com.mmp.mentoring.entity.MentoringRequest.Decision;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.entity.SessionType;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.security.AuthUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/** Buổi làm quen: đặt buổi, quyết định sau buổi, và các ràng buộc quanh trạng thái INTRO. */
class IntroServiceTest {

    static final ZoneId VN = ZoneId.of("Asia/Ho_Chi_Minh");

    final UUID requestId = UUID.randomUUID();
    final UUID mentorId = UUID.randomUUID();
    final UUID menteeId = UUID.randomUUID();
    final AuthUser mentee = new AuthUser(menteeId, "e@test", "MENTEE");
    final AuthUser mentor = new AuthUser(mentorId, "m@test", "MENTOR");
    final AuthUser stranger = new AuthUser(UUID.randomUUID(), "x@test", "MENTEE");

    TestFixtures f;
    IntroService service;
    MentoringRequest request;
    int capacity = 3;

    static OffsetDateTime at(int daysAhead, int hour) {
        return LocalDate.now(VN).plusDays(daysAhead).atTime(hour, 0).atZone(VN).toOffsetDateTime();
    }

    @BeforeEach
    void setUp() {
        f = new TestFixtures();
        service = new IntroService(f.requestRepo, f.sessionRepo, f.service(), f.profileClient, f.notifications, f.tx,
                "Asia/Ho_Chi_Minh", 15);
        request = new MentoringRequest(menteeId, mentorId, "Muốn học Spring Boot và thiết kế REST API để đi làm backend.",
                SessionType.CAREER_ADVICE, MentoringRequest.Frequency.WEEKLY, 3, null);
        ReflectionTestUtils.setField(request, "id", requestId);
        request.setStatus(MentoringRequest.Status.INTRO);
        when(f.requestRepo.findById(requestId)).thenAnswer(inv -> Optional.of(request));
        when(f.requestRepo.findForUpdate(requestId)).thenAnswer(inv -> Optional.of(request));
        when(f.requestRepo.countActiveMentees(mentorId)).thenReturn(0L);
        when(f.sessionRepo.findActiveAround(any(), any(), any())).thenReturn(List.of());
        var allWeek = java.util.stream.IntStream.rangeClosed(1, 7)
                .mapToObj(d -> new ProfileClient.AvailabilitySlot(UUID.randomUUID(), d, LocalTime.of(6, 0), LocalTime.of(23, 0))).toList();
        when(f.profileClient.findMentor(mentorId)).thenAnswer(inv -> Optional.of(new ProfileClient.MentorInfo(mentorId, "M", List.of(),
                "backend", "", 5, new BigDecimal("200000"), capacity, 0, true, 0, 0, "APPROVED", allWeek,
                "ACCEPTING", null, null, null, null, null, List.of())));
    }

    private static String code(Runnable r) {
        try {
            r.run();
        } catch (ApiException e) {
            return e.getCode();
        }
        return "OK";
    }

    private MentoringSession introSession(MentoringSession.Status status) {
        MentoringSession s = new MentoringSession();
        s.setKind(MentoringSession.Kind.INTRO);
        s.setRequestId(requestId);
        s.setMenteeId(menteeId);
        s.setMentorId(mentorId);
        s.setScheduledAt(at(-1, 10));
        s.setDurationMinutes(15);
        s.setStatus(status);
        return s;
    }

    private void givenIntroHeld() {
        when(f.sessionRepo.findByRequestIdAndKindAndStatusIn(eq(requestId), eq(MentoringSession.Kind.INTRO), any()))
                .thenAnswer(inv -> {
                    var statuses = inv.<java.util.Collection<MentoringSession.Status>>getArgument(2);
                    return statuses.contains(MentoringSession.Status.COMPLETED)
                            ? List.of(introSession(MentoringSession.Status.COMPLETED)) : List.of();
                });
    }

    // ---------- đặt buổi làm quen ----------

    @Test
    void bookingCreatesFreeConfirmedFifteenMinuteIntro() {
        var view = service.bookIntro(mentee, requestId, new BookIntroInput(at(3, 10), null));

        assertThat(view.kind()).isEqualTo("INTRO");
        assertThat(view.status()).isEqualTo("CONFIRMED");
        assertThat(view.durationMinutes()).isEqualTo(15);
        assertThat(view.price()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(view.agenda()).startsWith("Buổi làm quen:");
        verify(f.notifications).notifyUser(eq(mentorId), eq("INTRO_BOOKED"), any(), any(), any());
    }

    @Test
    void onlyTheMenteeOfAnIntroRequestCanBook() {
        assertThat(code(() -> service.bookIntro(stranger, requestId, new BookIntroInput(at(3, 10), null)))).isEqualTo("FORBIDDEN");
        request.setStatus(MentoringRequest.Status.PENDING);
        assertThat(code(() -> service.bookIntro(mentee, requestId, new BookIntroInput(at(3, 10), null)))).isEqualTo("REQUEST_NOT_INTRO");
    }

    @Test
    void secondActiveIntroIsRejectedButCancelledOnesAllowRebooking() {
        when(f.sessionRepo.findByRequestIdAndKindAndStatusIn(eq(requestId), eq(MentoringSession.Kind.INTRO), any()))
                .thenReturn(List.of(introSession(MentoringSession.Status.CONFIRMED)));
        assertThat(code(() -> service.bookIntro(mentee, requestId, new BookIntroInput(at(3, 10), null)))).isEqualTo("INTRO_ALREADY_BOOKED");

        // ACTIVE_INTRO không chứa CANCELLED / EXPIRED / NO_SHOW → truy vấn trả rỗng, đặt lại được
        assertThat(IntroService.ACTIVE_INTRO).doesNotContain(MentoringSession.Status.CANCELLED, MentoringSession.Status.EXPIRED,
                MentoringSession.Status.NO_SHOW_MENTEE, MentoringSession.Status.NO_SHOW_MENTOR);
        when(f.sessionRepo.findByRequestIdAndKindAndStatusIn(eq(requestId), eq(MentoringSession.Kind.INTRO), any())).thenReturn(List.of());
        assertThat(code(() -> service.bookIntro(mentee, requestId, new BookIntroInput(at(3, 10), null)))).isEqualTo("OK");
    }

    @Test
    void introFollowsTheSameScheduleRulesAsRegularSessions() {
        assertThat(code(() -> service.bookIntro(mentee, requestId, new BookIntroInput(at(3, 23), null)))).isEqualTo("MENTOR_NOT_AVAILABLE");
        assertThat(code(() -> service.bookIntro(mentee, requestId, new BookIntroInput(OffsetDateTime.now().plusMinutes(5), null)))).isEqualTo("TOO_SOON");
    }

    @Test
    void introIsNotChargedAndCannotBeReviewed() {
        MentoringSession done = introSession(MentoringSession.Status.COMPLETED);
        ReflectionTestUtils.setField(done, "id", UUID.randomUUID());
        when(f.sessionRepo.findById(done.getId())).thenReturn(Optional.of(done));
        var sessions = f.service();
        assertThat(code(() -> sessions.review(mentee, done.getId(), new ReviewInput(5, "tốt")))).isEqualTo("INTRO_NOT_REVIEWABLE");
    }

    // ---------- quyết định sau buổi làm quen ----------

    @Test
    void decisionRequiresAHeldIntro() {
        when(f.sessionRepo.findByRequestIdAndKindAndStatusIn(eq(requestId), eq(MentoringSession.Kind.INTRO), any())).thenReturn(List.of());
        assertThat(code(() -> service.decide(mentee, requestId, new IntroDecisionInput(Decision.CONTINUE, null)))).isEqualTo("INTRO_NOT_HELD");
    }

    @Test
    void bothContinueAcceptsAndSyncsMentorLoad() {
        givenIntroHeld();

        var afterMentee = service.decide(mentee, requestId, new IntroDecisionInput(Decision.CONTINUE, null));
        assertThat(afterMentee.getStatus()).isEqualTo(MentoringRequest.Status.INTRO);
        verify(f.profileClient, never()).updateActiveMentees(any(), anyLong());

        var afterMentor = service.decide(mentor, requestId, new IntroDecisionInput(Decision.CONTINUE, null));
        assertThat(afterMentor.getStatus()).isEqualTo(MentoringRequest.Status.ACCEPTED);
        assertThat(afterMentor.getRespondedAt()).isNotNull();
        verify(f.profileClient).updateActiveMentees(eq(mentorId), anyLong());
    }

    @Test
    void anyDeclineRejectsTheRequest() {
        givenIntroHeld();
        var rejected = service.decide(mentee, requestId, new IntroDecisionInput(Decision.DECLINE, "Chưa hợp phong cách"));

        assertThat(rejected.getStatus()).isEqualTo(MentoringRequest.Status.REJECTED);
        assertThat(rejected.getRejectReason()).isEqualTo(MentoringRequest.RejectReason.OTHER);
        assertThat(rejected.getResponseNote()).isEqualTo("Chưa hợp phong cách");
        verify(f.notifications).notifyUser(eq(mentorId), eq("REQUEST_REJECTED"), any(), any(), any());
    }

    @Test
    void mentorCannotContinueWhenCapacityIsFull() {
        givenIntroHeld();
        capacity = 1;
        when(f.requestRepo.countActiveMentees(mentorId)).thenReturn(1L);

        assertThat(code(() -> service.decide(mentor, requestId, new IntroDecisionInput(Decision.CONTINUE, null)))).isEqualTo("CAPACITY_FULL");
        assertThat(request.getMentorDecision()).isNull();
        // mentee vẫn quyết định được; chỉ mentor bị chặn khi hết chỗ
        assertThat(code(() -> service.decide(mentee, requestId, new IntroDecisionInput(Decision.CONTINUE, null)))).isEqualTo("OK");
    }

    @Test
    void eachSideDecidesOnceAndStrangersCannotDecide() {
        givenIntroHeld();
        service.decide(mentee, requestId, new IntroDecisionInput(Decision.CONTINUE, null));
        assertThat(code(() -> service.decide(mentee, requestId, new IntroDecisionInput(Decision.DECLINE, null)))).isEqualTo("DECISION_ALREADY_MADE");
        assertThat(code(() -> service.decide(stranger, requestId, new IntroDecisionInput(Decision.CONTINUE, null)))).isEqualTo("FORBIDDEN");
        request.setStatus(MentoringRequest.Status.ACCEPTED);
        assertThat(code(() -> service.decide(mentor, requestId, new IntroDecisionInput(Decision.CONTINUE, null)))).isEqualTo("REQUEST_NOT_INTRO");
    }
}
