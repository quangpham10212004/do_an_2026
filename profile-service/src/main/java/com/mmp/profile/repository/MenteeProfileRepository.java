package com.mmp.profile.repository;

import com.mmp.profile.entity.MenteeProfile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface MenteeProfileRepository extends JpaRepository<MenteeProfile, UUID> {
}
