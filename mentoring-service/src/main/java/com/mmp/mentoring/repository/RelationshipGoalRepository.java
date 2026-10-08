package com.mmp.mentoring.repository;

import com.mmp.mentoring.entity.RelationshipGoal;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

/** US-28 — mục tiêu của không gian mentoring. */
public interface RelationshipGoalRepository extends JpaRepository<RelationshipGoal, UUID> {

    List<RelationshipGoal> findByRelationshipIdOrderByPositionAscCreatedAtAsc(UUID relationshipId);

    /**
     * Khoá advisory theo quan hệ trong transaction: tạo mục tiêu đầu tiên, thêm (tối đa 5), xoá (tối thiểu 1)
     * và sắp xếp lại không bị hai người tham gia chen ngang nhau.
     */
    @Query(value = "SELECT pg_advisory_xact_lock(hashtext('relationship-goals:' || CAST(:relationshipId AS text)))", nativeQuery = true)
    Object lockRelationship(@Param("relationshipId") UUID relationshipId);
}
