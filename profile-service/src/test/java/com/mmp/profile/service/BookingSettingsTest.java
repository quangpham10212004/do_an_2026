package com.mmp.profile.service;

import com.mmp.profile.client.MatchingIndexClient;
import com.mmp.profile.dto.ProfileDtos.BookingSettingsInput;
import com.mmp.profile.dto.ProfileDtos.MentorProfileResponse;
import com.mmp.profile.entity.MentorProfile;
import com.mmp.profile.exception.ApiException;
import com.mmp.profile.repository.MenteeProfileRepository;
import com.mmp.profile.repository.MentorAvailabilityExceptionRepository;
import com.mmp.profile.repository.MentorAvailabilityRepository;
import com.mmp.profile.repository.MentorProfileRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** US-04 (PRD-SES-3) — link họp + cài đặt đặt lịch của mentor. */
class BookingSettingsTest {

    private static void assertCode(Runnable r, String code) {
        assertThatThrownBy(r::run).isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).getCode()).isEqualTo(code));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "https://meet.google.com/abc-defg-hij",
            "https://zoom.us/j/123456789",
            "https://us02web.zoom.us/j/123?pwd=x",
            "https://teams.microsoft.com/l/meetup-join/19%3a",
            "HTTPS://Meet.Google.com/abc-defg-hij"})
    void acceptsHttpsLinksOnAllowedHosts(String link) {
        assertThat(MentorRules.normalizeMeetingLink("  " + link + " ")).isEqualTo(link);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "http://meet.google.com/abc",              // không https
            "https://evil.com/meet.google.com",        // host khác
            "https://meet.google.com.evil.com/x",      // đuôi giả mạo
            "https://notzoom.us/j/1",                  // không phải *.zoom.us
            "https://user:pw@zoom.us/j/1",             // kèm thông tin đăng nhập
            "javascript:alert(1)",
            "meet.google.com/abc",                     // thiếu scheme
            "https://meet google.com"})                // URI sai
    void rejectsOtherLinks(String link) {
        assertCode(() -> MentorRules.normalizeMeetingLink(link), "INVALID_MEETING_LINK");
    }

    @Test
    void blankLinkClearsIt() {
        assertThat(MentorRules.normalizeMeetingLink("  ")).isNull();
        assertThat(MentorRules.normalizeMeetingLink(null)).isNull();
    }

    @Test
    void bufferAndNoticeRanges() {
        for (int buffer : new int[]{0, 15, 30}) MentorRules.validateBufferAndNotice(buffer, 12);
        MentorRules.validateBufferAndNotice(15, 1);
        MentorRules.validateBufferAndNotice(15, 72);
        assertCode(() -> MentorRules.validateBufferAndNotice(10, 12), "INVALID_BOOKING_SETTINGS");
        assertCode(() -> MentorRules.validateBufferAndNotice(15, 0), "INVALID_BOOKING_SETTINGS");
        assertCode(() -> MentorRules.validateBufferAndNotice(15, 73), "INVALID_BOOKING_SETTINGS");
        assertCode(() -> MentorRules.validateBufferAndNotice(null, 12), "INVALID_BOOKING_SETTINGS");
    }

    @Test
    void languagesAndSessionTypesAreNormalizedAndRequired() {
        assertThat(MentorRules.normalizeCodes(List.of(" EN", "vi", "en"), MentorRules.LANGUAGES, false, "Ngôn ngữ"))
                .containsExactly("en", "vi");
        assertThat(MentorRules.normalizeCodes(List.of("code_review"), MentorRules.SESSION_TYPES, true, "Loại phiên"))
                .containsExactly("CODE_REVIEW");
        assertCode(() -> MentorRules.normalizeCodes(List.of("fr"), MentorRules.LANGUAGES, false, "Ngôn ngữ"), "INVALID_BOOKING_SETTINGS");
        assertCode(() -> MentorRules.normalizeCodes(List.of(), MentorRules.LANGUAGES, false, "Ngôn ngữ"), "INVALID_BOOKING_SETTINGS");
        assertCode(() -> MentorRules.normalizeCodes(List.of("PAIR_PROGRAMMING"), MentorRules.SESSION_TYPES, true, "Loại phiên"),
                "INVALID_BOOKING_SETTINGS");
    }

    @Test
    void timezoneDefaultsToVietnamAndMustBeIana() {
        assertThat(MentorRules.normalizeTimezone(null)).isEqualTo("Asia/Ho_Chi_Minh");
        assertThat(MentorRules.normalizeTimezone("Asia/Tokyo")).isEqualTo("Asia/Tokyo");
        assertCode(() -> MentorRules.normalizeTimezone("Mars/Base"), "INVALID_TIMEZONE");
        assertCode(() -> MentorRules.normalizeTimezone("+07:00"), "INVALID_TIMEZONE");
    }

    @Test
    @SuppressWarnings("unchecked")
    void settingsAreSavedExposedAndLinkCanBeHidden() {
        MentorProfileRepository repo = mock(MentorProfileRepository.class);
        TransactionTemplate tx = mock(TransactionTemplate.class);
        when(tx.execute(any())).thenAnswer(inv -> ((TransactionCallback<Object>) inv.getArgument(0)).doInTransaction(null));
        doAnswer(inv -> {
            ((Consumer<TransactionStatus>) inv.getArgument(0)).accept(null);
            return null;
        }).when(tx).executeWithoutResult(any());
        // 2026-10-07 20:00 UTC: ở Tokyo đã là ngày 8, ở VN vẫn là ngày 8 lúc 03:00; ở New York vẫn ngày 7.
        Clock clock = Clock.fixed(Instant.parse("2026-10-07T20:00:00Z"), ZoneOffset.UTC);
        ProfileService service = new ProfileService(repo, mock(MenteeProfileRepository.class),
                mock(MentorAvailabilityRepository.class), mock(MentorAvailabilityExceptionRepository.class),
                mock(MatchingIndexClient.class), tx, clock);
        UUID id = UUID.randomUUID();
        MentorProfile mentor = new MentorProfile();
        mentor.setUserId(id);
        when(repo.findById(id)).thenReturn(Optional.of(mentor));

        // Mặc định cho mentor cũ.
        MentorProfileResponse res = service.getMentor(id);
        assertThat(res.bufferMinutes()).isEqualTo(15);
        assertThat(res.minNoticeHours()).isEqualTo(12);
        assertThat(res.languages()).containsExactly("vi");
        assertThat(res.sessionTypes()).hasSize(4);
        assertThat(res.timezone()).isEqualTo("Asia/Ho_Chi_Minh");

        res = service.updateBookingSettings(id, new BookingSettingsInput("https://meet.google.com/abc-defg-hij",
                30, 24, List.of("vi", "en"), List.of("MOCK_INTERVIEW"), "America/New_York"));
        assertThat(res.meetingLink()).isEqualTo("https://meet.google.com/abc-defg-hij");
        assertThat(res.bufferMinutes()).isEqualTo(30);
        assertThat(res.minNoticeHours()).isEqualTo(24);
        assertThat(res.languages()).containsExactly("vi", "en");
        assertThat(res.sessionTypes()).containsExactly("MOCK_INTERVIEW");
        assertThat(res.timezone()).isEqualTo("America/New_York");
        assertThat(res.withoutMeetingLink().meetingLink()).isNull();
        assertThat(res.withoutMeetingLink().bufferMinutes()).isEqualTo(30);

        // "Hôm nay" theo múi giờ của mentor (New York vẫn là ngày 7).
        assertThat(service.today(mentor)).isEqualTo(LocalDate.of(2026, 10, 7));

        // Link sai => không lưu gì.
        assertCode(() -> service.updateBookingSettings(id, new BookingSettingsInput("http://zoom.us/j/1",
                15, 12, List.of("vi"), List.of("CODE_REVIEW"), null)), "INVALID_MEETING_LINK");
        assertThat(mentor.getMeetingLink()).isEqualTo("https://meet.google.com/abc-defg-hij");
    }
}
