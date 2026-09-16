package com.mmp.profile.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Định kỳ thử sinh lại embedding cho các profile bị lỗi lúc lưu (matching-service tạm thời down). */
@Component
public class EmbeddingRetryJob {

    private static final Logger log = LoggerFactory.getLogger(EmbeddingRetryJob.class);

    private final ProfileService profileService;

    public EmbeddingRetryJob(ProfileService profileService) {
        this.profileService = profileService;
    }

    @Scheduled(fixedDelayString = "${app.embedding.retry-interval}", initialDelayString = "PT30S")
    public void retry() {
        try {
            profileService.retryPendingEmbeddings(50);
        } catch (Exception e) {
            log.warn("Embedding retry job failed: {}", e.getMessage());
        }
    }
}
