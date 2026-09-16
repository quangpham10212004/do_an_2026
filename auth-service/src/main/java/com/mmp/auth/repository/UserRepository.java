package com.mmp.auth.repository;

import com.mmp.auth.entity.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);

    Optional<User> findByEmailVerificationToken(String token);

    @Query("""
            SELECT u FROM User u
            WHERE (:role IS NULL OR u.role = :role)
              AND (:q IS NULL OR LOWER(u.email) LIKE LOWER(CONCAT('%', CAST(:q AS string), '%'))
                   OR LOWER(COALESCE(u.fullName, '')) LIKE LOWER(CONCAT('%', CAST(:q AS string), '%')))
            ORDER BY u.createdAt DESC
            """)
    Page<User> search(@Param("role") User.Role role, @Param("q") String q, Pageable pageable);
}
