package com.mmp.mentoring.service;

import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.SessionRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Bản chốt v2.0 §10 — buổi trải nghiệm 15 phút: phí cố định, mỗi cặp (mentee, mentor) một lần, mỗi mentee tối đa N buổi
 * chưa diễn ra. Lượt dùng được hoàn lại khi buổi bị huỷ mà mentee không mất tiền (huỷ ≥ 2 giờ, mentor từ chối / không xác
 * nhận / huỷ, quá hạn nạp ví) — chỉ buổi đã diễn ra hoặc huỷ muộn mới "tiêu" lượt.
 */
@Service
public class TrialService {

    private final JdbcTemplate jdbc;
    private final SessionRepository sessionRepo;
    private final BigDecimal fee;
    private final int maxOpen;

    public TrialService(JdbcTemplate jdbc, SessionRepository sessionRepo,
                        @Value("${app.trial.fee:30000}") BigDecimal fee,
                        @Value("${app.trial.max-open-per-mentee:3}") int maxOpen) {
        this.jdbc = jdbc;
        this.sessionRepo = sessionRepo;
        this.fee = fee;
        this.maxOpen = maxOpen;
    }

    public BigDecimal fee() {
        return fee;
    }

    /** Chặn đặt thêm khi mentee đã có đủ N buổi trải nghiệm chưa diễn ra. */
    public void requireBelowOpenLimit(UUID menteeId, OffsetDateTime now) {
        if (sessionRepo.countOpenTrials(menteeId, now) >= maxOpen) {
            throw ApiException.conflict("TRIAL_LIMIT", "Bạn đã có " + maxOpen + " buổi trải nghiệm chưa diễn ra");
        }
    }

    /** Giữ lượt trải nghiệm của cặp này; đã dùng → 409 TRIAL_ALREADY_USED. Gọi trong transaction tạo phiên. */
    public void claim(UUID menteeId, UUID mentorId, UUID sessionId) {
        int n = jdbc.update("INSERT INTO trial_uses (mentee_id, mentor_id, session_id) VALUES (?, ?, ?) ON CONFLICT DO NOTHING",
                menteeId, mentorId, sessionId);
        if (n == 0) {
            throw ApiException.conflict("TRIAL_ALREADY_USED", "Bạn đã dùng buổi trải nghiệm với mentor này");
        }
    }

    /** Hoàn lại lượt khi buổi không tính (huỷ sớm / mentor không xác nhận / hết hạn nạp ví). Idempotent. */
    public void restore(UUID sessionId) {
        if (sessionId != null) jdbc.update("DELETE FROM trial_uses WHERE session_id = ?", sessionId);
    }

    public boolean used(UUID menteeId, UUID mentorId) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM trial_uses WHERE mentee_id = ? AND mentor_id = ?", Integer.class, menteeId, mentorId);
        return n != null && n > 0;
    }
}
