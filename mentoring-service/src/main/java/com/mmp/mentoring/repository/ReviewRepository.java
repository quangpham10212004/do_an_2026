package com.mmp.mentoring.repository;

import com.mmp.mentoring.entity.Review;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface ReviewRepository extends JpaRepository<Review, UUID> {

    boolean existsBySessionId(UUID sessionId);

    List<Review> findBySessionIdIn(Collection<UUID> sessionIds);

    List<Review> findByMentorIdOrderByCreatedAtDesc(UUID mentorId);

    @Query("SELECT COALESCE(AVG(r.rating), 0) FROM Review r WHERE r.mentorId = :mentorId")
    double averageRating(@Param("mentorId") UUID mentorId);

    long countByMentorId(UUID mentorId);
}
