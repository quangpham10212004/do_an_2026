package com.mmp.auth.service;

import com.mmp.auth.client.ProfileClient;
import com.mmp.auth.dto.NotificationDtos.*;
import com.mmp.auth.entity.EmailOutbox;
import com.mmp.auth.entity.NotificationPreferences;
import com.mmp.auth.entity.User;
import com.mmp.auth.exception.ApiException;
import com.mmp.auth.repository.EmailOutboxRepository;
import com.mmp.auth.repository.NotificationPreferencesRepository;
import com.mmp.auth.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** US-38 (PRD-AUTH-2, NOTI-1..4) + US-39 (PRD-AUTH-3) — giờ yên tĩnh, tuỳ chọn theo nhóm, hàng đợi email, gửi lại xác thực. */
class NotificationEmailTest {

    private static final ZoneId VN = ZoneId.of("Asia/Ho_Chi_Minh");

    private static OffsetDateTime vn(String local) {
        return java.time.LocalDateTime.parse(local).atZone(VN).toOffsetDateTime();
    }

    // ---------------------------------------------------------------- giờ yên tĩnh (hàm thuần)

    @Test
    void outsideQuietHoursSendsNow() {
        OffsetDateTime now = vn("2026-11-02T15:00");
        assertThat(EmailRules.sendAt(now, VN, true, EmailRules.Category.REQUESTS, "REQUEST_RECEIVED", null)).isEqualTo(now);
    }

    @Test
    void quietHoursDeferTo7amLocal() {
        assertThat(EmailRules.sendAt(vn("2026-11-02T23:10"), VN, true, EmailRules.Category.REQUESTS, "REQUEST_RECEIVED", null))
                .isEqualTo(vn("2026-11-03T07:00"));
        assertThat(EmailRules.sendAt(vn("2026-11-03T05:30"), VN, true, EmailRules.Category.SESSIONS, "SESSION_CANCELLED", null))
                .isEqualTo(vn("2026-11-03T07:00"));
        assertThat(EmailRules.sendAt(vn("2026-11-02T22:00"), VN, true, EmailRules.Category.MESSAGES, "MESSAGE_DIGEST", null))
                .isEqualTo(vn("2026-11-03T07:00"));
    }

    @Test
    void quietHoursFollowRecipientTimezone() {
        OffsetDateTime now = vn("2026-11-02T15:00"); // = 09:00 Paris (giờ mùa đông)
        assertThat(EmailRules.sendAt(now, ZoneId.of("Europe/Paris"), true, EmailRules.Category.REQUESTS, "X", null)).isEqualTo(now);
        OffsetDateTime late = vn("2026-11-03T05:00"); // = 23:00 Paris hôm trước
        assertThat(EmailRules.sendAt(late, ZoneId.of("Europe/Paris"), true, EmailRules.Category.REQUESTS, "X", null)
                .atZoneSameInstant(ZoneId.of("Europe/Paris")).toLocalTime()).isEqualTo(EmailRules.QUIET_END);
    }

    @Test
    void reminderForSessionInsideQuietWindowIsSentNow() {
        OffsetDateTime now = vn("2026-11-03T05:40");
        assertThat(EmailRules.sendAt(now, VN, true, EmailRules.Category.SESSIONS, "SESSION_REMINDER_1H", vn("2026-11-03T06:30")))
                .isEqualTo(now);
        // Phiên 09:00 thì nhắc lúc 05:40 vẫn chờ tới 07:00.
        assertThat(EmailRules.sendAt(now, VN, true, EmailRules.Category.SESSIONS, "SESSION_REMINDER_24H", vn("2026-11-04T09:00")))
                .isEqualTo(vn("2026-11-03T07:00"));
    }

    @Test
    void quietHoursOffOrSecurityEmailsSendNow() {
        OffsetDateTime night = vn("2026-11-02T23:30");
        assertThat(EmailRules.sendAt(night, VN, false, EmailRules.Category.REQUESTS, "X", null)).isEqualTo(night);
        assertThat(EmailRules.sendAt(night, VN, true, EmailRules.Category.SECURITY, "PASSWORD_RESET", null)).isEqualTo(night);
    }

