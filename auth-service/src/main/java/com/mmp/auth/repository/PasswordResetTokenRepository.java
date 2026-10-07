package com.mmp.auth.repository;

import com.mmp.auth.entity.PasswordResetToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, UUID> {

    Optional<PasswordResetToken> findByTokenHash(String tokenHash);

    /**
     * Đánh dấu đã dùng NGUYÊN TỬ: chỉ thành công (trả 1) khi token chưa dùng và còn hạn —
     * hai request đồng thời với cùng token thì chỉ một request đổi được mật khẩu.
     */
    @Modifying
    @Query("UPDATE PasswordResetToken t SET t.usedAt = :now "
            + "WHERE t.id = :id AND t.usedAt IS NULL AND t.expiresAt > :now")
    int consume(@Param("id") UUID id, @Param("now") OffsetDateTime now);

    /** Cấp token mới thì vô hiệu các token cũ chưa dùng của user (chỉ link mới nhất còn tác dụng). */
    @Modifying
    @Query("UPDATE PasswordResetToken t SET t.usedAt = :now WHERE t.userId = :userId AND t.usedAt IS NULL")
    int invalidateAllForUser(@Param("userId") UUID userId, @Param("now") OffsetDateTime now);
}
