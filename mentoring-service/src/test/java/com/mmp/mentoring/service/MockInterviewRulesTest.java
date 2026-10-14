package com.mmp.mentoring.service;

import com.mmp.mentoring.entity.MockIntake.InterviewType;
import com.mmp.mentoring.exception.ApiException;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** US-58 — trọng số §6.5, kiểm tra phiếu, mốc nhắc mentor (PRD-PREP-2). */
class MockInterviewRulesTest {

    @Test
    void weightsSumTo100ForEveryType() {
        for (InterviewType t : InterviewType.values()) {
            MockInterviewRules.Weights w = MockInterviewRules.WEIGHTS.get(t);
            assertThat(w.technical() + w.problemSolving() + w.depth() + w.communication()).as(t.name()).isEqualTo(100);
        }
    }

    @Test
    void overallIsTheWeightedMean() {
        // Backend 35/25/25/15: 8·.35 + 6·.25 + 7·.25 + 5·.15 = 6.80
        assertThat(MockInterviewRules.overall(InterviewType.BACKEND, 8, 6, 7, 5)).isEqualByComparingTo("6.80");
        // Behavioral bỏ qua kỹ thuật: 0·10 + .20·6 + .45·8 + .35·7 = 7.25
        assertThat(MockInterviewRules.overall(InterviewType.BEHAVIORAL, 10, 6, 8, 7)).isEqualByComparingTo("7.25");
        assertThat(MockInterviewRules.overall(InterviewType.SYSTEM_DESIGN, 10, 10, 10, 10)).isEqualByComparingTo("10.00");
    }

    @Test
    void scoresMustBe0To10() {
        MockInterviewRules.requireScore("x", 0);
        MockInterviewRules.requireScore("x", 10);
        for (Integer bad : Arrays.asList(-1, 11, null)) {
            assertThatThrownBy(() -> MockInterviewRules.requireScore("x", bad)).isInstanceOf(ApiException.class);
        }
    }

    @Test
    void exactlyThreeDistinctFixesOfSensibleLength() {
        assertThat(MockInterviewRules.fixes(List.of("  Nói rõ độ phức tạp  ", "Hỏi lại yêu cầu", "Viết test biên")))
                .containsExactly("Nói rõ độ phức tạp", "Hỏi lại yêu cầu", "Viết test biên");
        assertThat(code(() -> MockInterviewRules.fixes(List.of("Một ý", "Hai ý")))).isEqualTo("FIXES_REQUIRED");
        assertThat(code(() -> MockInterviewRules.fixes(List.of("abc", "Hỏi lại yêu cầu", "Viết test biên")))).isEqualTo("INVALID_FIX");
        assertThat(code(() -> MockInterviewRules.fixes(List.of("Viết test biên", "Hỏi lại yêu cầu", "viết TEST biên"))))
                .isEqualTo("DUPLICATE_FIX");
    }

    @Test
    void scorecardOpensAtEndAndLocksAfter7Days() {
        OffsetDateTime end = OffsetDateTime.parse("2026-10-20T10:00:00+07:00");
        assertThat(code(() -> MockInterviewRules.requireScorable("CONFIRMED", end, end.minusMinutes(1)))).isEqualTo("SESSION_NOT_ENDED");
        assertThat(code(() -> MockInterviewRules.requireScorable("NO_SHOW_MENTEE", end, end.plusHours(1)))).isEqualTo("SESSION_NOT_SCORABLE");
        assertThat(code(() -> MockInterviewRules.requireScorable("AWAITING_ATTENDANCE", end, end.plusHours(1)))).isEqualTo("OK");
        assertThat(code(() -> MockInterviewRules.requireScorable("COMPLETED", end, end.plusDays(8)))).isEqualTo("SCORECARD_LOCKED");
    }

    @Test
    void remindersAt12hAnd36hThenMissingAt48h() {
        OffsetDateTime end = OffsetDateTime.parse("2026-10-20T10:00:00+07:00");
        assertThat(MockInterviewRules.due(end, end.plusHours(11), false, false)).isNull();
        assertThat(MockInterviewRules.due(end, end.plusHours(12), false, false)).isEqualTo(MockInterviewRules.Due.REMIND_12H);
        assertThat(MockInterviewRules.due(end, end.plusHours(20), true, false)).isNull();
        assertThat(MockInterviewRules.due(end, end.plusHours(36), true, false)).isEqualTo(MockInterviewRules.Due.REMIND_36H);
        // Job chạy trễ qua mốc 36h mà chưa nhắc 12h: chỉ gửi lần nhắc 36h, không gửi cả hai
        assertThat(MockInterviewRules.due(end, end.plusHours(40), false, false)).isEqualTo(MockInterviewRules.Due.REMIND_36H);
        assertThat(MockInterviewRules.due(end, end.plusHours(40), true, true)).isNull();
        assertThat(MockInterviewRules.due(end, end.plusHours(48), true, true)).isEqualTo(MockInterviewRules.Due.MISSING);
    }

    private static String code(Runnable r) {
        try {
            r.run();
        } catch (ApiException e) {
            return e.getCode();
        }
        return "OK";
    }
}
