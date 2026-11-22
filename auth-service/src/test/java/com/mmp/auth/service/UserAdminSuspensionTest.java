package com.mmp.auth.service;

import com.mmp.auth.client.MentoringClient;
import com.mmp.auth.entity.User;
import com.mmp.auth.repository.RefreshTokenRepository;
import com.mmp.auth.repository.UserRepository;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class UserAdminSuspensionTest {
    private final UserRepository users = mock(UserRepository.class);
    private final RefreshTokenRepository tokens = mock(RefreshTokenRepository.class);
    private final AuditService audit = mock(AuditService.class);
    private final MentoringClient mentoring = mock(MentoringClient.class);
    private final UserAdminService service = new UserAdminService(users, tokens, audit, mentoring);

    @Test
    void timedSuspensionPersistsExpiryAndReopensAccount() {
        UUID admin = UUID.randomUUID();
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setRole(User.Role.MENTEE);
        user.setEmail("mentee@example.test");
        when(users.lockById(user.getId())).thenReturn(Optional.of(user));

        OffsetDateTime start = OffsetDateTime.now();
        service.suspend(admin, user.getId(), "7d", "Repeated policy violation");
        assertEquals(User.Status.LOCKED, user.getStatus());
        assertFalse(user.getSuspendedUntil().isBefore(start.plusDays(7)));
        verify(tokens).revokeAllForUser(user.getId());
        verify(mentoring).accountLockChanged(user.getId(), true, admin, "Repeated policy violation");

        user.setSuspendedUntil(start.minusSeconds(1));
        when(users.lockExpiredSuspensions(any(), any())).thenReturn(List.of(user));
        service.releaseExpiredSuspensions();

        assertEquals(User.Status.ACTIVE, user.getStatus());
        assertNull(user.getSuspendedUntil());
        verify(mentoring).accountLockChanged(user.getId(), false, null, "SUSPENSION_EXPIRED");
    }
}