    @Test
    void marketingOffByDefaultAccountAlwaysOn() {
        NotificationPreferences p = NotificationPreferences.defaults(UUID.randomUUID());
        assertThat(EmailRules.enabled(p, EmailRules.Category.MARKETING)).isFalse();
        assertThat(EmailRules.enabled(p, EmailRules.Category.SESSIONS)).isTrue();
        p.update(false, false, false, false, false, true, OffsetDateTime.now());
        assertThat(EmailRules.enabled(p, EmailRules.Category.SESSIONS)).isFalse();
        assertThat(EmailRules.enabled(p, EmailRules.Category.ACCOUNT)).isTrue();
        assertThat(EmailRules.enabled(p, EmailRules.Category.SECURITY)).isTrue();
    }

    // ---------------------------------------------------------------- mẫu email

    @Test
    void templatesCarryLinksAndPreferenceFooter() {
        String body = EmailTemplates.notificationBody("http://app/", "Lan", "Phiên sắp diễn ra.", "/mentoring/sessions",
                vn("2026-11-03T19:00").atZoneSameInstant(VN), ZoneId.of("Europe/Paris"));
        assertThat(body).startsWith("Chào Lan,").contains("Xem chi tiết: http://app/mentoring/sessions")
                .contains("Giờ bắt đầu: 13:00 03/11/2026 (Europe/Paris)").contains("http://app/account#notifications");
        assertThat(EmailTemplates.notificationSubject("SESSION_REMINDER_24H", "Nhắc lịch")).startsWith("[Nhắc lịch]");
        assertThat(EmailTemplates.notificationSubject("REQUEST_RECEIVED", "Có yêu cầu")).startsWith("[Yêu cầu mới]");
        assertThat(EmailTemplates.verifyBody("http://app", "tok")).contains("http://app/verify-email?token=tok");
        assertThat(EmailTemplates.resetBody("http://app", "tok", 30)).contains("/reset-password?token=tok").contains("30 phút");
    }

    // ---------------------------------------------------------------- hàng đợi

    private final UserRepository users = mock(UserRepository.class);
    private final NotificationPreferencesRepository prefs = mock(NotificationPreferencesRepository.class);
    private final EmailOutboxRepository outbox = mock(EmailOutboxRepository.class);
    private final ProfileClient profile = mock(ProfileClient.class);
    private final EmailSender sender = mock(EmailSender.class);
    private final TransactionTemplate tx = mock(TransactionTemplate.class);
    private final NotificationEmailService service = new NotificationEmailService(users, prefs, outbox, profile, sender, tx,
            "http://app");
    private final List<EmailOutbox> rows = new ArrayList<>();
    private final User user = new User();

