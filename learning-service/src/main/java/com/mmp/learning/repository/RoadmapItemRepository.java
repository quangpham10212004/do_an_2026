package com.mmp.learning.repository;

import com.mmp.learning.entity.RoadmapItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface RoadmapItemRepository extends JpaRepository<RoadmapItem, UUID> {

    List<RoadmapItem> findByRoadmapIdOrderByOrderIndexAsc(UUID roadmapId);
}
