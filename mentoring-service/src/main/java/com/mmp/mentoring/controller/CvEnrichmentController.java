package com.mmp.mentoring.controller;

import com.mmp.mentoring.dto.MentoringDtos.*;
import com.mmp.mentoring.entity.CvDocument;
import com.mmp.mentoring.security.CurrentUser;
import com.mmp.mentoring.service.CvEnrichmentService;
import jakarta.validation.Valid;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

/** CV Parsing + Chatbot enrichment (FR-8.x). */
@RestController
@RequestMapping("/api/mentoring")
public class CvEnrichmentController {

    private final CvEnrichmentService service;

    public CvEnrichmentController(CvEnrichmentService service) {
        this.service = service;
    }

    @PostMapping(value = "/mentee/{menteeId}/cv-upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAnyRole('MENTEE','ADMIN')")
    public CvUploadResult upload(@PathVariable UUID menteeId, @RequestPart("file") MultipartFile file) {
        return service.uploadForMentee(CurrentUser.get(), menteeId, file);
    }

    @GetMapping("/mentee/{menteeId}/enrichment/latest")
    public ResponseEntity<CvUploadResult> latest(@PathVariable UUID menteeId) {
        return service.latest(CurrentUser.get(), menteeId).map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @GetMapping("/enrichment/conversations/{id}")
    public ConversationView conversation(@PathVariable UUID id) {
        return service.get(CurrentUser.get(), id);
    }

    @PostMapping("/enrichment/conversations/{id}/answers")
    @PreAuthorize("hasRole('MENTEE')")
    public ConversationView answer(@PathVariable UUID id, @Valid @RequestBody AnswerInput in) {
        return service.answer(CurrentUser.get(), id, in.answer());
    }

    /** Parse CV không kèm chatbot — mentor dùng để điền nhanh hồ sơ. */
    @PostMapping(value = "/cv/parse", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public CvView parse(@RequestPart("file") MultipartFile file) {
        return service.parseAndStore(CurrentUser.get(), file);
    }

    @GetMapping("/cv/{cvId}/file")
    public ResponseEntity<byte[]> file(@PathVariable UUID cvId) {
        CvDocument doc = service.cvFile(CurrentUser.get(), cvId);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline()
                        .filename(doc.getFileName(), StandardCharsets.UTF_8).build().toString())
                .body(service.readFile(doc));
    }
}
