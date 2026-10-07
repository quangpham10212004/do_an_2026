package com.mmp.profile.service;

import com.mmp.profile.client.MatchingIndexClient;
import com.mmp.profile.dto.ProfileDtos.AvailabilityExceptionInput;
import com.mmp.profile.dto.ProfileDtos.AvailabilityExceptionResult;
import com.mmp.profile.entity.MentorAvailabilityException;
import com.mmp.profile.entity.MentorProfile;
import com.mmp.profile.exception.ApiException;
import com.mmp.profile.repository.MenteeProfileRepository;
import com.mmp.profile.repository.MentorAvailabilityExceptionRepository;
import com.mmp.profile.repository.MentorAvailabilityRepository;
import com.mmp.profile.repository.MentorProfileRepository;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.*;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** US-07 (PRD-PROF-4) — ngoại lệ lịch rảnh: cả ngày hoặc một khoảng giờ. */
class AvailabilityExceptionTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 10, 7);
    // 2026-10-06 18:00 UTC = 2026-10-07 01:00 giờ Việt Nam: "hôm nay" phải tính theo giờ VN, không theo UTC.
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-06T18:00:00Z"), ZoneOffset.UTC);
    private static final LocalTime T9 = LocalTime.of(9, 0);
    private static final LocalTime T12 = LocalTime.of(12, 0);
    private static final LocalTime T11 = LocalTime.of(11, 0);
    private static final LocalTime T14 = LocalTime.of(14, 0);

    private final MentorProfileRepository mentorRepo = mock(MentorProfileRepository.class);
    private final MentorAvailabilityExceptionRepository exceptionRepo = mock(MentorAvailabilityExceptionRepository.class);
    private final TransactionTemplate tx = mock(TransactionTemplate.class);
    private final ProfileService service = new ProfileService(mentorRepo, mock(MenteeProfileRepository.class),
            mock(MentorAvailabilityRepository.class), exceptionRepo, mock(MatchingIndexClient.class), tx, CLOCK);
    private final UUID mentorId = UUID.randomUUID();

    @SuppressWarnings("unchecked")
    AvailabilityExceptionTest() {
        when(tx.execute(any())).thenAnswer(inv -> ((TransactionCallback<Object>) inv.getArgument(0)).doInTransaction(null));
        MentorProfile mentor = new MentorProfile();
        mentor.setUserId(mentorId);
        when(mentorRepo.findById(mentorId)).thenReturn(Optional.of(mentor));
        when(exceptionRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    private static MentorAvailabilityException existing(LocalTime start, LocalTime end) {
        MentorAvailabilityException e = new MentorAvailabilityException(UUID.randomUUID(), TODAY.plusDays(3), start, end, null);
        ReflectionTestUtils.setField(e, "id", UUID.randomUUID());
        return e;
    }

    private static void assertRejected(Runnable r, String code) {
        assertThatThrownBy(r::run).isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).getCode()).isEqualTo(code));
    }

    @Test
    void wholeDayAndPartialExceptionsAreValid() {
        MentorRules.validateException(TODAY, null, null, TODAY, List.of(), null);
        MentorRules.validateException(TODAY.plusDays(1), T9, T12, TODAY, List.of(), null);
    }

    @Test
    void rejectsPastDateTooFarAheadAndHalfOpenRanges() {
        assertRejected(() -> MentorRules.validateException(TODAY.minusDays(1), null, null, TODAY, List.of(), null), "INVALID_EXCEPTION");
        assertRejected(() -> MentorRules.validateException(TODAY.plusDays(366), null, null, TODAY, List.of(), null), "INVALID_EXCEPTION");
        assertRejected(() -> MentorRules.validateException(TODAY, T9, null, TODAY, List.of(), null), "INVALID_EXCEPTION");
        assertRejected(() -> MentorRules.validateException(TODAY, T12, T9, TODAY, List.of(), null), "INVALID_SLOT");
        assertRejected(() -> MentorRules.validateException(TODAY, T9, T9, TODAY, List.of(), null), "INVALID_SLOT");
    }

    @Test
    void rejectsOverlapWithinSameDay() {
        List<MentorAvailabilityException> partial = List.of(existing(T9, T12));
        assertRejected(() -> MentorRules.validateException(TODAY, T11, T14, TODAY, partial, null), "OVERLAPPING_EXCEPTION");
        assertRejected(() -> MentorRules.validateException(TODAY, null, null, TODAY, partial, null), "OVERLAPPING_EXCEPTION");
        assertRejected(() -> MentorRules.validateException(TODAY, T9, T11, TODAY, List.of(existing(null, null)), null),
                "OVERLAPPING_EXCEPTION");
        // Liền kề (12:00 kết thúc, 12:00 bắt đầu) không tính là trùng.
        MentorRules.validateException(TODAY, T12, T14, TODAY, partial, null);
    }

    @Test
    void editingAnExceptionDoesNotConflictWithItself() {
        MentorAvailabilityException self = existing(T9, T12);
        MentorRules.validateException(TODAY, T9, T14, TODAY, List.of(self), self.getId());
    }

    @Test
    void createUsesVietnamDateAndAlwaysWarnsAboutConfirmedSessions() {
        // Theo UTC vẫn là ngày 6, nhưng ở VN đã sang ngày 7 => ngày 6 là ngày đã qua.
        assertRejected(() -> service.createException(mentorId,
                new AvailabilityExceptionInput(TODAY.minusDays(1), null, null, null)), "INVALID_EXCEPTION");
        AvailabilityExceptionResult res = service.createException(mentorId,
                new AvailabilityExceptionInput(TODAY, T9, T12, "  Đi công tác  "));
        assertThat(res.exception().date()).isEqualTo(TODAY);
        assertThat(res.exception().startTime()).isEqualTo("09:00");
        assertThat(res.exception().endTime()).isEqualTo("12:00");
        assertThat(res.exception().reason()).isEqualTo("Đi công tác");
        assertThat(res.warning()).isNotBlank();
    }

    @Test
    void createRejectsWhenTooManyUpcomingExceptions() {
        when(exceptionRepo.countByMentorIdAndDateGreaterThanEqual(mentorId, TODAY)).thenReturn(100L);
        assertRejected(() -> service.createException(mentorId, new AvailabilityExceptionInput(TODAY, null, null, null)),
                "TOO_MANY_EXCEPTIONS");
    }

    @Test
    void cannotTouchAnotherMentorsException() {
        MentorAvailabilityException other = existing(null, null); // mentor_id ngẫu nhiên khác mentorId
        when(exceptionRepo.findById(other.getId())).thenReturn(Optional.of(other));
        assertThatThrownBy(() -> service.updateException(mentorId, other.getId(),
                new AvailabilityExceptionInput(TODAY.plusDays(2), null, null, null)))
                .isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).getStatus()).isEqualTo(HttpStatus.NOT_FOUND));
    }
}
