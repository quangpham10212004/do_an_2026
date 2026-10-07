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
import org.springframework.web.client.HttpClientErrorException;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Outbox cho lời gọi payment-service không được mất. {@code enqueue*} phải chạy trong transaction của thay đổi nghiệp vụ;
 * {@link #flush} (job mỗi phút) gửi từng bản ghi — lỗi mạng/5xx giữ lại để lần sau gửi tiếp, lỗi 4xx (yêu cầu không còn
 * hợp lệ, vd. giao dịch đã hoàn) đánh dấu bỏ kèm lý do. {@link #flushSession} gửi ngay sau khi commit (best-effort).
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
        enqueue(sessionId, PaymentOutbox.Kind.REWARD, Map.of("userId", userId.toString(), "points", points, "reason", reason));
    }

    /** US-12 — hoàn {@code percent}% giá phiên (NO_SHOW_MENTOR, CANCELLED_ON_CALL). */
    public void enqueueRefund(UUID sessionId, int percent, String reason) {
        enqueue(sessionId, PaymentOutbox.Kind.REFUND, Map.of("percent", percent, "reason", reason));
    }

    /** US-12 — tạm giữ giao dịch của phiên DISPUTED. */
    public void enqueueHold(UUID sessionId, String reason) {
        enqueue(sessionId, PaymentOutbox.Kind.HOLD, Map.of("reason", reason));
    }

    private void enqueue(UUID sessionId, PaymentOutbox.Kind kind, Map<String, Object> payload) {
        try {
            repo.save(new PaymentOutbox(sessionId, kind, mapper.writeValueAsString(payload)));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    @Scheduled(fixedDelayString = "${app.outbox.interval:PT1M}", initialDelayString = "${app.outbox.initial-delay:PT30S}")
    public void flush() {
        process(repo.findTop50BySentAtIsNullOrderByCreatedAtAsc());
    }

    /** Gửi ngay các bản ghi chưa gửi của 1 phiên (gọi sau khi transaction nghiệp vụ đã commit). */
    public void flushSession(UUID sessionId) {
        try {
            process(repo.findBySessionIdAndSentAtIsNullOrderByCreatedAtAsc(sessionId));
        } catch (RuntimeException e) {
            log.warn("Immediate outbox flush for session {} failed, job will retry: {}", sessionId, e.getMessage());
        }
    }

    private void process(List<PaymentOutbox> items) {
        for (PaymentOutbox item : items) {
            String error = null;
            boolean permanent = false;
            try {
                send(item);
            } catch (HttpClientErrorException e) {
                permanent = true;
                error = e.getStatusCode().value() + " " + e.getResponseBodyAsString();
                log.warn("Outbox {} ({}) rejected by payment-service, abandoning: {}", item.getId(), item.getKind(), error);
            } catch (Exception e) {
                error = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
                log.warn("Outbox {} ({}) failed: {}", item.getId(), item.getKind(), error);
            }
            String err = error;
            boolean abandon = permanent;
            tx.executeWithoutResult(s -> repo.findById(item.getId()).ifPresent(x -> {
                if (x.getSentAt() != null) return; // job và flushSession có thể cùng xử lý — chỉ ghi lần đầu
                if (err == null) x.markSent();
                else if (abandon) x.markAbandoned(err);
                else x.markFailed(err);
            }));
        }
    }

    void send(PaymentOutbox item) throws JsonProcessingException {
        Map<?, ?> p = mapper.readValue(item.getPayload(), Map.class);
        switch (item.getKind()) {
            case REWARD -> paymentClient.reward(UUID.fromString((String) p.get("userId")), ((Number) p.get("points")).intValue(),
                    (String) p.get("reason"), item.getSessionId());
            case REFUND -> paymentClient.refundRaw(item.getSessionId(), (String) p.get("reason"), ((Number) p.get("percent")).intValue());
            case HOLD -> paymentClient.hold(item.getSessionId(), (String) p.get("reason"));
        }
    }
}
