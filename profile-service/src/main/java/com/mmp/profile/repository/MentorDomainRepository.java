package com.mmp.profile.repository;

import com.mmp.profile.entity.MentorDomain;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface MentorDomainRepository extends JpaRepository<MentorDomain, UUID> {
    List<MentorDomain> findByMentorIdOrderByAddedAtAscDomainAsc(UUID mentorId);
}
