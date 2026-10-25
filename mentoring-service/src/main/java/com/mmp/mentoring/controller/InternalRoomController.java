package com.mmp.mentoring.controller;

import com.mmp.mentoring.dto.MentoringDtos.RoomTokenInput;
import com.mmp.mentoring.dto.MentoringDtos.RoomTokenView;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.service.RoomService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Endpoint nội bộ cấp token vào phòng Jitsi cho phỏng vấn xác thực mentor (vòng 2). ai-service kiểm quyền và khung giờ,
 * mentoring-service giữ khoá ký ({@code JITSI_JWT_SECRET}). Chỉ chấp nhận tên phòng {@code mentorhub-verify-<uuid>} nên không
 * thể dùng để lấy token vào phòng học của mentee.
 */
@RestController
@RequestMapping("/internal/rooms")
public class InternalRoomController {

    private final RoomService rooms;

    public InternalRoomController(RoomService rooms) {
        this.rooms = rooms;
    }

    @PostMapping("/token")
    public RoomTokenView token(@Valid @RequestBody RoomTokenInput in) {
        if (!in.expiresAt().isAfter(in.notBefore())) {
            throw ApiException.badRequest("INVALID_WINDOW", "expiresAt phải sau notBefore");
        }
        String jwt = rooms.issueToken(in.room(), in.userId(), in.name(), in.moderator(), in.notBefore(), in.expiresAt());
        return new RoomTokenView("jitsi", rooms.domain(), in.room(), jwt);
    }
}
