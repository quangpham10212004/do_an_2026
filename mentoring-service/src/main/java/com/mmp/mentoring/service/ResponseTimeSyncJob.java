package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.repository.MentoringRequestRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

/**
 * US-35 — đồng bộ trung vị thời gian phản hồi yêu cầu của mentor sang profile-service
 * (PUT /internal/mentor/{id}/response-time), nơi matching-service đọc để tính responsiveness.
 * Mỗi lượt chỉ tính lại mentor có yêu cầu vừa được trả lời / hết hạn kể từ mốc lượt trước; lượt đầu sau khi khởi
 * động tính lại mọi mentor (tự bù dữ liệu cũ và lần đồng bộ lỗi). Lỗi gọi profile-service chỉ ghi log — lượt sau
 * vẫn có thể thử lại vì mốc chỉ tiến khi đồng bộ hết.
 */
@Component
public class ResponseTimeSyncJob {

    private static final Logger log = LoggerFactory.getLogger(ResponseTimeSyncJob.class);

    private final MentoringRequestRepository requestRepo;
    private final ProfileClient profileClient;
    /** null = chưa chạy lượt nào → tính lại tất cả. */
    private volatile OffsetDateTime watermark;

    public ResponseTimeSyncJob(MentoringRequestRepository requestRepo, ProfileClient profileClient) {
        this.requestRepo = requestRepo;
        this.profileClient = profileClient;
    }

    @Scheduled(fixedDelayString = "${app.response-time.interval:PT5M}", initialDelayString = "PT45S")
    public void scheduled() {
        run();
    }

    /** Trả về số mentor đã đồng bộ. */
    public synchronized int run() {
        OffsetDateTime started = OffsetDateTime.now();
        OffsetDateTime since = watermark == null ? OffsetDateTime.parse("1970-01-01T00:00:00Z") : watermark;
        List<UUID> mentors = requestRepo.findMentorsWithResponsesSince(since).stream().map(UUID::fromString).toList();
        boolean allOk = true;
        for (UUID mentorId : mentors) {
            List<ResponseTimeRules.Outcome> sample = requestRepo
                    .findResponseOutcomes(mentorId, started.minus(ResponseTimeRules.WINDOW), ResponseTimeRules.SAMPLE)
                    .stream().map(ResponseTimeSyncJob::outcome).toList();
            BigDecimal median = ResponseTimeRules.median(sample);
            allOk &= profileClient.updateResponseTime(mentorId, median, sample.size());
        }
        if (allOk) watermark = started;
        if (!mentors.isEmpty()) log.info("Synced response time of {} mentors", mentors.size());
        return mentors.size();
    }

    private static ResponseTimeRules.Outcome outcome(Object[] row) {
        return new ResponseTimeRules.Outcome(odt(row[0]), odt(row[1]), "EXPIRED".equals(row[2]));
    }

    private static OffsetDateTime odt(Object v) {
        if (v == null) return null;
        if (v instanceof OffsetDateTime o) return o;
        if (v instanceof Instant i) return i.atOffset(ZoneOffset.UTC);
        if (v instanceof Timestamp t) return t.toInstant().atOffset(ZoneOffset.UTC);
        throw new IllegalStateException("Unexpected timestamp type " + v.getClass());
    }
}
