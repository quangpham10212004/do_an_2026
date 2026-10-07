package com.mmp.mentoring.repository;

import com.mmp.mentoring.entity.MentorStrike;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface MentorStrikeRepository extends JpaRepository<MentorStrike, UUID> {

    long countByMentorIdAndCreatedAtAfter(UUID mentorId, OffsetDateTime after);

    boolean existsBySessionIdAndReason(UUID sessionId, MentorStrike.Reason reason);

    List<MentorStrike> findByMentorIdOrderByCreatedAtDesc(UUID mentorId);
}
