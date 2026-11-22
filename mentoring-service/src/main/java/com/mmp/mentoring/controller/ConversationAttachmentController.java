package com.mmp.mentoring.controller;

import com.mmp.mentoring.security.CurrentUser;
import com.mmp.mentoring.service.ConversationAttachmentService;
import com.mmp.mentoring.service.ConversationAttachmentService.Attachment;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/mentoring/conversations/{conversation}/attachments")
public class ConversationAttachmentController {
    private final ConversationAttachmentService files;

    public ConversationAttachmentController(ConversationAttachmentService files) {
        this.files = files;
    }

    @GetMapping
    public List<Attachment> list(@PathVariable UUID conversation) {
        return files.list(CurrentUser.get(), conversation);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Attachment upload(@PathVariable UUID conversation, @RequestParam MultipartFile file) throws IOException {
        return files.upload(CurrentUser.get(), conversation, file);
    }

    @GetMapping("/{id}")
    public ResponseEntity<byte[]> download(@PathVariable UUID conversation, @PathVariable UUID id) {
        var file = files.download(CurrentUser.get(), conversation, id);
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_OCTET_STREAM)
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(file.name(), StandardCharsets.UTF_8).build().toString())
                .body(file.content());
    }
}
