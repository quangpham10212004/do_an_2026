package com.mmp.mentoring.repository;

import com.mmp.mentoring.entity.Dispute;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DisputeRepository extends JpaRepository<Dispute, UUID> {

    List<Dispute> findBySessionIdOrderByCreatedAtDesc(UUID sessionId);

    List<Dispute> findBySessionIdInOrderByCreatedAtDesc(Collection<UUID> sessionIds);

    boolean existsBySessionIdAndStatusIn(UUID sessionId, Collection<Dispute.Status> statuses);

    boolean existsBySessionId(UUID sessionId);

    List<Dispute> findByStatusInOrderByCreatedAtAsc(Collection<Dispute.Status> statuses);

    List<Dispute> findAllByOrderByCreatedAtDesc();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT d FROM Dispute d WHERE d.id = :id")
    Optional<Dispute> findForUpdate(@Param("id") UUID id);
}
