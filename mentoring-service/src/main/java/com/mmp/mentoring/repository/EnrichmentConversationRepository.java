package com.mmp.mentoring.repository;

import com.mmp.mentoring.entity.EnrichmentConversation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface EnrichmentConversationRepository extends JpaRepository<EnrichmentConversation, UUID> {

    Optional<EnrichmentConversation> findFirstByMenteeIdOrderByCreatedAtDesc(UUID menteeId);

    List<EnrichmentConversation> findByStatusAndProfileSyncedFalse(EnrichmentConversation.Status status);
}
