package com.mmp.auth.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mmp.auth.dto.AuditDtos.AuditEntry;
import com.mmp.auth.dto.AuditDtos.AuditFilter;
import com.mmp.auth.dto.AuditDtos.AuditRequest;
import com.mmp.auth.dto.AuthDtos.PageResponse;
import com.mmp.auth.exception.ApiException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * US-30 (PRD-ADM-5) — nhật ký kiểm toán, append-only.
 *
 * <ul>
 *   <li>{@link #record}: ghi một dòng (từ POST /internal/audit của các service khác, hoặc trực tiếp từ hành động admin
 *       của auth-service — khi đó chạy chung transaction với thay đổi nghiệp vụ).</li>
 *   <li>{@link #search}: lọc theo actor, action, targetType, targetId, khoảng thời gian; phân trang, mới nhất trước.</li>
 *   <li>{@link #purgeOlderThan}: chỉ job lưu trữ dùng; trigger DB chặn mọi UPDATE/DELETE khác (V3__audit_log.sql).</li>
 * </ul>
 */
@Service
public class AuditService {

    public static final ZoneId ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    static final int MAX_PAGE_SIZE = 100;

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final TransactionTemplate tx;

    public AuditService(JdbcTemplate jdbc, ObjectMapper mapper, TransactionTemplate tx) {
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.tx = tx;
    }

    public void record(AuditRequest r) {
        requireObjectOrNull("before", r.before());
        requireObjectOrNull("after", r.after());
        jdbc.update("""
                INSERT INTO audit_log (actor_id, actor_role, action, target_type, target_id, before, after)
                VALUES (?, ?, ?, ?, ?, CAST(? AS jsonb), CAST(? AS jsonb))""",
                r.actorId(), r.actorRole(), r.action(), r.targetType().trim(), r.targetId().trim(),
                json(r.before()), json(r.after()));
    }

    /** Ghi hành động admin của chính auth-service (khoá / mở khoá tài khoản...). */
    public void recordAdmin(UUID adminId, String action, String targetType, String targetId,
                            Map<String, ?> before, Map<String, ?> after) {
        record(new AuditRequest(adminId, "ADMIN", action, targetType, targetId,
                before == null ? null : mapper.valueToTree(before), after == null ? null : mapper.valueToTree(after)));
    }

    public PageResponse<AuditEntry> search(AuditFilter filter, int page, int size) {
        int p = Math.max(page, 0);
        int s = Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
        Where where = where(filter);
        Long total = jdbc.queryForObject("SELECT COUNT(*) FROM audit_log a" + where.sql(), Long.class,
                where.params().toArray());
        List<Object> params = new ArrayList<>(where.params());
        params.add(s);
        params.add((long) p * s);
        List<AuditEntry> items = jdbc.query("""
                SELECT a.id, a.actor_id, u.email AS actor_email, a.actor_role, a.action, a.target_type, a.target_id,
                       a.before::text AS before_json, a.after::text AS after_json, a.created_at
                  FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id""" + where.sql()
                + " ORDER BY a.created_at DESC, a.id LIMIT ? OFFSET ?", rowMapper(), params.toArray());
        long n = total == null ? 0 : total;
        return new PageResponse<>(items, p, s, n, (int) ((n + s - 1) / s));
    }

    /** Xoá các dòng cũ hơn {@code cutoff}; bật cờ phiên cho trigger trong CÙNG transaction. */
    public int purgeOlderThan(OffsetDateTime cutoff) {
        Integer deleted = tx.execute(status -> {
            jdbc.queryForObject("SELECT set_config('mmp.audit_retention_purge', 'on', true)", String.class);
            return jdbc.update("DELETE FROM audit_log WHERE created_at < ?", Timestamp.from(cutoff.toInstant()));
        });
        return deleted == null ? 0 : deleted;
    }

    static OffsetDateTime cutoff(Clock clock, Duration retention) {
        return OffsetDateTime.now(clock).minus(retention);
    }

    record Where(String sql, List<Object> params) {
    }

    /** Mệnh đề WHERE + tham số (hàm thuần, unit test được). */
    static Where where(AuditFilter f) {
        StringBuilder sql = new StringBuilder();
        List<Object> params = new ArrayList<>();
        if (f != null) {
            add(sql, params, "a.actor_id = ?", f.actorId());
            add(sql, params, "a.action = ?", blankToNull(f.action(), true));
            add(sql, params, "a.target_type = ?", blankToNull(f.targetType(), true));
            add(sql, params, "a.target_id = ?", blankToNull(f.targetId(), false));
            add(sql, params, "a.created_at >= ?", f.from() == null ? null : Timestamp.from(f.from().toInstant()));
            add(sql, params, "a.created_at < ?", f.to() == null ? null : Timestamp.from(f.to().toInstant()));
        }
        return new Where(sql.toString(), params);
    }

    /**
     * Mốc thời gian của bộ lọc: ISO date-time (2026-11-10T08:00:00+07:00) hoặc ngày (2026-11-10, theo giờ Việt Nam).
     * Với `to` là ngày thì lấy hết ngày đó (mốc loại trừ = 00:00 ngày hôm sau).
     */
    public static OffsetDateTime parseBound(String value, boolean upper) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String v = value.trim();
        try {
            if (v.length() == 10) {
                LocalDate d = LocalDate.parse(v);
                return (upper ? d.plusDays(1) : d).atStartOfDay(ZONE).toOffsetDateTime();
            }
            return OffsetDateTime.parse(v);
        } catch (DateTimeParseException e) {
            throw ApiException.badRequest("INVALID_DATE", "Ngày không hợp lệ: " + v + " (dùng yyyy-MM-dd hoặc ISO 8601)");
        }
    }

    private static void add(StringBuilder sql, List<Object> params, String clause, Object value) {
        if (value == null) {
            return;
        }
        sql.append(sql.isEmpty() ? " WHERE " : " AND ").append(clause);
        params.add(value);
    }

    private static String blankToNull(String s, boolean upper) {
        if (s == null || s.isBlank()) {
            return null;
        }
        return upper ? s.trim().toUpperCase() : s.trim();
    }

    private static void requireObjectOrNull(String field, JsonNode node) {
        if (node != null && !node.isNull() && !node.isObject()) {
            throw ApiException.badRequest("VALIDATION_ERROR", field + ": phải là object JSON hoặc null");
        }
    }

    private String json(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        try {
            return mapper.writeValueAsString(node);
        } catch (JsonProcessingException e) {
            throw ApiException.badRequest("VALIDATION_ERROR", "before/after không phải JSON hợp lệ");
        }
    }

    private RowMapper<AuditEntry> rowMapper() {
        return (rs, i) -> new AuditEntry(
                rs.getObject("id", UUID.class), rs.getObject("actor_id", UUID.class), rs.getString("actor_email"),
                rs.getString("actor_role"), rs.getString("action"), rs.getString("target_type"),
                rs.getString("target_id"), readJson(rs.getString("before_json")), readJson(rs.getString("after_json")),
                rs.getTimestamp("created_at").toInstant().atOffset(ZoneOffset.UTC));
    }

    private JsonNode readJson(String s) {
        if (s == null) {
            return null;
        }
        try {
            return mapper.readTree(s);
        } catch (JsonProcessingException e) {
            return null;
        }
    }
}
