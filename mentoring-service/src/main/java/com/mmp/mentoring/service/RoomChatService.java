package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.SessionRepository;
import com.mmp.mentoring.security.AuthUser;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class RoomChatService {
    private final SessionRepository sessions;
    private final RoomService rooms;
    private final ProfileClient profiles;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;

    public RoomChatService(SessionRepository sessions, RoomService rooms, ProfileClient profiles,
                           JdbcTemplate jdbc, TransactionTemplate tx) {
        this.sessions = sessions;
        this.rooms = rooms;
        this.profiles = profiles;
        this.jdbc = jdbc;
        this.tx = tx;
    }

    public record Message(UUID id, UUID sessionId, boolean mine, String senderName, String text, OffsetDateTime sentAt) {}

    private record Row(UUID id, UUID sessionId, UUID senderId, String body, OffsetDateTime sentAt) {
        Message view(UUID viewer, Map<UUID, String> names) {
            return new Message(id, sessionId, senderId.equals(viewer), names.getOrDefault(senderId, "Người dùng"),
                    body, sentAt);
        }
    }

    public List<Message> list(AuthUser user, UUID sessionId) {
        var session = sessions.findById(sessionId)
                .orElseThrow(() -> ApiException.notFound("SESSION_NOT_FOUND", "Không tìm thấy phiên mentoring"));
        rooms.requireOpenRoom(user, session, OffsetDateTime.now());
        var rows = jdbc.query("""
                SELECT * FROM (
                    SELECT * FROM room_chat_messages WHERE session_id = ?
                    ORDER BY sent_at DESC, id DESC LIMIT 200
                ) recent ORDER BY sent_at, id
                """, RoomChatService::mapRow, sessionId);
        var names = profiles.displayNames(rows.stream().map(Row::senderId).distinct().toList());
        return rows.stream().map(row -> row.view(user.userId(), names)).toList();
    }

    public Message send(AuthUser user, UUID sessionId, String body) {
        Row row = tx.execute(status -> {
            var session = sessions.findForUpdate(sessionId)
                    .orElseThrow(() -> ApiException.notFound("SESSION_NOT_FOUND", "Không tìm thấy phiên mentoring"));
            rooms.requireOpenRoom(user, session, OffsetDateTime.now());
            return jdbc.queryForObject("""
                    INSERT INTO room_chat_messages (id, session_id, sender_id, body)
                    VALUES (?, ?, ?, ?) RETURNING *
                    """, RoomChatService::mapRow, UUID.randomUUID(), sessionId, user.userId(), body.strip());
        });
        return row.view(user.userId(), profiles.displayNames(List.of(user.userId())));
    }

    private static Row mapRow(ResultSet rs, int rowNum) throws SQLException {
        return new Row(rs.getObject("id", UUID.class), rs.getObject("session_id", UUID.class),
                rs.getObject("sender_id", UUID.class), rs.getString("body"),
                rs.getObject("sent_at", OffsetDateTime.class));
    }
}
