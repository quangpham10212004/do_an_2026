package com.mmp.mentoring.repository;

import com.mmp.mentoring.entity.LateCancellation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface LateCancellationRepository extends JpaRepository<LateCancellation, UUID> {

    List<LateCancellation> findByMenteeIdAndCreatedAtAfter(UUID menteeId, OffsetDateTime after);
}
