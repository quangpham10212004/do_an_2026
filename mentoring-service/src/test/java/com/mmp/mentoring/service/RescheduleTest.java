package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.MentoringDtos.RescheduleInput;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.entity.RescheduleProposal;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.security.AuthUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.*;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** US-06 — dời lịch phiên. */
class RescheduleTest {

    static final ZoneId VN = ZoneId.of("Asia/Ho_Chi_Minh");
    final RescheduleRules rules = RescheduleRules.defaults();
    final OffsetDateTime now = OffsetDateTime.parse("2026-10-07T10:00:00+07:00");

    // ---------- quy tắc thuần ----------

    @Test
    void proposeRules() {
        OffsetDateTime start = now.plusDays(2);
        assertThat(rules.proposeBlock(MentoringSession.Status.CONFIRMED, start, 0, false, now)).isEmpty();
        assertThat(rules.proposeBlock(MentoringSession.Status.PENDING, start, 0, false, now)).contains("SESSION_NOT_CONFIRMED");
        assertThat(rules.proposeBlock(MentoringSession.Status.CONFIRMED, now.plusMinutes(119), 0, false, now)).contains("RESCHEDULE_TOO_LATE");
        assertThat(rules.proposeBlock(MentoringSession.Status.CONFIRMED, now.plusHours(2), 0, false, now)).isEmpty();
        assertThat(rules.proposeBlock(MentoringSession.Status.CONFIRMED, start, 2, false, now)).contains("RESCHEDULE_LIMIT");
        assertThat(rules.proposeBlock(MentoringSession.Status.CONFIRMED, start, 1, true, now)).contains("RESCHEDULE_PENDING");
    }

    @Test
    void expiryIsEarlierOf24hOrOneHourBeforeOriginalStart() {
        assertThat(rules.expiresAt(now, now.plusDays(3))).isEqualTo(now.plusHours(24));
        assertThat(rules.expiresAt(now, now.plusHours(5))).isEqualTo(now.plusHours(4));
    }

    @Test
    void pendingProposalSlotCountsAsBusy() {
        // Đề xuất dời phiên S sang 15:00 (60') đang PENDING → mentor bận 15:00–16:00 (+buffer) với phiên khác
        UUID owner = UUID.randomUUID();
        List<BookingRules.Block> busy = List.of(new BookingRules.Block(owner, now.plusDays(1).withHour(15), 60));
        assertThat(BookingRules.findConflict(now.plusDays(1).withHour(15).plusMinutes(30), 60, busy, null, 15)).isPresent();
        // nhưng không chặn chính phiên S khi nó được dời
        assertThat(BookingRules.findConflict(now.plusDays(1).withHour(15), 60, busy, owner, 15)).isEmpty();
    }

    // ---------- tầng service ----------

    TestFixtures f;
    RescheduleService service;
    final UUID sessionId = UUID.randomUUID();
    final UUID mentorId = UUID.randomUUID();
    final UUID menteeId = UUID.randomUUID();
    final AuthUser mentee = new AuthUser(menteeId, "e@test", "MENTEE");
    final AuthUser mentor = new AuthUser(mentorId, "m@test", "MENTOR");
    MentoringSession session;

