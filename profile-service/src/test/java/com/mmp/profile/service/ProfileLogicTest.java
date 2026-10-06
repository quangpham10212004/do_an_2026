package com.mmp.profile.service;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Logic nghiệp vụ thuần của profile-service.
 *
 * Việc chuẩn hoá text và sinh embedding đã chuyển sang matching-service — test
 * tương ứng nằm ở matching-service/tests/test_index_service.py.
 */
class ProfileLogicTest {

    @Test
    void normalizeListTrimsAndDeduplicatesCaseInsensitively() {
        assertThat(ProfileService.normalizeList(List.of(" Java", "java", "", "Spring Boot", "SPRING BOOT")))
                .containsExactly("Java", "Spring Boot");
        assertThat(ProfileService.normalizeList(null)).isEmpty();
    }

    @Test
    void normalizeDomainIsCaseInsensitive() {
        assertThat(ProfileService.normalizeDomain("  BackEnd ")).isEqualTo("backend");
    }
}
