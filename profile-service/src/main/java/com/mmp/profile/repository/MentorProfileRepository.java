package com.mmp.profile.repository;

import com.mmp.profile.entity.MentorProfile;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface MentorProfileRepository extends JpaRepository<MentorProfile, UUID> {

    @Query("""
            SELECT m FROM MentorProfile m
            WHERE (:domain IS NULL OR LOWER(m.domain) = LOWER(CAST(:domain AS string)))
              AND (:status IS NULL OR m.verificationStatus = :status)
              AND (:q IS NULL OR LOWER(m.displayName) LIKE LOWER(CONCAT('%', CAST(:q AS string), '%'))
                   OR LOWER(COALESCE(m.bio, '')) LIKE LOWER(CONCAT('%', CAST(:q AS string), '%')))
            ORDER BY m.rating DESC, m.yearsExperience DESC
            """)
    Page<MentorProfile> search(@Param("domain") String domain,
                               @Param("status") MentorProfile.VerificationStatus status,
                               @Param("q") String q,
                               Pageable pageable);
}
