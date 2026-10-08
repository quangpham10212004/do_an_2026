package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.entity.MentoringRequest;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.repository.SessionRepository;
import com.mmp.mentoring.security.AuthUser;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Dữ liệu và tiện ích dùng chung cho test service (không cần Spring/DB). */
final class TestSupport {

    static final ZoneId ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private TestSupport() {
    }

    /** TransactionTemplate chạy callback ngay, không có transaction thật. */
    @SuppressWarnings("unchecked")
    static TransactionTemplate tx() {
        TransactionTemplate tx = mock(TransactionTemplate.class);
        when(tx.execute(any())).thenAnswer(inv -> ((TransactionCallback<?>) inv.getArgument(0)).doInTransaction(null));
        doAnswer(inv -> {
            ((Consumer<Object>) inv.getArgument(0)).accept(null);
            return null;
        }).when(tx).executeWithoutResult(any());
        return tx;
    }

    /** Mentor rảnh mọi ngày 08:00-22:00 (giờ Việt Nam). */
    static ProfileClient.MentorInfo mentor(UUID id, BigDecimal hourlyRate, int capacity) {
        List<ProfileClient.AvailabilitySlot> slots = new ArrayList<>();
        for (int day = 1; day <= 7; day++) {
            slots.add(new ProfileClient.AvailabilitySlot(UUID.randomUUID(), day, LocalTime.of(8, 0), LocalTime.of(22, 0)));
        }
        return new ProfileClient.MentorInfo(id, "Mentor", List.of("Java"), "backend", "bio", 5, hourlyRate, capacity, 0,
                true, 4.5f, 3, "APPROVED", slots);
    }

    /** {@code daysAhead} ngày nữa, đúng {@code hour} giờ địa phương. */
    static OffsetDateTime at(int daysAhead, int hour) {
        return OffsetDateTime.now().atZoneSameInstant(ZONE).plusDays(daysAhead).truncatedTo(ChronoUnit.DAYS)
                .plusHours(hour).toOffsetDateTime();
    }

    static AuthUser user(UUID id, String role) {
        return new AuthUser(id, role.toLowerCase() + "@test.local", role);
    }

    static MentoringSession session(UUID menteeId, UUID mentorId, MentoringSession.Status status, OffsetDateTime start) {
        MentoringSession s = new MentoringSession();
        ReflectionTestUtils.setField(s, "id", UUID.randomUUID());
        s.setMenteeId(menteeId);
        s.setMentorId(mentorId);
        s.setStatus(status);
        s.setScheduledAt(start);
        s.setDurationMinutes(60);
        s.setPrice(BigDecimal.valueOf(200_000));
        return s;
    }

    static MentoringRequest request(UUID menteeId, UUID mentorId, MentoringRequest.Status status) {
        MentoringRequest r = new MentoringRequest(menteeId, mentorId, "hi");
        ReflectionTestUtils.setField(r, "id", UUID.randomUUID());
        r.setStatus(status);
        return r;
    }

    static BookingValidator validator(SessionRepository repo) {
        return new BookingValidator(repo, "Asia/Ho_Chi_Minh", Duration.ofHours(1), Duration.ofDays(60));
    }
}
