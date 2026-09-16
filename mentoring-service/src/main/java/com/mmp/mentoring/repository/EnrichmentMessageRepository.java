package com.mmp.mentoring.repository;

import com.mmp.mentoring.entity.EnrichmentMessage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface EnrichmentMessageRepository extends JpaRepository<EnrichmentMessage, UUID> {

    List<EnrichmentMessage> findByConversationIdOrderByTurnNoAsc(UUID conversationId);
}
