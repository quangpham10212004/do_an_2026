package com.mmp.mentoring.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** Bản chốt v2.0 §12 — che SĐT, email, đường dẫn ngoài, tài khoản mạng xã hội và nhận diện loại thông tin liên hệ. */
class ContactMaskingTest {

    @Test
    void masksOutsideLinks() {
        assertThat(MessageRules.mask("xem https://github.com/me/repo nhé")).isEqualTo("xem •••(liên kết ngoài)••• nhé");
        assertThat(MessageRules.mask("www.example.com/abc")).isEqualTo("•••(liên kết ngoài)•••");
    }

    @Test
    void masksMessengerAccounts() {
        assertThat(MessageRules.mask("Zalo: nguyenvana")).isEqualTo("Zalo •••");
        assertThat(MessageRules.mask("telegram @mentor_01")).isEqualTo("telegram •••");
        assertThat(MessageRules.mask("fb.me/abc")).doesNotContain("abc");
    }

    @Test
    void stillMasksPhonesAndEmailsTogether() {
        String out = MessageRules.mask("0912345678 hoặc nam.le@gmail.com");
        assertThat(out).contains("09•••••••78").contains("n•••@•••.com").doesNotContain("nam.le");
    }

    @Test
    void ordinaryTextIsUntouched() {
        String text = "Em muốn học Spring Boot và Docker, lịch rảnh tối thứ 3";
        assertThat(MessageRules.mask(text)).isEqualTo(text);
        assertThat(MessageRules.contactKinds(text)).isEmpty();
    }

    @Test
    void reportsWhichKindsOfContactWereShared() {
        assertThat(MessageRules.contactKinds("gọi 0912345678, mail a.b@x.com, zalo: abcdef, https://x.io")).containsExactly("PHONE", "EMAIL", "LINK", "SOCIAL");
    }
}
