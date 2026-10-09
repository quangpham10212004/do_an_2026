package com.mmp.profile.repository;

import com.mmp.profile.entity.ProfileAvatar;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** US-37 — ảnh đại diện. Các truy vấn "mốc cập nhật" không tải cột ảnh. */
public interface ProfileAvatarRepository extends JpaRepository<ProfileAvatar, UUID> {

    @Query("SELECT a.updatedAt FROM ProfileAvatar a WHERE a.userId = :userId")
    Optional<OffsetDateTime> findUpdatedAt(@Param("userId") UUID userId);

    /** [userId, updatedAt] cho danh sách thẻ mentor. */
    @Query("SELECT a.userId, a.updatedAt FROM ProfileAvatar a WHERE a.userId IN :ids")
    List<Object[]> findUpdatedAtIn(@Param("ids") Collection<UUID> ids);
}
