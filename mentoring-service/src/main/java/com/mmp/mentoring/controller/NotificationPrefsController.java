package com.mmp.mentoring.controller;

import com.mmp.mentoring.security.CurrentUser;
import com.mmp.mentoring.service.NotificationPrefsService;
import com.mmp.mentoring.service.NotificationPrefsService.Prefs;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Frontend gọi /api/notifications/preferences (proxy ánh xạ service "notifications" tới mentoring-service). */
@RestController
@RequestMapping("/api/notifications/preferences")
public class NotificationPrefsController {

    private final NotificationPrefsService service;

    public NotificationPrefsController(NotificationPrefsService service) {
        this.service = service;
    }

    @GetMapping
    public Prefs get() {
        return service.get(CurrentUser.get().userId());
    }

    @PutMapping
    public Prefs put(@RequestBody Prefs input) {
        return service.save(CurrentUser.get().userId(), input);
    }
}
