package com.mmp.profile.repository;

import com.mmp.profile.entity.MentorAvailabilityException;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface MentorAvailabilityExceptionRepository extends JpaRepository<MentorAvailabilityException, UUID> {

    /** Ngoại lệ trong khoảng [from, to] (cả hai đầu), sắp theo ngày rồi giờ bắt đầu (nghỉ cả ngày lên trước). */
    List<MentorAvailabilityException> findByMentorIdAndDateBetweenOrderByDateAscStartTimeAsc(
            UUID mentorId, LocalDate from, LocalDate to);

    List<MentorAvailabilityException> findByMentorIdAndDate(UUID mentorId, LocalDate date);

    long countByMentorIdAndDateGreaterThanEqual(UUID mentorId, LocalDate from);
}
