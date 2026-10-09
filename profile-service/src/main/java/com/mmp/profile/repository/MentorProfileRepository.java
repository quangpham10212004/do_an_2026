package com.mmp.profile.repository;

import com.mmp.profile.entity.MentorProfile;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
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

    /** US-27 — danh sách mentor cho admin: tìm theo tên/lĩnh vực, lọc trạng thái (đã lưu) và xác thực. */
    @Query("""
            SELECT m FROM MentorProfile m
            WHERE (:status IS NULL OR m.status = :status)
              AND (:verification IS NULL OR m.verificationStatus = :verification)
              AND (:q IS NULL OR LOWER(m.displayName) LIKE LOWER(CONCAT('%', CAST(:q AS string), '%'))
                   OR LOWER(m.domain) LIKE LOWER(CONCAT('%', CAST(:q AS string), '%')))
            ORDER BY m.displayName ASC
            """)
    Page<MentorProfile> adminSearch(@Param("q") String q,
                                    @Param("status") MentorProfile.Status status,
                                    @Param("verification") MentorProfile.VerificationStatus verification,
                                    Pageable pageable);

    /**
     * US-08 — ON_LEAVE tự về ACCEPTING khi đã qua hết ngày on_leave_until theo múi giờ của mentor
     * (cùng quy tắc với MentorRules.effectiveStatus).
     */
    @Modifying
    @Query(value = """
            UPDATE mentor_profiles
               SET status = 'ACCEPTING', on_leave_until = NULL, status_reason = NULL,
                   status_changed_at = now(), updated_at = now()
             WHERE status = 'ON_LEAVE'
               AND on_leave_until < (now() AT TIME ZONE timezone)::date
            """, nativeQuery = true)
    int returnExpiredLeaves();
}