    @BeforeEach
    void setUp() {
        f = new TestFixtures();
        service = new RescheduleService(f.proposalRepo, f.service(), f.profileClient, f.notifications, rules, f.tx, "Asia/Ho_Chi_Minh");
        session = new MentoringSession();
        ReflectionTestUtils.setField(session, "id", sessionId);
        session.setMentorId(mentorId);
        session.setMenteeId(menteeId);
        session.setDurationMinutes(60);
        session.setPrice(new BigDecimal("200000"));
        session.setStatus(MentoringSession.Status.CONFIRMED);
        session.setScheduledAt(at(3, 10));
        when(f.sessionRepo.findById(sessionId)).thenReturn(Optional.of(session));
        when(f.sessionRepo.findActiveAround(any(), any(), any())).thenReturn(List.of());
        when(f.proposalRepo.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        var allWeek = java.util.stream.IntStream.rangeClosed(1, 7)
                .mapToObj(d -> new ProfileClient.AvailabilitySlot(UUID.randomUUID(), d, LocalTime.of(6, 0), LocalTime.of(23, 0))).toList();
        when(f.profileClient.findMentor(mentorId)).thenReturn(Optional.of(new ProfileClient.MentorInfo(mentorId, "M", List.of(), "backend",
                "", 5, new BigDecimal("200000"), 3, 0, true, 0, 0, "APPROVED", allWeek, null, null, null, null, null, null, null)));
    }

    static OffsetDateTime at(int daysAhead, int hour) {
        return LocalDate.now(VN).plusDays(daysAhead).atTime(hour, 0).atZone(VN).toOffsetDateTime();
    }

    private static String code(Runnable r) {
        try {
            r.run();
        } catch (ApiException e) {
            return e.getCode();
        }
        return "OK";
    }

    @Test
    void proposeCreatesPendingProposalWithExpiry() {
        var view = service.propose(mentee, sessionId, new RescheduleInput(at(4, 14)));
        assertThat(view.status()).isEqualTo("PENDING");
        assertThat(view.newStart()).isEqualTo(at(4, 14));
        assertThat(view.proposedBy()).isEqualTo(menteeId);
        verify(f.notifications).notifyUser(eq(mentorId), eq("RESCHEDULE_PROPOSED"), any(), any(), any());
    }

    @Test
    void limitAndOpenProposalAreEnforced() {
        session.setRescheduleCount(2);
        assertThat(code(() -> service.propose(mentee, sessionId, new RescheduleInput(at(4, 14))))).isEqualTo("RESCHEDULE_LIMIT");
        session.setRescheduleCount(0);
        when(f.proposalRepo.findFirstBySessionIdAndStatus(sessionId, RescheduleProposal.Status.PENDING))
                .thenReturn(Optional.of(new RescheduleProposal(sessionId, mentorId, at(4, 9), OffsetDateTime.now(), OffsetDateTime.now().plusHours(1))));
        assertThat(code(() -> service.propose(mentee, sessionId, new RescheduleInput(at(4, 14))))).isEqualTo("RESCHEDULE_PENDING");
    }

    @Test
    void newSlotMustRespectMentorScheduleAndConflicts() {
        assertThat(code(() -> service.propose(mentee, sessionId, new RescheduleInput(at(4, 23))))).isEqualTo("MENTOR_NOT_AVAILABLE");
        MentoringSession other = new MentoringSession();
        other.setMentorId(mentorId);
        other.setMenteeId(UUID.randomUUID());
        other.setScheduledAt(at(4, 14));
        other.setDurationMinutes(60);
        other.setStatus(MentoringSession.Status.CONFIRMED);
        when(f.sessionRepo.findActiveAround(eq(mentorId), any(), any())).thenReturn(List.of(session, other));
        assertThat(code(() -> service.propose(mentee, sessionId, new RescheduleInput(at(4, 15))))).isEqualTo("MENTOR_NOT_AVAILABLE"); // buffer
        // chồng lên giờ cũ của chính phiên thì được
        assertThat(code(() -> service.propose(mentee, sessionId, new RescheduleInput(session.getScheduledAt().plusMinutes(30))))).isEqualTo("OK");
    }

    @Test
    void otherPartyAcceptsAndSessionMovesKeepingDurationAndPrice() {
        RescheduleProposal p = new RescheduleProposal(sessionId, menteeId, at(4, 14), OffsetDateTime.now(), OffsetDateTime.now().plusHours(20));
        UUID pid = UUID.randomUUID();
        when(f.proposalRepo.findById(pid)).thenReturn(Optional.of(p));
        assertThat(code(() -> service.accept(mentee, pid))).isEqualTo("FORBIDDEN"); // người đề xuất không tự chấp nhận
        session.setReminderSent(true);
        var view = service.accept(mentor, pid);
        assertThat(view.scheduledAt()).isEqualTo(at(4, 14));
        assertThat(view.durationMinutes()).isEqualTo(60);
        assertThat(view.price()).isEqualByComparingTo("200000");
        assertThat(view.rescheduleCount()).isEqualTo(1);
        assertThat(session.isReminderSent()).isFalse();
        assertThat(p.getStatus()).isEqualTo(RescheduleProposal.Status.ACCEPTED);
    }

    @Test
    void expiredProposalCannotBeAccepted() {
        RescheduleProposal p = new RescheduleProposal(sessionId, menteeId, at(4, 14), OffsetDateTime.now().minusHours(25), OffsetDateTime.now().minusMinutes(1));
        UUID pid = UUID.randomUUID();
        when(f.proposalRepo.findById(pid)).thenReturn(Optional.of(p));
        assertThat(code(() -> service.accept(mentor, pid))).isEqualTo("RESCHEDULE_EXPIRED");
        assertThat(session.getScheduledAt()).isEqualTo(at(3, 10));
    }

    @Test
    void expiryJobClosesOverdueProposals() {
        RescheduleProposal p = new RescheduleProposal(sessionId, menteeId, at(4, 14), OffsetDateTime.now().minusHours(25), OffsetDateTime.now().minusMinutes(1));
        UUID pid = UUID.randomUUID();
        ReflectionTestUtils.setField(p, "id", pid);
        when(f.proposalRepo.findByStatusAndExpiresAtBefore(eq(RescheduleProposal.Status.PENDING), any())).thenReturn(List.of(p));
        when(f.proposalRepo.findById(pid)).thenReturn(Optional.of(p));
        service.expireProposals();
        assertThat(p.getStatus()).isEqualTo(RescheduleProposal.Status.EXPIRED);
        verify(f.notifications).notifyUser(eq(menteeId), eq("RESCHEDULE_EXPIRED"), any(), any(), any());
    }
}
