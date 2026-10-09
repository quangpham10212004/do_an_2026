package com.mmp.mentoring.service;

import com.mmp.mentoring.client.EmailClient;
import com.mmp.mentoring.dto.MentoringDtos.CreateRequestInput;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.security.AuthUser;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import static org.mockito.Mockito.verifyNoInteractions;

/** US-39 (PRD-AUTH-3) + US-38 — tài khoản chưa xác thực bị chặn; loại thông báo nào có email, gộp tin nhắn. */
class EmailVerificationGateTest {

    private final AuthUser unverified = new AuthUser(UUID.randomUUID(), "e@x", "MENTEE", false);

    @Test
    void unverifiedMenteeCannotBook() {
        TestFixtures f = new TestFixtures();
        assertThatThrownBy(() -> f.service().book(unverified, null))
                .isInstanceOf(ApiException.class)
                .hasFieldOrPropertyWithValue("status", HttpStatus.FORBIDDEN)
                .hasFieldOrPropertyWithValue("code", "EMAIL_NOT_VERIFIED");
        verifyNoInteractions(f.sessionRepo);
    }

    @Test
    void legacyTokenWithoutClaimCountsAsVerified() {
        new AuthUser(UUID.randomUUID(), "e@x", "MENTEE").requireVerifiedEmail();
    }

    @Test
    void unverifiedCannotSendRequestEither() {
        assertThatThrownBy(unverified::requireVerifiedEmail).hasFieldOrPropertyWithValue("code", "EMAIL_NOT_VERIFIED");
        assertThat(CreateRequestInput.class).isNotNull();
    }

    @Test
    void onlyCatalogueEventsAreEmailed() {
        assertThat(EmailClient.emailable("REQUEST_RECEIVED")).isTrue();
        assertThat(EmailClient.emailable("SESSION_REMINDER_24H")).isTrue();
        assertThat(EmailClient.emailable("MENTOR_APPROVED")).isTrue();
        assertThat(EmailClient.emailable("REQUEST_REJECTED")).isFalse();
        assertThat(EmailClient.emailable("REVIEW_RECEIVED")).isFalse();
        assertThat(EmailClient.emailable("MESSAGE_RECEIVED")).isFalse(); // tin nhắn chỉ gửi email dạng gộp
        assertThat(EmailClient.CATEGORIES.get("MESSAGE_DIGEST")).isEqualTo("MESSAGES");
    }

    @Test
    void digestNamesSenders() {
        assertThat(MessageEmailDigestJob.digestMessage(3, List.of("Mentor A", "Mentee B")))
                .startsWith("Bạn có 3 tin nhắn chưa đọc từ Mentor A, Mentee B");
    }
}
