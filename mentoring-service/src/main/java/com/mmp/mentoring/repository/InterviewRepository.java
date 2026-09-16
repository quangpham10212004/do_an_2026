package com.mmp.mentoring.repository;

import com.mmp.mentoring.entity.Interview;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface InterviewRepository extends JpaRepository<Interview, UUID> {

    Optional<Interview> findFirstByMentorIdOrderByCreatedAtDesc(UUID mentorId);

    List<Interview> findByStatusOrderByCompletedAtAsc(Interview.Status status);

    List<Interview> findAllByOrderByCreatedAtDesc();

    long countByStatus(Interview.Status status);
}
