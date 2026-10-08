package com.mmp.auth.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;

/**
 * US-30 (PRD-ADM-5) — giữ nhật ký kiểm toán {@code app.audit.retention} (mặc định 2 năm = P730D), chạy mỗi ngày
 * lúc 03:30 giờ Việt Nam ({@code app.audit.retention-cron}). Đây là đường DUY NHẤT xoá được dòng audit_log
 * (trigger DB chặn mọi xoá khác và mọi xoá dòng mới hơn 1 năm).
 */
@Component
public class AuditRetentionJob {

    private static final Logger log = LoggerFactory.getLogger(AuditRetentionJob.class);

    private final AuditService auditService;
    private final Duration retention;
    private final Clock clock;

    @org.springframework.beans.factory.annotation.Autowired
    public AuditRetentionJob(AuditService auditService, @Value("${app.audit.retention:P730D}") Duration retention) {
        this(auditService, retention, Clock.systemUTC());
    }

    AuditRetentionJob(AuditService auditService, Duration retention, Clock clock) {
        this.auditService = auditService;
        this.retention = retention;
        this.clock = clock;
    }

    @Scheduled(cron = "${app.audit.retention-cron:0 30 3 * * *}", zone = "Asia/Ho_Chi_Minh")
    public int purge() {
        int deleted = auditService.purgeOlderThan(AuditService.cutoff(clock, retention));
        if (deleted > 0) {
            log.info("Audit retention: deleted {} rows older than {}", deleted, retention);
        }
        return deleted;
    }
}
