package com.mmp.learning.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class LearningServiceTest {

    @Test
    void percentCompleteIsRoundedToOneDecimal() {
        assertThat(LearningService.computePercent(0, 4)).isEqualTo(0f);
        assertThat(LearningService.computePercent(1, 3)).isEqualTo(33.3f);
        assertThat(LearningService.computePercent(2, 3)).isEqualTo(66.7f);
        assertThat(LearningService.computePercent(4, 4)).isEqualTo(100f);
    }

    @Test
    void percentHandlesEdgeCases() {
        assertThat(LearningService.computePercent(3, 0)).isEqualTo(0f);   // khoá chưa có tài liệu
        assertThat(LearningService.computePercent(5, 4)).isEqualTo(100f); // tài liệu bị xoá sau khi hoàn thành
    }
}
