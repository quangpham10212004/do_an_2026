package com.mmp.mentoring.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Tác vụ nền mỗi phút cho gói buổi: huỷ gói chưa thanh toán quá hạn giữ chỗ, đóng gói hết hạn sử dụng
 * (hoàn tiền buổi chưa dùng) và thử lại các khoản hoàn tiền chưa thực hiện được.
 */
@Component
public class PackageScheduler {

    private static final Logger log = LoggerFactory.getLogger(PackageScheduler.class);

    private final PackageService packageService;

    public PackageScheduler(PackageService packageService) {
        this.packageService = packageService;
    }

    @Scheduled(fixedDelay = 60_000, initialDelay = 50_000)
    public void run() {
        safely("expireUnpaid", packageService::expireUnpaid);
        safely("expireDue", packageService::expireDue);
        safely("retryRefunds", packageService::retryRefunds);
    }

    private static void safely(String name, Runnable task) {
        try {
            task.run();
        } catch (Exception e) {
            log.warn("Package job {} failed: {}", name, e.getMessage());
        }
    }
}
