package com.mmp.learning.repository;

import com.mmp.learning.entity.Course;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface CourseRepository extends JpaRepository<Course, UUID> {

    @Query("""
            SELECT c FROM Course c
            WHERE (:domain IS NULL OR LOWER(c.domain) = LOWER(CAST(:domain AS string)))
              AND (:q IS NULL OR LOWER(c.title) LIKE LOWER(CONCAT('%', CAST(:q AS string), '%'))
                   OR LOWER(COALESCE(c.description, '')) LIKE LOWER(CONCAT('%', CAST(:q AS string), '%')))
            ORDER BY c.createdAt ASC
            """)
    List<Course> search(@Param("domain") String domain, @Param("q") String q);
}
