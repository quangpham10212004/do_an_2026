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

import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Outbox cho lời gọi payment-service không được mất. {@code enqueue*} phải chạy trong transaction của thay đổi nghiệp vụ;
 * {@link #flush} (job mỗi phút) gửi từng bản ghi — lỗi mạng/5xx giữ lại để lần sau gửi tiếp, lỗi 4xx (yêu cầu không còn
 * hợp lệ, vd. giao dịch đã hoàn) đánh dấu bỏ kèm lý do. {@link #flushSession} gửi ngay sau khi commit (best-effort).
 */
@Service
public class PaymentOutboxService {

    private static final Logger log = LoggerFactory.getLogger(PaymentOutboxService.class);
    public static final String MENTOR_CANCEL_APOLOGY = "MENTOR_CANCEL_APOLOGY";
    /** FINAL_STATE bị 404 (payment-service chưa triển khai endpoint / chưa có giao dịch) được thử lại tối đa ngần này lần. */
    static final int FINAL_STATE_404_RETRIES = 10;
    private static final AtomicReference<OffsetDateTime> LAST_CREATED = new AtomicReference<>(OffsetDateTime.MIN);

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

    /** US-32 — giải phóng giao dịch tạm giữ (trước khi hoàn / trả mentor). */
    public void enqueueRelease(UUID sessionId) {
        enqueue(sessionId, PaymentOutbox.Kind.RELEASE, Map.of());
    }

    /**
     * US-25 — trạng thái cuối của phiên có phí (COMPLETED / NO_SHOW_MENTEE / CANCELLED do mentee huỷ muộn) → payment-service
     * giải phóng thu nhập sau 48 giờ; releaseNow = true khi tranh chấp đã xử lý.
     */
    public void enqueueFinalState(UUID sessionId, String state, OffsetDateTime endedAt, boolean releaseNow) {
        enqueue(sessionId, PaymentOutbox.Kind.FINAL_STATE, Map.of("state", state, "endedAt", endedAt.toString(), "releaseNow", releaseNow));
    }

    private void enqueue(UUID sessionId, PaymentOutbox.Kind kind, Map<String, Object> payload) {
        try {
            repo.save(new PaymentOutbox(sessionId, kind, mapper.writeValueAsString(payload), nextCreatedAt()));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Thời điểm tạo tăng ngặt (≥ 1µs) để các bản ghi cùng phiên luôn được gửi đúng thứ tự xếp hàng. */
    static OffsetDateTime nextCreatedAt() {
        return LAST_CREATED.updateAndGet(last -> {
            OffsetDateTime t = OffsetDateTime.now();
            OffsetDateTime now = t.withNano(t.getNano() / 1000 * 1000); // PostgreSQL lưu tới micro giây
            return now.isAfter(last) ? now : last.plusNanos(1000);
        });
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

    /**
     * Gửi theo thứ tự; một bản ghi lỗi tạm thời thì các bản ghi SAU của cùng phiên chờ lần sau (vd. RELEASE lỗi mạng thì
     * không gửi REFUND để khỏi bị 409 TRANSACTION_ON_HOLD rồi bị bỏ).
     */
    private void process(List<PaymentOutbox> items) {
        Set<UUID> blocked = new HashSet<>();
        for (PaymentOutbox item : items) {
            if (item.getSessionId() != null && blocked.contains(item.getSessionId())) continue;
            String error = null;
            boolean permanent = false;
            try {
                send(item);
            } catch (HttpClientErrorException e) {
                // FINAL_STATE 404: payment-service có thể chưa triển khai endpoint (rollout) → thử lại có giới hạn
                permanent = !(item.getKind() == PaymentOutbox.Kind.FINAL_STATE && e.getStatusCode().value() == 404
                        && item.getAttempts() + 1 < FINAL_STATE_404_RETRIES);
                error = e.getStatusCode().value() + " " + e.getResponseBodyAsString();
                log.warn("Outbox {} ({}) rejected by payment-service: {}", item.getId(), item.getKind(), error);
            } catch (Exception e) {
                error = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
                log.warn("Outbox {} ({}) failed: {}", item.getId(), item.getKind(), error);
            }
            if (error != null && !permanent && item.getSessionId() != null) blocked.add(item.getSessionId());
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
            case RELEASE -> paymentClient.release(item.getSessionId());
            case FINAL_STATE -> paymentClient.finalState(item.getSessionId(), (String) p.get("state"),
                    OffsetDateTime.parse((String) p.get("endedAt")), Boolean.TRUE.equals(p.get("releaseNow")));
        }
    }
}
