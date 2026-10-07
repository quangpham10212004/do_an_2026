package com.mmp.mentoring.repository;

import com.mmp.mentoring.entity.PaymentOutbox;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface PaymentOutboxRepository extends JpaRepository<PaymentOutbox, UUID> {

    List<PaymentOutbox> findTop50BySentAtIsNullOrderByCreatedAtAsc();
}
