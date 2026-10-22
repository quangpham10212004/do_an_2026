package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.MentoringDtos.RoomView;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.SessionRepository;
import com.mmp.mentoring.security.AuthUser;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** Bản chốt v2.0 §6 — JWT phòng học Jitsi chỉ cấp cho đúng hai người tham gia, đúng khung giờ; ghi nhật ký vào phòng. */
class RoomServiceTest {

    static final String SECRET = "unit-test-jitsi-secret-0123456789abcdef-0123456789";

    final UUID id = UUID.randomUUID();
    final UUID menteeId = UUID.randomUUID();
    final UUID mentorId = UUID.randomUUID();
    final AuthUser mentee = new AuthUser(menteeId, "e@test", "MENTEE");
    final AuthUser mentor = new AuthUser(mentorId, "m@test", "MENTOR");
    SessionRepository repo;
    AttendanceService attendance;
    NotificationService notifications;
    RoomService service;
    MentoringSession session;

    @SuppressWarnings("unchecked")
    @BeforeEach
    void setUp() {
        repo = mock(SessionRepository.class);
        attendance = mock(AttendanceService.class);
        notifications = mock(NotificationService.class);
        ProfileClient profileClient = mock(ProfileClient.class);
        when(profileClient.displayNames(any())).thenReturn(Map.of(menteeId, "Mentee A", mentorId, "Mentor B"));
        TransactionTemplate tx = mock(TransactionTemplate.class);
        when(tx.execute(any())).thenAnswer(inv -> ((TransactionCallback<Object>) inv.getArgument(0)).doInTransaction(null));
        service = new RoomService(repo, profileClient, tx, attendance, notifications, "meet.example.com", "meet.jitsi", "mentorhub", SECRET,
                Duration.ofMinutes(10), Duration.ofMinutes(30), Duration.ofMinutes(10), Duration.ofMinutes(5));
        session = new MentoringSession();
        ReflectionTestUtils.setField(session, "id", id);
        session.setMenteeId(menteeId);
        session.setMentorId(mentorId);
        session.setDurationMinutes(60);
        session.setPrice(new BigDecimal("200000"));
        session.setStatus(MentoringSession.Status.CONFIRMED);
        session.setScheduledAt(OffsetDateTime.now().plusMinutes(5));   // trong 10 phút trước giờ → phòng đã mở
        when(repo.findForUpdate(id)).thenReturn(Optional.of(session));
    }

    private Claims parse(String jwt) {
        return Jwts.parser().verifyWith(Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8))).build().parseSignedClaims(jwt).getPayload();
    }

    @SuppressWarnings("unchecked")
    @Test
    void participantsGetATokenForTheirRoomAndAreLogged() {
        RoomView mentorView = service.join(mentor, id);
        RoomView menteeView = service.join(mentee, id);

        Claims claims = parse(mentorView.jwt());
        // Jitsi prosody chỉ nhận token có header typ = JWT
        assertThat(Jwts.parser().verifyWith(Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8))).build()
                .parseSignedClaims(mentorView.jwt()).getHeader().getType()).isEqualTo("JWT");
        assertThat(claims.getIssuer()).isEqualTo("mentorhub");
        assertThat(claims.getSubject()).isEqualTo("meet.jitsi");
        assertThat(claims.get("room", String.class)).isEqualTo(RoomService.roomName(id)).isEqualTo(mentorView.roomName());
        assertThat(((Map<String, Object>) ((Map<String, Object>) claims.get("context")).get("user")).get("moderator")).isEqualTo("true");
        Claims menteeClaims = parse(menteeView.jwt());
        assertThat(((Map<String, Object>) ((Map<String, Object>) menteeClaims.get("context")).get("user")).get("moderator")).isEqualTo("false");
        assertThat(mentorView.domain()).isEqualTo("meet.example.com");
        assertThat(mentorView.moderator()).isTrue();
        assertThat(menteeView.moderator()).isFalse();
        assertThat(session.getMentorJoinedAt()).isNotNull();
        assertThat(session.getMenteeJoinedAt()).isNotNull();
    }

    @Test
    void theFirstJoinTimeIsKept() {
        service.join(mentor, id);
        OffsetDateTime first = session.getMentorJoinedAt();
        service.join(mentor, id);
        assertThat(session.getMentorJoinedAt()).isEqualTo(first);
    }

    @Test
    void outsiderCannotEnter() {
        assertThatThrownBy(() -> service.join(new AuthUser(UUID.randomUUID(), "x@test", "MENTEE"), id)).isInstanceOf(ApiException.class);
        assertThat(session.getMentorJoinedAt()).isNull();
    }

    @Test
    void roomIsClosedOutsideTheWindow() {
        session.setScheduledAt(OffsetDateTime.now().plusHours(2));
        assertThatThrownBy(() -> service.join(mentee, id)).isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).getCode()).isEqualTo("ROOM_CLOSED"));
        assertThat(session.getMenteeJoinedAt()).isNull();
        session.setScheduledAt(OffsetDateTime.now().minusHours(3));
        assertThatThrownBy(() -> service.join(mentee, id)).isInstanceOf(ApiException.class);
    }

    @Test
    void onlyConfirmedSessionsHaveARoom() {
        session.setStatus(MentoringSession.Status.AWAITING_MENTOR);
        assertThatThrownBy(() -> service.join(mentee, id)).isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).getCode()).isEqualTo("ROOM_NOT_AVAILABLE"));
    }

    @Test
    void absenceReportRequiresGraceAndPresence() {
        session.setScheduledAt(OffsetDateTime.now().minusMinutes(3));
        session.setMentorJoinedAt(OffsetDateTime.now().minusMinutes(2));
        assertThatThrownBy(() -> service.reportAbsent(mentor, id)).isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).getCode()).isEqualTo("GRACE_NOT_ELAPSED"));

        session.setScheduledAt(OffsetDateTime.now().minusMinutes(12));
        service.reportAbsent(mentor, id);
        verify(attendance).recordAbsenceClaim(session, true);
        verify(notifications).notifyUser(any(), any(), any(), any(), any());

        // bên kia đã vào phòng → không báo vắng được
        session.setMenteeJoinedAt(OffsetDateTime.now().minusMinutes(1));
        assertThatThrownBy(() -> service.reportAbsent(mentor, id)).isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).getCode()).isEqualTo("OTHER_SIDE_JOINED"));
    }

    @Test
    void trialSessionsUseTheShortGrace() {
        session.setKind(MentoringSession.Kind.TRIAL);
        session.setDurationMinutes(15);
        session.setScheduledAt(OffsetDateTime.now().minusMinutes(6));
        session.setMentorJoinedAt(OffsetDateTime.now().minusMinutes(5));
        service.reportAbsent(mentor, id);   // 5 phút đã đủ cho buổi trải nghiệm
        verify(attendance).recordAbsenceClaim(session, true);
    }
}
