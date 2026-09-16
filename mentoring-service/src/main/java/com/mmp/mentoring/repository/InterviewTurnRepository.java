package com.mmp.mentoring.repository;

import com.mmp.mentoring.entity.InterviewTurn;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface InterviewTurnRepository extends JpaRepository<InterviewTurn, UUID> {

    List<InterviewTurn> findByInterviewIdOrderByTurnNoAsc(UUID interviewId);
}
