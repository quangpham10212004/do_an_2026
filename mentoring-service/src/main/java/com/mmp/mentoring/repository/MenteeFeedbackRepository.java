package com.mmp.mentoring.repository;

import com.mmp.mentoring.entity.MenteeFeedback;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

/** US-41 (PRD-REV-4) — nhận xét riêng của mentor về mentee. */
public interface MenteeFeedbackRepository extends JpaRepository<MenteeFeedback, UUID> {

    /** [số nhận xét, TB chuẩn bị, TB tham gia] của một mentee. */
    @Query("SELECT COUNT(f), COALESCE(AVG(f.preparation), 0), COALESCE(AVG(f.engagement), 0) FROM MenteeFeedback f WHERE f.menteeId = :menteeId")
    java.util.List<Object[]> aggregate(@Param("menteeId") UUID menteeId);
}
