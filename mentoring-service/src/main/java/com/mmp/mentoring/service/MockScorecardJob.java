package com.mmp.mentoring.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;

/** US-58 (PRD-PREP-2) — mỗi 5 phút: nhắc mentor điền phiếu phỏng vấn thử (12h / 36h), đánh dấu thiếu phiếu ở 48h. */
@Component
public class MockScorecardJob {

    private final MockInterviewService mock;

    public MockScorecardJob(MockInterviewService mock) {
        this.mock = mock;
    }

    @Scheduled(fixedDelayString = "${app.mock.scorecard-interval:PT5M}", initialDelayString = "PT70S")
    public void run() {
        mock.runScorecardJob(OffsetDateTime.now());
    }
}
