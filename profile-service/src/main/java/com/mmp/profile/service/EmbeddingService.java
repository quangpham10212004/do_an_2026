package com.mmp.profile.service;

import com.mmp.profile.client.EmbeddingClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Sinh & lưu embedding cho profile (FR-2.5, FR-4.1, FR-4.2).
 *
 * NFR-7 — tái sử dụng embedding: lưu hash SHA-256 của đoạn text chuẩn hoá; nếu
 * text không đổi và đã có vector thì bỏ qua, không gọi model lại.
 * Khi matching-service lỗi: đặt embedding_text_hash = NULL (vector cũ, nếu có,
 * vẫn được giữ để matching tiếp tục hoạt động) và EmbeddingRetryJob sẽ thử lại.
 */
@Service
public class EmbeddingService {

    private static final Logger log = LoggerFactory.getLogger(EmbeddingService.class);

    public enum Table {
        MENTOR("mentor_profiles"), MENTEE("mentee_profiles");

        final String name;

        Table(String name) {
            this.name = name;
        }
    }

    /** Kết quả cho client biết embedding đã sẵn sàng hay đang chờ retry. */
    public enum Status { UPDATED, UNCHANGED, PENDING }

    private final EmbeddingClient embeddingClient;
    private final JdbcTemplate jdbc;

    public EmbeddingService(EmbeddingClient embeddingClient, JdbcTemplate jdbc) {
        this.embeddingClient = embeddingClient;
        this.jdbc = jdbc;
    }

    public Status refresh(Table table, UUID userId, String normalizedText, boolean force) {
        String hash = sha256(normalizedText);
        if (!force) {
            Integer same = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM " + table.name + " WHERE user_id = ? AND embedding IS NOT NULL AND embedding_text_hash = ?",
                    Integer.class, userId, hash);
            if (same != null && same > 0) {
                return Status.UNCHANGED;
            }
        }
        return embeddingClient.embed(normalizedText)
                .map(vector -> {
                    jdbc.update("UPDATE " + table.name
                                    + " SET embedding = CAST(? AS vector), embedding_text_hash = ?, embedding_updated_at = now() WHERE user_id = ?",
                            toPgVector(vector), hash, userId);
                    return Status.UPDATED;
                })
                .orElseGet(() -> {
                    jdbc.update("UPDATE " + table.name + " SET embedding_text_hash = NULL WHERE user_id = ?", userId);
                    log.warn("Embedding pending for {} {}", table, userId);
                    return Status.PENDING;
                });
    }

    public Status currentStatus(Table table, UUID userId) {
        Integer ready = jdbc.queryForObject(
                "SELECT COUNT(*) FROM " + table.name + " WHERE user_id = ? AND embedding IS NOT NULL AND embedding_text_hash IS NOT NULL",
                Integer.class, userId);
        return ready != null && ready > 0 ? Status.UPDATED : Status.PENDING;
    }

    public List<UUID> findPending(Table table, int limit) {
        return jdbc.queryForList("SELECT user_id FROM " + table.name + " WHERE embedding_text_hash IS NULL LIMIT ?",
                UUID.class, limit);
    }

    static String toPgVector(List<Double> vector) {
        return vector.stream().map(d -> Float.toString(d.floatValue())).collect(Collectors.joining(",", "[", "]"));
    }

    static String sha256(String text) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
