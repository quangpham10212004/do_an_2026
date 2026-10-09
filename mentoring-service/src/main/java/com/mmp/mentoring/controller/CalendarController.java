package com.mmp.mentoring.controller;

import com.mmp.mentoring.security.CurrentUser;
import com.mmp.mentoring.service.CalendarService;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

/** US-34 (PRD-SES-13) — tải file .ics "Thêm vào lịch" của một phiên. */
@RestController
@RequestMapping("/api/mentoring")
public class CalendarController {

    private final CalendarService calendar;

    public CalendarController(CalendarService calendar) {
        this.calendar = calendar;
    }

    @GetMapping("/sessions/{id}/calendar.ics")
    public ResponseEntity<byte[]> ics(@PathVariable UUID id) {
        CalendarService.IcsFile f = calendar.ics(CurrentUser.get(), id);
        return ResponseEntity.ok()
                .contentType(new MediaType("text", "calendar", StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(f.filename()).build().toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(f.content().getBytes(StandardCharsets.UTF_8));
    }
}
