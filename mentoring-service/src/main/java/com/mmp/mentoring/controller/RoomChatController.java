package com.mmp.mentoring.controller;

import com.mmp.mentoring.security.CurrentUser;
import com.mmp.mentoring.service.RoomChatService;
import com.mmp.mentoring.service.RoomChatService.Message;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/mentoring/sessions/{sessionId}/room-chat")
public class RoomChatController {
    private final RoomChatService chat;

    public RoomChatController(RoomChatService chat) {
        this.chat = chat;
    }

    public record ChatInput(@NotBlank @Size(max = 500) String text) {}

    @GetMapping
    public List<Message> list(@PathVariable UUID sessionId) {
        return chat.list(CurrentUser.get(), sessionId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Message send(@PathVariable UUID sessionId, @Valid @RequestBody ChatInput input) {
        return chat.send(CurrentUser.get(), sessionId, input.text());
    }
}