    @SuppressWarnings("unchecked")
    NotificationEmailTest() {
        user.setId(UUID.randomUUID());
        user.setEmail("lan@test.local");
        user.setFullName("Lan");
        when(users.findById(user.getId())).thenReturn(Optional.of(user));
        when(prefs.findById(any())).thenReturn(Optional.empty());
        when(prefs.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(profile.timezone(any())).thenReturn(ZoneOffset.UTC);
        when(tx.execute(any())).thenAnswer(inv -> ((TransactionCallback<Object>) inv.getArgument(0)).doInTransaction(null));
        doAnswer(inv -> {
            ((Consumer<TransactionStatus>) inv.getArgument(0)).accept(null);
            return null;
        }).when(tx).executeWithoutResult(any());
        when(outbox.save(any())).thenAnswer(inv -> {
            EmailOutbox e = inv.getArgument(0);
            if (e.getId() == null) {
                ReflectionTestUtils.setField(e, "id", UUID.randomUUID());
                rows.add(e);
            }
            return e;
        });
        when(outbox.saveAll(any())).thenAnswer(inv -> inv.getArgument(0));
        when(outbox.findById(any())).thenAnswer(inv -> rows.stream().filter(r -> r.getId().equals(inv.getArgument(0))).findFirst());
    }

    private EmailRequest request(EmailRules.Category c, String type) {
        return new EmailRequest(user.getId(), c, type, "Tiêu đề", "Nội dung", "/x", null, null);
    }

    @Test
    void enqueueRespectsCategoryPreference() {
        NotificationPreferences p = NotificationPreferences.defaults(user.getId());
        p.update(true, false, true, true, false, true, OffsetDateTime.now());
        when(prefs.findById(user.getId())).thenReturn(Optional.of(p));
        assertThat(service.enqueue(request(EmailRules.Category.SESSIONS, "SESSION_CANCELLED")).status()).isEqualTo("SKIPPED");
        assertThat(rows.get(0).getSkipReason()).isEqualTo("PREFERENCE_OFF");
        assertThat(service.enqueue(request(EmailRules.Category.REQUESTS, "REQUEST_RECEIVED")).status()).isEqualTo("PENDING");
        assertThat(service.enqueue(request(EmailRules.Category.ACCOUNT, "MENTOR_APPROVED")).status()).isEqualTo("PENDING");
    }

    @Test
    void duplicateEventIsNotQueuedTwice() {
        when(outbox.existsByDedupeKey("k1")).thenReturn(true);
        EmailRequest in = new EmailRequest(user.getId(), EmailRules.Category.REQUESTS, "REQUEST_RECEIVED", "T", "M", null, null, "k1");
        assertThat(service.enqueue(in).status()).isEqualTo("DUPLICATE");
        verify(outbox, never()).save(any());
    }

    @Test
    void flushSendsDueEmailsAndRetriesFailures() {
        service.enqueue(request(EmailRules.Category.REQUESTS, "REQUEST_RECEIVED"));
        service.enqueue(request(EmailRules.Category.SESSIONS, "SESSION_CONFIRMED"));
        when(outbox.lockDue(any(), anyInt())).thenAnswer(inv -> new ArrayList<>(rows.stream()
                .filter(r -> r.getStatus() == EmailOutbox.Status.PENDING).toList()));
        doThrow(new RuntimeException("smtp down")).when(sender).send(eq("lan@test.local"), anyString(), anyString());
        assertThat(service.flush()).isZero();
        assertThat(rows).allSatisfy(r -> {
            assertThat(r.getStatus()).isEqualTo(EmailOutbox.Status.PENDING);
            assertThat(r.getAttempts()).isEqualTo(1);
        });
        doNothing().when(sender).send(anyString(), anyString(), anyString());
        assertThat(service.flush()).isEqualTo(2);
        assertThat(rows).allSatisfy(r -> assertThat(r.getStatus()).isEqualTo(EmailOutbox.Status.SENT));
    }

    @Test
    void preferencesRoundTrip() {
        PreferencesView v = service.preferences(user.getId());
        assertThat(v.marketing()).isFalse();
        assertThat(v.quietStart()).isEqualTo("22:00");
        v = service.updatePreferences(user.getId(), new PreferencesInput(true, true, false, true, true, false));
        assertThat(v.messages()).isFalse();
        assertThat(v.marketing()).isTrue();
        assertThat(v.quietHours()).isFalse();
    }

    // ---------------------------------------------------------------- US-39 — gửi lại email xác thực

    @Test
    void resendIsLimitedTo3PerHour() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        when(redis.opsForValue()).thenThrow(new IllegalStateException("redis down"));
        EmailVerificationService resend = new EmailVerificationService(users, new RateLimiter(redis), sender, tx,
                "http://app", true);
        when(users.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));
        for (int i = 0; i < EmailVerificationService.MAX_PER_HOUR; i++) {
            assertThat(resend.resend(user.getId()).emailVerificationToken()).isNotBlank();
        }
        assertThatThrownBy(() -> resend.resend(user.getId()))
                .isInstanceOf(ApiException.class)
                .hasFieldOrPropertyWithValue("status", HttpStatus.TOO_MANY_REQUESTS)
                .hasFieldOrPropertyWithValue("code", "RESEND_LIMIT");
        verify(sender, times(3)).send(eq("lan@test.local"), eq(EmailTemplates.VERIFY_SUBJECT), contains("/verify-email?token="));
    }

    @Test
    void resendRejectedWhenAlreadyVerified() {
        user.setEmailVerified(true);
        EmailVerificationService resend = new EmailVerificationService(users, mock(RateLimiter.class), sender, tx,
                "http://app", false);
        assertThatThrownBy(() -> resend.resend(user.getId())).hasFieldOrPropertyWithValue("code", "EMAIL_ALREADY_VERIFIED");
    }
}
