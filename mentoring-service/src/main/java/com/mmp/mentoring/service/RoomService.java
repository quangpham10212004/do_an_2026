package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.MentoringDtos.RoomView;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.SessionRepository;
import com.mmp.mentoring.security.AuthUser;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Date;
import java.util.Map;
import java.util.UUID;

/**
 * Bản chốt v2.0 §6 — phòng học video + chat ngay trong hệ thống (Jitsi Meet tự host). mentoring-service cấp JWT cho đúng hai người
 * tham gia của buổi CONFIRMED trong khung giờ phòng mở; lần đầu mỗi bên lấy token trong khung giờ đó được ghi vào nhật ký vào phòng
 * ({@code mentor_joined_at} / {@code mentee_joined_at}) — căn cứ duy nhất xác định vắng mặt (xem {@link RoomRules}).
 */
@Service
public class RoomService {

    private final SessionRepository sessionRepo;
    private final ProfileClient profileClient;
    private final TransactionTemplate tx;
    private final AttendanceService attendance;
    private final NotificationService notifications;
    private final String domain;
    private final String xmppDomain;
    private final String appId;
    private final String secret;
    private final Duration opensBefore;
    private final Duration closesAfter;
    private final Duration grace;
    private final Duration trialGrace;

    public RoomService(SessionRepository sessionRepo, ProfileClient profileClient, TransactionTemplate tx,
                       AttendanceService attendance, NotificationService notifications,
                       @Value("${app.room.domain:localhost:8443}") String domain,
                       @Value("${app.room.xmpp-domain:meet.jitsi}") String xmppDomain,
                       @Value("${app.room.app-id:mentorhub}") String appId,
                       @Value("${app.room.jwt-secret:dev-only-jitsi-secret-change-me-0123456789abcdef}") String secret,
                       @Value("${app.room.opens-before:PT10M}") Duration opensBefore,
                       @Value("${app.room.closes-after:PT30M}") Duration closesAfter,
                       @Value("${app.room.grace:PT10M}") Duration grace,
                       @Value("${app.room.trial-grace:PT5M}") Duration trialGrace) {
        this.sessionRepo = sessionRepo;
        this.profileClient = profileClient;
        this.tx = tx;
        this.attendance = attendance;
        this.notifications = notifications;
        this.domain = domain;
        this.xmppDomain = xmppDomain;
        this.appId = appId;
        this.secret = secret;
        this.opensBefore = opensBefore;
        this.closesAfter = closesAfter;
        this.grace = grace;
        this.trialGrace = trialGrace;
    }

    public Duration graceOf(MentoringSession s) {
        return RoomRules.grace(s.isTrial(), grace, trialGrace);
    }

    /** Tên phòng khó đoán: gắn với id phiên (UUID ngẫu nhiên) — token JWT mới là thứ cho phép vào. */
    public static String roomName(UUID sessionId) {
        return "mentorhub-" + sessionId.toString().replace("-", "");
    }

    public RoomView join(AuthUser user, UUID sessionId) {
        OffsetDateTime now = OffsetDateTime.now();
        MentoringSession session = tx.execute(s -> {
            MentoringSession ss = sessionRepo.findForUpdate(sessionId)
                    .orElseThrow(() -> ApiException.notFound("SESSION_NOT_FOUND", "Không tìm thấy phiên mentoring"));
            boolean mentor = user.userId() != null && user.userId().equals(ss.getMentorId());
            boolean mentee = user.userId() != null && user.userId().equals(ss.getMenteeId());
            if (!mentor && !mentee) {
                throw ApiException.forbidden("Chỉ mentor và mentee của buổi mới vào được phòng học");
            }
            if (ss.getStatus() != MentoringSession.Status.CONFIRMED && ss.getStatus() != MentoringSession.Status.AWAITING_ATTENDANCE) {
                throw ApiException.conflict("ROOM_NOT_AVAILABLE", "Phòng học chỉ mở cho buổi đã được mentor xác nhận");
            }
            if (!RoomRules.open(ss.getScheduledAt(), ss.endsAt(), now, opensBefore, closesAfter)) {
                throw ApiException.conflict("ROOM_CLOSED", "Phòng học mở từ " + opensBefore.toMinutes() + " phút trước giờ bắt đầu đến "
                        + closesAfter.toMinutes() + " phút sau giờ kết thúc");
            }
            if (mentor && ss.getMentorJoinedAt() == null) ss.setMentorJoinedAt(now);
            if (mentee && ss.getMenteeJoinedAt() == null) ss.setMenteeJoinedAt(now);
            return ss;
        });
        boolean isMentor = user.userId().equals(session.getMentorId());
        String name = profileClient.displayNames(java.util.List.of(user.userId())).getOrDefault(user.userId(), isMentor ? "Mentor" : "Mentee");
        OffsetDateTime opensAt = session.getScheduledAt().minus(opensBefore);
        OffsetDateTime closesAt = session.endsAt().plus(closesAfter);
        String room = roomName(session.getId());
        String jwt = issueToken(room, user.userId(), name, isMentor, opensAt.minusMinutes(1), closesAt);
        return new RoomView("jitsi", domain, room, jwt, opensAt, closesAt, (int) graceOf(session).toMinutes(), isMentor);
    }

