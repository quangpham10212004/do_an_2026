package com.mmp.learning.repository;

import com.mmp.learning.entity.CourseMaterial;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface CourseMaterialRepository extends JpaRepository<CourseMaterial, UUID> {

    List<CourseMaterial> findByCourseIdOrderByOrderIndexAsc(UUID courseId);

    long countByCourseId(UUID courseId);
}
