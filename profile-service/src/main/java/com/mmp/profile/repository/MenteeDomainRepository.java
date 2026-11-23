package com.mmp.profile.repository;

import com.mmp.profile.entity.MenteeDomain;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface MenteeDomainRepository extends JpaRepository<MenteeDomain, UUID> {
    List<MenteeDomain> findByMenteeIdOrderByAddedAt(UUID menteeId);

    void deleteByMenteeId(UUID menteeId);
}
