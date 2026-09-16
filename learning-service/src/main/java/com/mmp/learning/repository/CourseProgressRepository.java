package com.mmp.learning.repository;

import com.mmp.learning.entity.CourseProgress;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface CourseProgressRepository extends JpaRepository<CourseProgress, CourseProgress.Key> {

    Optional<CourseProgress> findByCourseIdAndUserId(UUID courseId, UUID userId);
}
