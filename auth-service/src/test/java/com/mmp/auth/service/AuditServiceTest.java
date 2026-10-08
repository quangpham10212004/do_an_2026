package com.mmp.auth.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.mmp.auth.dto.AuditDtos.AuditFilter;
import com.mmp.auth.dto.AuditDtos.AuditRequest;
import com.mmp.auth.entity.User;
import com.mmp.auth.exception.ApiException;
import com.mmp.auth.repository.RefreshTokenRepository;
import com.mmp.auth.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** US-30 — nhật ký kiểm toán: bộ lọc, mốc ngày, validate before/after, job lưu trữ, ghi hành động admin. */
class AuditServiceTest {

    private JdbcTemplate jdbc;
    private TransactionTemplate tx;
    private AuditService service;
    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        jdbc = mock(JdbcTemplate.class);
        tx = mock(TransactionTemplate.class);
        when(tx.execute(any())).thenAnswer(inv -> ((TransactionCallback<?>) inv.getArgument(0)).doInTransaction(null));
        service = new AuditService(jdbc, mapper, tx);
    }

    @Test
    void emptyFilterHasNoWhereClause() {
        AuditService.Where w = AuditService.where(new AuditFilter(null, " ", null, null, null, null));
        assertThat(w.sql()).isEmpty();
        assertThat(w.params()).isEmpty();
    }

    @Test
    void filtersAreCombinedWithAndInFixedOrder() {
        UUID actor = UUID.randomUUID();
        OffsetDateTime from = OffsetDateTime.parse("2026-11-01T00:00:00+07:00");
        AuditService.Where w = AuditService.where(
                new AuditFilter(actor, "interview_approved", "interview", " abc ", from, null));
        assertThat(w.sql()).isEqualTo(" WHERE a.actor_id = ? AND a.action = ? AND a.target_type = ? AND a.target_id = ?"
                + " AND a.created_at >= ?");
        assertThat(w.params()).containsExactly(actor, "INTERVIEW_APPROVED", "INTERVIEW", "abc",
                Timestamp.from(from.toInstant()));
    }

    @Test
    void dateBoundsUseVietnamTimeAndIncludeTheWholeEndDay() {
        assertThat(AuditService.parseBound("2026-11-10", false))
                .isEqualTo(OffsetDateTime.parse("2026-11-10T00:00:00+07:00"));
        assertThat(AuditService.parseBound("2026-11-10", true))
                .isEqualTo(OffsetDateTime.parse("2026-11-11T00:00:00+07:00"));
        assertThat(AuditService.parseBound("2026-11-10T08:30:00Z", true))
                .isEqualTo(OffsetDateTime.parse("2026-11-10T08:30:00Z"));
        assertThat(AuditService.parseBound(null, false)).isNull();
        assertThatThrownBy(() -> AuditService.parseBound("10/11/2026", false))
                .isInstanceOf(ApiException.class).hasFieldOrPropertyWithValue("code", "INVALID_DATE");
    }

    @Test
    void recordStoresBeforeAndAfterAsJson() {
        var before = JsonNodeFactory.instance.objectNode().put("status", "PENDING_REVIEW");
        service.record(new AuditRequest(null, "SYSTEM", "EARNING_RELEASED", "EARNING", "e1", before, null));
        verify(jdbc).update(contains("INSERT INTO audit_log"), isNull(), eq("SYSTEM"), eq("EARNING_RELEASED"),
                eq("EARNING"), eq("e1"), eq("{\"status\":\"PENDING_REVIEW\"}"), isNull());
    }

    @Test
    void beforeAndAfterMustBeObjects() {
        var array = JsonNodeFactory.instance.arrayNode().add(1);
        assertThatThrownBy(() -> service.record(new AuditRequest(null, "ADMIN", "X", "T", "1", array, null)))
                .isInstanceOf(ApiException.class).hasFieldOrPropertyWithValue("code", "VALIDATION_ERROR");
        verifyNoInteractions(jdbc);
    }

    @Test
    void purgeEnablesTriggerBypassInTheSameTransactionThenDeletes() {
        when(jdbc.update(startsWith("DELETE FROM audit_log"), any(Object[].class))).thenReturn(3);
        OffsetDateTime cutoff = OffsetDateTime.parse("2024-11-10T00:00:00Z");
        assertThat(service.purgeOlderThan(cutoff)).isEqualTo(3);
        InOrder order = inOrder(tx, jdbc);
        order.verify(tx).execute(any());
        order.verify(jdbc).queryForObject(contains("set_config('mmp.audit_retention_purge', 'on', true)"), eq(String.class));
        order.verify(jdbc).update(startsWith("DELETE FROM audit_log WHERE created_at < ?"), any(Object[].class));
    }

    @Test
    void retentionJobDeletesRowsOlderThanTwoYears() {
        AuditService audit = mock(AuditService.class);
        Clock clock = Clock.fixed(Instant.parse("2026-11-10T00:00:00Z"), ZoneOffset.UTC);
        new AuditRetentionJob(audit, Duration.ofDays(730), clock).purge();
        verify(audit).purgeOlderThan(OffsetDateTime.parse("2024-11-10T00:00:00Z"));
    }

    @Test
    void lockingAUserIsAuditLogged() {
        UserRepository users = mock(UserRepository.class);
        AuditService audit = mock(AuditService.class);
        User u = new User();
        u.setId(UUID.randomUUID());
        u.setEmail("mentee@example.com");
        u.setRole(User.Role.MENTEE);
        when(users.findById(u.getId())).thenReturn(Optional.of(u));
        UserAdminService admin = new UserAdminService(users, mock(RefreshTokenRepository.class), audit);
        UUID adminId = UUID.randomUUID();

        admin.updateStatus(adminId, u.getId(), "LOCKED");
        verify(audit).recordAdmin(adminId, "USER_LOCKED", "USER", u.getId().toString(),
                Map.of("status", "ACTIVE", "email", "mentee@example.com"),
                Map.of("status", "LOCKED", "email", "mentee@example.com"));

        admin.updateStatus(adminId, u.getId(), "LOCKED"); // không đổi trạng thái => không ghi thêm
        admin.updateStatus(adminId, u.getId(), "ACTIVE");
        ArgumentCaptor<String> action = ArgumentCaptor.forClass(String.class);
        verify(audit, times(2)).recordAdmin(eq(adminId), action.capture(), eq("USER"), anyString(), anyMap(), anyMap());
        assertThat(action.getAllValues()).containsExactly("USER_LOCKED", "USER_UNLOCKED");
    }
}
