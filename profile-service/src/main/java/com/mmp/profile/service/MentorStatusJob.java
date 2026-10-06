package com.mmp.profile.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * US-08 — đưa mentor nghỉ phép đã hết hạn về ACCEPTING trong DB.
 *
 * Mọi đường đọc (API, /internal/mentor/{id}, matching-service) đã tự tính trạng thái hiệu lực nên
 * job này không quyết định tính đúng; nó chỉ để DB (và cột tương thích is_available) hội tụ.
 */
@Component
public class MentorStatusJob {

    private static final Logger log = LoggerFactory.getLogger(MentorStatusJob.class);

    private final ProfileService profileService;

    public MentorStatusJob(ProfileService profileService) {
        this.profileService = profileService;
    }

    @Scheduled(fixedDelayString = "${app.jobs.leave-return-interval:PT10M}", initialDelayString = "PT1M")
    public void returnExpiredLeaves() {
        try {
            int n = profileService.returnExpiredLeaves();
            if (n > 0) log.info("MentorStatusJob: {} mentor hết nghỉ phép, chuyển về ACCEPTING", n);
        } catch (Exception e) {
            log.warn("MentorStatusJob thất bại: {}", e.getMessage());
        }
    }
}
