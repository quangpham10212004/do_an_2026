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

    java.util.Optional<Review> findBySessionId(UUID sessionId);

    /** US-41 (PRD-REV-5) — [tổng điểm, số đánh giá] của mentor. */
    @Query("SELECT COALESCE(SUM(r.rating), 0), COUNT(r) FROM Review r WHERE r.mentorId = :mentorId")
    List<Object[]> sumAndCount(@Param("mentorId") UUID mentorId);

    /** US-41 — điểm trung bình của toàn nền tảng (prior của trung bình Bayes); null khi chưa có đánh giá. */
    @Query("SELECT AVG(r.rating) FROM Review r")
    Double platformMean();

    @Query("SELECT DISTINCT r.mentorId FROM Review r")
    List<UUID> findReviewedMentorIds();
}
