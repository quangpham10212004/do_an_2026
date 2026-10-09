package com.mmp.auth.repository;

import com.mmp.auth.entity.NotificationPreferences;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface NotificationPreferencesRepository extends JpaRepository<NotificationPreferences, UUID> {
}