    /**
     * Ký JWT vào phòng Jitsi. Dùng chung cho phiên học ({@link #join}) và phỏng vấn xác thực mentor
     * (POST /internal/rooms/token do ai-service gọi) để {@code JITSI_JWT_SECRET} chỉ nằm ở một nơi.
     * Token chỉ có hiệu lực cho đúng một phòng ({@code room}) và trong [notBefore, expiresAt].
     */
    public String issueToken(String room, UUID userId, String name, boolean moderator, OffsetDateTime notBefore, OffsetDateTime expiresAt) {
        return Jwts.builder()
                .header().type("JWT").and()   // prosody (token auth) từ chối token thiếu typ: "JWT error: Invalid typ"
                .issuer(appId)
                .subject(xmppDomain)
                .claim("aud", "jitsi")
                .claim("room", room)
                .claim("context", Map.of("user", Map.of("id", userId.toString(), "name", name, "moderator", moderator ? "true" : "false")))
                .notBefore(Date.from(notBefore.toInstant()))
                .expiration(Date.from(expiresAt.toInstant()))
                .signWith(Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8)), Jwts.SIG.HS256)
                .compact();
    }

    public String domain() {
        return domain;
    }

    /**
     * Một bên báo bên kia vắng mặt (sau thời gian chờ): hợp lệ khi mình đã vào phòng và bên kia chưa. Ghi câu trả lời tham dự để bên
     * kia được nhắc; kết luận cuối cùng do nhật ký vào phòng quyết định khi buổi kết thúc (AttendanceService.resolveByJoinLog).
     */
    public MentoringSession reportAbsent(AuthUser user, UUID sessionId) {
        OffsetDateTime now = OffsetDateTime.now();
        MentoringSession reported = tx.execute(s -> {
            MentoringSession ss = sessionRepo.findForUpdate(sessionId)
                    .orElseThrow(() -> ApiException.notFound("SESSION_NOT_FOUND", "Không tìm thấy phiên mentoring"));
            boolean mentor = user.userId() != null && user.userId().equals(ss.getMentorId());
            boolean mentee = user.userId() != null && user.userId().equals(ss.getMenteeId());
            if (!mentor && !mentee) throw ApiException.forbidden("Chỉ mentor và mentee của buổi mới báo vắng mặt được");
            if (ss.getStatus() != MentoringSession.Status.CONFIRMED && ss.getStatus() != MentoringSession.Status.AWAITING_ATTENDANCE) {
                throw ApiException.conflict("SESSION_NOT_ACTIVE", "Chỉ báo vắng mặt được cho buổi đã xác nhận");
            }
            RoomRules.absenceReportError(mentor ? ss.getMentorJoinedAt() != null : ss.getMenteeJoinedAt() != null,
                    mentor ? ss.getMenteeJoinedAt() != null : ss.getMentorJoinedAt() != null,
                    RoomRules.graceElapsed(ss.getScheduledAt(), now, graceOf(ss))).ifPresent(code -> {
                throw ApiException.conflict(code, switch (code) {
                    case "GRACE_NOT_ELAPSED" -> "Chưa hết thời gian chờ " + graceOf(ss).toMinutes() + " phút kể từ giờ bắt đầu";
                    case "YOU_NOT_JOINED" -> "Bạn chưa vào phòng học nên không thể báo bên kia vắng mặt";
                    default -> "Bên kia đã vào phòng học";
                });
            });
            attendance.recordAbsenceClaim(ss, mentor);
            return ss;
        });
        boolean byMentor = user.userId().equals(reported.getMentorId());
        notifications.notifyUser(byMentor ? reported.getMenteeId() : reported.getMentorId(), "ABSENCE_REPORTED", "Bạn được báo vắng mặt",
                (byMentor ? "Mentor" : "Mentee") + " báo bạn chưa vào phòng học. Hãy vào phòng ngay; kết luận cuối cùng dựa trên nhật ký vào phòng.",
                "/mentoring/sessions/" + reported.getId() + "/room");
        return reported;
    }
}
