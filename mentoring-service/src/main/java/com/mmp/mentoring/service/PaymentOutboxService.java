package com.mmp.mentoring.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mmp.mentoring.client.PaymentClient;
import com.mmp.mentoring.entity.PaymentOutbox;
import com.mmp.mentoring.repository.PaymentOutboxRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.Map;
import java.util.UUID;

/**
 * Outbox cho lời gọi payment-service không được mất. {@link #enqueueReward} phải chạy trong transaction của
 * thay đổi nghiệp vụ; {@link #flush} (job mỗi phút) gửi từng bản ghi, lỗi thì giữ lại để lần sau gửi tiếp.
 */
@Service
public class PaymentOutboxService {

    private static final Logger log = LoggerFactory.getLogger(PaymentOutboxService.class);
    public static final String MENTOR_CANCEL_APOLOGY = "MENTOR_CANCEL_APOLOGY";

    private final PaymentOutboxRepository repo;
    private final PaymentClient paymentClient;
    private final TransactionTemplate tx;
    private final ObjectMapper mapper = new ObjectMapper();

    public PaymentOutboxService(PaymentOutboxRepository repo, PaymentClient paymentClient, TransactionTemplate tx) {
        this.repo = repo;
        this.paymentClient = paymentClient;
        this.tx = tx;
    }

    public void enqueueReward(UUID userId, int points, String reason, UUID sessionId) {
        try {
            String payload = mapper.writeValueAsString(Map.of("userId", userId.toString(), "points", points, "reason", reason));
            repo.save(new PaymentOutbox(sessionId, PaymentOutbox.Kind.REWARD, payload));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    @Scheduled(fixedDelayString = "${app.outbox.interval:PT1M}", initialDelayString = "${app.outbox.initial-delay:PT30S}")
    public void flush() {
        for (PaymentOutbox item : repo.findTop50BySentAtIsNullOrderByCreatedAtAsc()) {
            String error = null;
            try {
                send(item);
            } catch (Exception e) {
                error = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
                log.warn("Outbox {} ({}) failed: {}", item.getId(), item.getKind(), error);
            }
            String err = error;
            tx.executeWithoutResult(s -> repo.findById(item.getId()).ifPresent(x -> {
                if (err == null) x.markSent();
                else x.markFailed(err);
            }));
        }
    }

    void send(PaymentOutbox item) throws JsonProcessingException {
        Map<?, ?> p = mapper.readValue(item.getPayload(), Map.class);
        switch (item.getKind()) {
            case REWARD -> paymentClient.reward(UUID.fromString((String) p.get("userId")), ((Number) p.get("points")).intValue(),
                    (String) p.get("reason"), item.getSessionId());
        }
    }
}
