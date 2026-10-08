package com.mmp.mentoring.service;

import com.mmp.mentoring.entity.Dispute;
import com.mmp.mentoring.entity.MentoringSession;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** US-32 — quy tắc mở / SLA / kết luận tranh chấp. */
class DisputeRulesTest {

    private static final Duration WEEK = Duration.ofDays(7);
    private static final Duration SLA = Duration.ofHours(48);
    private static final String DESC = "Mentor vao muon 30 phut va ket thuc som.";

    private static MentoringSession session(MentoringSession.Status status, OffsetDateTime end) {
        MentoringSession s = new MentoringSession();
        s.setDurationMinutes(60);
        s.setScheduledAt(end.minusMinutes(60));
        s.setStatus(status);
        return s;
    }

    @Test
    void descriptionAndEvidenceValidation() {
        assertThat(DisputeRules.validateInput("ngan qua", List.of())).contains("INVALID_DESCRIPTION");
        assertThat(DisputeRules.validateInput("x".repeat(2001), List.of())).contains("INVALID_DESCRIPTION");
        assertThat(DisputeRules.validateInput("x".repeat(20), null)).isEmpty();
        assertThat(DisputeRules.validateInput(DESC, List.of("https://a.com/1", "https://a.com/2", "https://a.com/3",
                "https://a.com/4", "https://a.com/5", "https://a.com/6"))).contains("TOO_MANY_EVIDENCE_LINKS");
        assertThat(DisputeRules.validateInput(DESC, List.of("http://insecure.com/x"))).contains("INVALID_EVIDENCE_LINK");
        assertThat(DisputeRules.validateInput(DESC, List.of("javascript:alert(1)"))).contains("INVALID_EVIDENCE_LINK");
        assertThat(DisputeRules.validateInput(DESC, List.of("https://drive.google.com/file/d/abc"))).isEmpty();
    }

    @Test
    void openableStatusesAndSevenDayWindow() {
        OffsetDateTime now = OffsetDateTime.now();
        assertThat(DisputeRules.canOpen(session(MentoringSession.Status.COMPLETED, now.minusDays(6)), WEEK, now)).isEmpty();
        assertThat(DisputeRules.canOpen(session(MentoringSession.Status.NO_SHOW_MENTEE, now.minusDays(1)), WEEK, now)).isEmpty();
        assertThat(DisputeRules.canOpen(session(MentoringSession.Status.NO_SHOW_MENTOR, now.minusDays(1)), WEEK, now)).isEmpty();
        assertThat(DisputeRules.canOpen(session(MentoringSession.Status.AWAITING_ATTENDANCE, now.minusHours(1)), WEEK, now)).isEmpty();
        assertThat(DisputeRules.canOpen(session(MentoringSession.Status.COMPLETED, now.minusDays(7).minusMinutes(1)), WEEK, now))
                .contains("DISPUTE_WINDOW_CLOSED");
        assertThat(DisputeRules.canOpen(session(MentoringSession.Status.CONFIRMED, now.plusDays(1)), WEEK, now)).contains("DISPUTE_NOT_ALLOWED");
        assertThat(DisputeRules.canOpen(session(MentoringSession.Status.CANCELLED, now.minusDays(1)), WEEK, now)).contains("DISPUTE_NOT_ALLOWED");
        assertThat(DisputeRules.canOpen(session(MentoringSession.Status.DISPUTED, now.minusDays(1)), WEEK, now)).contains("DISPUTE_NOT_ALLOWED");
    }

    @Test
    void slaFirstResponseDueAfter48Hours() {
        Dispute d = new Dispute(UUID.randomUUID(), null, Dispute.OpenedByRole.SYSTEM, Dispute.Type.NO_SHOW, DESC, List.of());
        OffsetDateTime created = OffsetDateTime.now().minusHours(49);
        ReflectionTestUtils.setField(d, "createdAt", created);
        assertThat(DisputeRules.firstResponseDue(d, SLA)).isEqualTo(created.plusHours(48));
        assertThat(DisputeRules.overdue(d, SLA, OffsetDateTime.now())).isTrue();
        assertThat(DisputeRules.overdue(d, SLA, created.plusHours(47))).isFalse();
        d.startReview(created.plusHours(10));
        assertThat(DisputeRules.overdue(d, SLA, OffsetDateTime.now())).isFalse();
    }

    @Test
    void resolutionPercentRules() {
        assertThat(DisputeRules.validateResolution(Dispute.Outcome.PARTIAL_REFUND, null)).contains("INVALID_REFUND_PERCENT");
        assertThat(DisputeRules.validateResolution(Dispute.Outcome.PARTIAL_REFUND, 0)).contains("INVALID_REFUND_PERCENT");
        assertThat(DisputeRules.validateResolution(Dispute.Outcome.PARTIAL_REFUND, 100)).contains("INVALID_REFUND_PERCENT");
        assertThat(DisputeRules.validateResolution(Dispute.Outcome.PARTIAL_REFUND, 50)).isEmpty();
        assertThat(DisputeRules.validateResolution(Dispute.Outcome.NO_REFUND, 50)).contains("INVALID_REFUND_PERCENT");
        assertThat(DisputeRules.validateResolution(Dispute.Outcome.FULL_REFUND, null)).isEmpty();

        assertThat(DisputeRules.refundPercent(Dispute.Outcome.FULL_REFUND, null)).isEqualTo(100);
        assertThat(DisputeRules.refundPercent(Dispute.Outcome.SUSPEND, null)).isEqualTo(100);
        assertThat(DisputeRules.refundPercent(Dispute.Outcome.PARTIAL_REFUND, 30)).isEqualTo(30);
        assertThat(DisputeRules.refundPercent(Dispute.Outcome.WARNING, null)).isZero();

        assertThat(DisputeRules.releasesEarning(Dispute.Outcome.PARTIAL_REFUND)).isTrue();
        assertThat(DisputeRules.releasesEarning(Dispute.Outcome.NO_REFUND)).isTrue();
        assertThat(DisputeRules.releasesEarning(Dispute.Outcome.FULL_REFUND)).isFalse();
        assertThat(DisputeRules.releasesEarning(Dispute.Outcome.SUSPEND)).isFalse();
    }

    @Test
    void sessionStatusAfterResolution() {
        assertThat(DisputeRules.sessionStatusAfter(Dispute.Outcome.NO_REFUND, MentoringSession.Status.DISPUTED))
                .contains(MentoringSession.Status.COMPLETED);
        assertThat(DisputeRules.sessionStatusAfter(Dispute.Outcome.WARNING, MentoringSession.Status.AWAITING_ATTENDANCE))
                .contains(MentoringSession.Status.COMPLETED);
        assertThat(DisputeRules.sessionStatusAfter(Dispute.Outcome.NO_REFUND, MentoringSession.Status.NO_SHOW_MENTEE)).isEqualTo(Optional.empty());
        assertThat(DisputeRules.sessionStatusAfter(Dispute.Outcome.PARTIAL_REFUND, MentoringSession.Status.DISPUTED)).isEmpty();
        assertThat(DisputeRules.sessionStatusAfter(Dispute.Outcome.FULL_REFUND, MentoringSession.Status.COMPLETED)).isEmpty();
    }
}
