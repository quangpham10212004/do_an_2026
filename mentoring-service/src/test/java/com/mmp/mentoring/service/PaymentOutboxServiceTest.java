package com.mmp.mentoring.service;

import com.mmp.mentoring.client.PaymentClient;
import com.mmp.mentoring.entity.PaymentOutbox;
import com.mmp.mentoring.repository.PaymentOutboxRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.ResourceAccessException;

import java.time.OffsetDateTime;
import java.util.*;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Outbox payment: thứ tự trong 1 phiên, FINAL_STATE (US-25), RELEASE (US-32). */
class PaymentOutboxServiceTest {

    private final PaymentOutboxRepository repo = mock(PaymentOutboxRepository.class);
    private final PaymentClient client = mock(PaymentClient.class);
    private final TransactionTemplate tx = mock(TransactionTemplate.class);
    private final List<PaymentOutbox> rows = new ArrayList<>();
    private final UUID sessionId = UUID.randomUUID();
    private PaymentOutboxService outbox;

    @BeforeEach
    void setUp() {
        doAnswer(inv -> {
            inv.<Consumer<TransactionStatus>>getArgument(0).accept(null);
            return null;
        }).when(tx).executeWithoutResult(any());
        when(repo.save(any())).thenAnswer(inv -> {
            PaymentOutbox o = inv.getArgument(0);
            ReflectionTestUtils.setField(o, "id", UUID.randomUUID());
            rows.add(o);
            return o;
        });
        when(repo.findById(any())).thenAnswer(inv -> rows.stream().filter(o -> o.getId().equals(inv.getArgument(0))).findFirst());
        when(repo.findBySessionIdAndSentAtIsNullOrderByCreatedAtAsc(any())).thenAnswer(inv -> rows.stream()
                .filter(o -> o.getSentAt() == null && o.getSessionId().equals(inv.getArgument(0)))
                .sorted(Comparator.comparing(PaymentOutbox::getCreatedAt)).toList());
        outbox = new PaymentOutboxService(repo, client, tx);
    }

    @Test
    void createdAtIsStrictlyIncreasing() {
        OffsetDateTime a = PaymentOutboxService.nextCreatedAt();
        OffsetDateTime b = PaymentOutboxService.nextCreatedAt();
        assertThat(b).isAfter(a);
    }

    @Test
    void finalStateIsSentWithPayload() {
        OffsetDateTime ended = OffsetDateTime.parse("2026-10-01T10:00:00Z");
        outbox.enqueueFinalState(sessionId, "COMPLETED", ended, true);
        outbox.flushSession(sessionId);
        verify(client).finalState(sessionId, "COMPLETED", ended, true);
        assertThat(rows.get(0).getSentAt()).isNotNull();
    }

    @Test
    void transientFailureHoldsBackLaterItemsOfSameSession() {
        doThrow(new ResourceAccessException("down")).when(client).release(sessionId);
        outbox.enqueueRelease(sessionId);
        outbox.enqueueRefund(sessionId, 50, "DISPUTE_PARTIAL_REFUND");
        outbox.flushSession(sessionId);
        verify(client, never()).refundRaw(any(), any(), anyInt());
        assertThat(rows).allMatch(o -> o.getSentAt() == null);

        doReturn(true).when(client).release(sessionId);
        outbox.flushSession(sessionId);
        var order = inOrder(client);
        order.verify(client, times(2)).release(sessionId);
        order.verify(client).refundRaw(sessionId, "DISPUTE_PARTIAL_REFUND", 50);
    }

    @Test
    void finalState404IsRetriedThenAbandoned() {
        doThrow(HttpClientErrorException.create(HttpStatus.NOT_FOUND, "nf", null, null, null))
                .when(client).finalState(any(), any(), any(), anyBoolean());
        outbox.enqueueFinalState(sessionId, "COMPLETED", OffsetDateTime.now(), false);
        for (int i = 0; i < PaymentOutboxService.FINAL_STATE_404_RETRIES - 1; i++) {
            outbox.flushSession(sessionId);
            assertThat(rows.get(0).getSentAt()).isNull();
        }
        outbox.flushSession(sessionId);
        assertThat(rows.get(0).getSentAt()).isNotNull();
        assertThat(rows.get(0).getLastError()).startsWith("404");
    }

    @Test
    void other4xxIsAbandonedImmediately() {
        doThrow(HttpClientErrorException.create(HttpStatus.CONFLICT, "c", null, null, null)).when(client).hold(any(), any());
        outbox.enqueueHold(sessionId, "DISPUTE_OPENED");
        outbox.flushSession(sessionId);
        assertThat(rows.get(0).getSentAt()).isNotNull();
    }
}
