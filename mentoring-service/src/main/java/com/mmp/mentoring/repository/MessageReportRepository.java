package com.mmp.mentoring.repository;

import com.mmp.mentoring.entity.MessageReport;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/** US-33 (PRD-MSG-4) — hồ sơ kiểm duyệt tin nhắn. */
public interface MessageReportRepository extends JpaRepository<MessageReport, UUID> {

    List<MessageReport> findByStatusOrderByCreatedAtAsc(MessageReport.Status status);

    List<MessageReport> findAllByOrderByCreatedAtDesc();

    boolean existsByMessageIdAndReporterIdAndStatus(UUID messageId, UUID reporterId, MessageReport.Status status);
}
