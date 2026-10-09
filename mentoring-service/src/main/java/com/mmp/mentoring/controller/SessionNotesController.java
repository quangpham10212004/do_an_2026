package com.mmp.mentoring.controller;

import com.mmp.mentoring.dto.SessionNotesDtos.*;
import com.mmp.mentoring.security.CurrentUser;
import com.mmp.mentoring.service.SessionNotesService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/** US-40 (PRD-SES-10..12) — ghi chú chung, action item và ghi chú riêng của mentor cho một phiên. */
@RestController
@RequestMapping("/api/mentoring")
public class SessionNotesController {

    private final SessionNotesService notes;

    public SessionNotesController(SessionNotesService notes) {
        this.notes = notes;
    }

    @GetMapping("/sessions/{id}/notes")
    public SessionNotesView get(@PathVariable UUID id) {
        return notes.get(CurrentUser.get(), id);
    }

    @PutMapping("/sessions/{id}/notes")
    public SharedNoteView saveShared(@PathVariable UUID id, @Valid @RequestBody SaveNoteInput in) {
        return notes.saveShared(CurrentUser.get(), id, in);
    }

    @PutMapping("/sessions/{id}/private-note")
    public PrivateNoteView savePrivate(@PathVariable UUID id, @Valid @RequestBody SavePrivateNoteInput in) {
        return notes.savePrivate(CurrentUser.get(), id, in);
    }

    @PostMapping("/sessions/{id}/action-items")
    @ResponseStatus(HttpStatus.CREATED)
    public ActionItemView addItem(@PathVariable UUID id, @Valid @RequestBody ActionItemInput in) {
        return notes.addItem(CurrentUser.get(), id, in);
    }

    @PatchMapping("/action-items/{itemId}")
    public ActionItemView updateItem(@PathVariable UUID itemId, @Valid @RequestBody ActionItemUpdate in) {
        return notes.updateItem(CurrentUser.get(), itemId, in);
    }

    @DeleteMapping("/action-items/{itemId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteItem(@PathVariable UUID itemId) {
        notes.deleteItem(CurrentUser.get(), itemId);
    }
}
