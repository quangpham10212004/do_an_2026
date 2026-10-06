package com.mmp.mentoring.service;

import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.security.AuthUser;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

/** US-04 (PRD-SES-3) — kiểm tra link phòng họp. */
class MeetingLinksTest {

    @Test
    void onlyHttpsOnKnownMeetingHostsIsAllowed() {
        assertThat(MeetingLinks.isAllowed("https://meet.google.com/abc-defg-hij")).isTrue();
        assertThat(MeetingLinks.isAllowed("https://zoom.us/j/123456789")).isTrue();
        assertThat(MeetingLinks.isAllowed("https://us02web.zoom.us/j/123?pwd=x")).isTrue();
        assertThat(MeetingLinks.isAllowed("https://teams.microsoft.com/l/meetup-join/xyz")).isTrue();
        assertThat(MeetingLinks.isAllowed("HTTPS://MEET.GOOGLE.COM/abc")).isTrue();

        assertThat(MeetingLinks.isAllowed("http://meet.google.com/abc")).isFalse();           // không https
        assertThat(MeetingLinks.isAllowed("https://evilzoom.us/j/1")).isFalse();              // không phải *.zoom.us
        assertThat(MeetingLinks.isAllowed("https://zoom.us.evil.com/j/1")).isFalse();
        assertThat(MeetingLinks.isAllowed("https://meet.google.com@evil.com/x")).isFalse();  // userinfo đánh lừa
        assertThat(MeetingLinks.isAllowed("https://user@meet.google.com/x")).isFalse();
        assertThat(MeetingLinks.isAllowed("https://meet.google.com:8443/x")).isFalse();
        assertThat(MeetingLinks.isAllowed("https://example.com/meet")).isFalse();
        assertThat(MeetingLinks.isAllowed("javascript:alert(1)")).isFalse();
        assertThat(MeetingLinks.isAllowed(null)).isFalse();
        assertThat(MeetingLinks.sanitize("https://example.com")).isNull();
    }

    @Test
    void linkIsVisibleOnlyFromConfirmed() {
        assertThat(MeetingLinks.visibleFor(MentoringSession.Status.PENDING)).isFalse();
        assertThat(MeetingLinks.visibleFor(MentoringSession.Status.CANCELLED)).isFalse();
        assertThat(MeetingLinks.visibleFor(MentoringSession.Status.CONFIRMED)).isTrue();
        assertThat(MeetingLinks.visibleFor(MentoringSession.Status.COMPLETED)).isTrue();
    }

    @Test
    void apiHidesLinkUntilConfirmedAndMentorCanOverride() {
        TestFixtures f = new TestFixtures();
        UUID mentor = UUID.randomUUID();
        MentoringSession s = new MentoringSession();
        s.setMentorId(mentor);
        s.setMenteeId(UUID.randomUUID());
        s.setScheduledAt(OffsetDateTime.now().plusDays(2));
        s.setDurationMinutes(60);
        s.setPrice(new BigDecimal("100000"));
        s.setStatus(MentoringSession.Status.PENDING);
        s.setMeetingLink("https://meet.google.com/abc-defg-hij");
        UUID id = UUID.randomUUID();
        when(f.sessionRepo.findById(id)).thenReturn(Optional.of(s));
        AuthUser mentorUser = new AuthUser(mentor, "m@test", "MENTOR");

        assertThat(f.service().get(mentorUser, id).meetingLink()).isNull();
        s.setStatus(MentoringSession.Status.CONFIRMED);
        assertThat(f.service().get(mentorUser, id).meetingLink()).isEqualTo("https://meet.google.com/abc-defg-hij");

        var updated = f.service().updateMeetingLink(mentorUser, id,
                new com.mmp.mentoring.dto.MentoringDtos.MeetingLinkInput("https://us02web.zoom.us/j/1"));
        assertThat(updated.meetingLink()).isEqualTo("https://us02web.zoom.us/j/1");
        assertThatThrownBy(() -> f.service().updateMeetingLink(mentorUser, id,
                new com.mmp.mentoring.dto.MentoringDtos.MeetingLinkInput("https://example.com/x")))
                .hasMessageContaining("https");
        assertThatThrownBy(() -> f.service().updateMeetingLink(new AuthUser(UUID.randomUUID(), "x", "MENTOR"), id,
                new com.mmp.mentoring.dto.MentoringDtos.MeetingLinkInput("https://zoom.us/j/2")))
                .hasMessageContaining("Chỉ mentor");
    }
}
