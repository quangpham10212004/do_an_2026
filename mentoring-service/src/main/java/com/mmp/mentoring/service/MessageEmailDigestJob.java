package com.mmp.mentoring.service;

import com.mmp.mentoring.client.EmailClient;
import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.repository.MessageRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * US-38 (PRD-NOTI-2) — "tin nhắn mới" qua email chỉ khi tin còn chưa đọc sau 30 phút, gộp: mỗi người nhận 1 email cho mọi
 * tin chưa đọc kể từ email trước ("Bạn có 3 tin nhắn chưa đọc từ A, B"). Đánh dấu mốc trước rồi mới gửi (gửi qua
 * EmailClient bắn-rồi-quên), nên tin đã báo không bị báo lại.
 */
@Component
public class MessageEmailDigestJob {

    private static final Logger log = LoggerFactory.getLogger(MessageEmailDigestJob.class);

    private final MessageRepository messageRepo;
    private final ProfileClient profileClient;
    private final EmailClient emailClient;
    private final TransactionTemplate tx;
    private final Duration unreadFor;

    public MessageEmailDigestJob(MessageRepository messageRepo, ProfileClient profileClient, EmailClient emailClient,
                                 TransactionTemplate tx, @Value("${app.messages.email-after:PT30M}") Duration unreadFor) {
        this.messageRepo = messageRepo;
        this.profileClient = profileClient;
        this.emailClient = emailClient;
        this.tx = tx;
        this.unreadFor = unreadFor;
    }

    @Scheduled(fixedDelayString = "${app.messages.digest-interval:PT5M}", initialDelayString = "PT90S")
    public void scheduled() {
        run();
    }

    /** Trả số email đã xếp gửi. */
    public int run() {
        OffsetDateTime now = OffsetDateTime.now();
        List<Object[]> rows = messageRepo.findUnreadDigests(now.minus(unreadFor));
        int sent = 0;
        for (Object[] row : rows) {
            UUID userId = UUID.fromString((String) row[0]);
            long count = ((Number) row[1]).longValue();
            OffsetDateTime latest = odt(row[2]);
            List<UUID> senders = Arrays.stream(((String) row[3]).split(",")).map(UUID::fromString).toList();
            tx.executeWithoutResult(s -> messageRepo.markDigested(userId, latest, now));
            Map<UUID, String> names = profileClient.displayNames(senders);
            emailClient.maybeSend(userId, "MESSAGE_DIGEST", "Bạn có " + count + " tin nhắn chưa đọc",
                    digestMessage(count, senders.stream().map(names::get).toList()), "/messages", null);
            sent++;
        }
        if (sent > 0) log.info("Queued {} unread-message digest emails", sent);
        return sent;
    }

    static String digestMessage(long count, List<String> senderNames) {
        String from = String.join(", ", senderNames.stream().filter(n -> n != null && !n.isBlank()).toList());
        return "Bạn có " + count + " tin nhắn chưa đọc" + (from.isEmpty() ? "" : " từ " + from)
                + " trên MentorHub. Trả lời sớm giúp buổi mentoring diễn ra suôn sẻ hơn.";
    }

    private static OffsetDateTime odt(Object v) {
        if (v instanceof OffsetDateTime o) return o;
        if (v instanceof Instant i) return i.atOffset(ZoneOffset.UTC);
        if (v instanceof Timestamp t) return t.toInstant().atOffset(ZoneOffset.UTC);
        throw new IllegalStateException("Unexpected timestamp type " + v);
    }
}
