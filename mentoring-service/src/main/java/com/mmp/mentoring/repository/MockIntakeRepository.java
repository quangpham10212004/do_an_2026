package com.mmp.mentoring.repository;

import com.mmp.mentoring.entity.MockIntake;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface MockIntakeRepository extends JpaRepository<MockIntake, UUID> {
}
