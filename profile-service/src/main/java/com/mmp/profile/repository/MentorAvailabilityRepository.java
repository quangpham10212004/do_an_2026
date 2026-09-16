package com.mmp.profile.repository;

import com.mmp.profile.entity.MentorAvailability;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface MentorAvailabilityRepository extends JpaRepository<MentorAvailability, UUID> {

    List<MentorAvailability> findByMentorIdOrderByDayOfWeekAscStartTimeAsc(UUID mentorId);

    @Modifying
    @Query("DELETE FROM MentorAvailability a WHERE a.mentorId = :mentorId")
    void deleteByMentorId(@Param("mentorId") UUID mentorId);
}
