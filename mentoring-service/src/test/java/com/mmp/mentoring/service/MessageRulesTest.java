package com.mmp.mentoring.service;

import com.mmp.mentoring.exception.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.time.OffsetDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** US-33 (PRD-MSG-1..3) — giới hạn nội dung, chỉ đọc sau 30 ngày, 3 tin trước khi chấp nhận, che SĐT/email. */
class MessageRulesTest {

    private final OffsetDateTime now = OffsetDateTime.parse("2026-11-01T10:00:00+07:00");

    @Test
    void bodyIsTrimmedAndLimitedTo2000() {
        assertThat(MessageRules.validateBody("  chào anh  ")).isEqualTo("chào anh");
        assertThat(MessageRules.validateBody("a".repeat(2000))).hasSize(2000);
        assertThatThrownBy(() -> MessageRules.validateBody("   ")).hasFieldOrPropertyWithValue("code", "INVALID_MESSAGE");
        assertThatThrownBy(() -> MessageRules.validateBody("a".repeat(2001))).hasFieldOrPropertyWithValue("code", "INVALID_MESSAGE");
    }

    @Test
    void openRequestsAreWritable() {
        assertThat(MessageRules.isWritable("PENDING", null, now)).isTrue();
        assertThat(MessageRules.isWritable("ACCEPTED", null, now)).isTrue();
    }

    @Test
    void closedRequestsStayWritableFor30Days() {
        assertThat(MessageRules.isWritable("ENDED", now.minusDays(29), now)).isTrue();
        assertThat(MessageRules.isWritable("ENDED", now.minusDays(30), now)).isFalse();
        assertThat(MessageRules.isWritable("REJECTED", now.minusDays(1), now)).isTrue();
        assertThat(MessageRules.isWritable("EXPIRED", now.minusDays(31), now)).isFalse();
        assertThatThrownBy(() -> MessageRules.requireWritable("ENDED", now.minusDays(40), now))
                .hasFieldOrPropertyWithValue("code", "CONVERSATION_READ_ONLY");
    }

    @Test
    void cancelledRequestIsReadOnlyImmediately() {
        assertThat(MessageRules.isWritable("CANCELLED", now, now)).isFalse();
    }

    @Test
    void fourthPreAcceptMessageFromMenteeIs429() {
        MessageRules.requirePreAcceptQuota(true, "PENDING", 2);
        assertThatThrownBy(() -> MessageRules.requirePreAcceptQuota(true, "PENDING", 3))
                .isInstanceOf(ApiException.class)
                .hasFieldOrPropertyWithValue("status", HttpStatus.TOO_MANY_REQUESTS)
                .hasFieldOrPropertyWithValue("code", "MESSAGE_LIMIT_BEFORE_ACCEPT");
        // Bị từ chối / hết hạn: vẫn là "chưa từng được chấp nhận".
        assertThatThrownBy(() -> MessageRules.requirePreAcceptQuota(true, "REJECTED", 3))
                .hasFieldOrPropertyWithValue("code", "MESSAGE_LIMIT_BEFORE_ACCEPT");
    }

    @Test
    void noLimitForMentorOrAfterAccept() {
        MessageRules.requirePreAcceptQuota(false, "PENDING", 50);
        MessageRules.requirePreAcceptQuota(true, "ACCEPTED", 50);
        MessageRules.requirePreAcceptQuota(true, "ENDED", 50);
        assertThat(MessageRules.remainingPreAccept(true, "PENDING", 1)).isEqualTo(2);
        assertThat(MessageRules.remainingPreAccept(true, "PENDING", 5)).isZero();
        assertThat(MessageRules.remainingPreAccept(true, "ACCEPTED", 1)).isNull();
        assertThat(MessageRules.remainingPreAccept(false, "PENDING", 1)).isNull();
    }

    @Test
    void masksPhoneAsInAcceptanceCriterion() {
        assertThat(MessageRules.mask("call me 0912345678")).isEqualTo("call me 09•••••••78");
    }

    @Test
    void masksPhoneWithSeparatorsAndCountryCode() {
        assertThat(MessageRules.mask("SĐT: 091 234 5678.")).isEqualTo("SĐT: 09•••••••78.");
        assertThat(MessageRules.mask("zalo 0912.345.678 nhé")).isEqualTo("zalo 09•••••••78 nhé");
        assertThat(MessageRules.mask("+84 912 345 678")).isEqualTo("84•••••••78");
    }

    @Test
    void masksEmail() {
        assertThat(MessageRules.mask("mail nam.le@gmail.com nha")).isEqualTo("mail n•••@•••.com nha");
        assertThat(MessageRules.mask("x@fpt.edu.vn")).isEqualTo("x•••@•••.vn");
    }

    @Test
    void leavesOrdinaryNumbersAlone() {
        String text = "Phí 300.000.000đ, hẹn 2026-11-20 lúc 19:30, phòng 1203, mã 12345678";
        assertThat(MessageRules.mask(text)).isEqualTo(text);
    }
}
