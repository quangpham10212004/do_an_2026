package com.mmp.profile.controller;

import com.mmp.profile.dto.MentorDomainDtos.*;
import com.mmp.profile.exception.ApiException;
import com.mmp.profile.security.CurrentUser;
import com.mmp.profile.service.MentorDomainService;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;

@RestController
public class MentorDomainController {
    private static final String BASE = "/api/profile/mentor/{id}/domains";
    private static final String INTERNAL = "/internal/mentor/{id}/domains";
    private final MentorDomainService domains;

    public MentorDomainController(MentorDomainService domains) {
        this.domains = domains;
    }

    @GetMapping(BASE)
    public Domains ownDomains(@PathVariable UUID id) {
        requireMentor(id);
        return domains.list(id, false);
    }

    @GetMapping(BASE + "/public")
    public Domains publicDomains(@PathVariable UUID id) {
        return domains.list(id, true);
    }

    @PostMapping(value = BASE, consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public Domain add(@PathVariable UUID id, @RequestParam String domain,
                      @RequestParam(required = false) MultipartFile cv,
                      @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        requireMentor(id);
        return domains.add(id, domain, cv, authorization);
    }

    @PutMapping(BASE + "/{domain}/primary")
    public Domains setPrimary(@PathVariable UUID id, @PathVariable String domain) {
        requireMentor(id);
        return domains.setPrimary(id, domain);
    }

    @PatchMapping(BASE + "/{domain}")
    public Domains update(@PathVariable UUID id, @PathVariable String domain, @Valid @RequestBody Settings patch) {
        requireMentor(id);
        return domains.update(id, domain, patch);
    }

    @DeleteMapping(BASE + "/{domain}")
    public Domains remove(@PathVariable UUID id, @PathVariable String domain) {
        requireMentor(id);
        return domains.remove(id, domain);
    }

    @GetMapping("/api/profile/mentor/{id}/cvs")
    public Cvs cvs(@PathVariable UUID id, @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        requireMentor(id);
        return domains.cvs(id, authorization);
    }

    @PostMapping("/api/profile/domains/suggestions")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void suggest(@Valid @RequestBody Suggestion suggestion) {
        var user = CurrentUser.get();
        if (!"MENTOR".equals(user.role())) throw ApiException.forbidden("Chỉ mentor có thể đề xuất lĩnh vực");
        domains.suggest(user.userId(), suggestion);
    }

    @GetMapping(INTERNAL)
    public InternalDomains internalDomains(@PathVariable UUID id) {
        return domains.internalList(id);
    }

    @PutMapping(INTERNAL + "/{domain}/verification")
    public InternalDomains verification(@PathVariable UUID id, @PathVariable String domain, @Valid @RequestBody Verdict verdict) {
        return domains.verify(id, domain, verdict);
    }

    private void requireMentor(UUID id) {
        var user = CurrentUser.get();
        if (!id.equals(user.userId()) || !"MENTOR".equals(user.role())) {
            throw ApiException.forbidden("Bạn không có quyền thao tác trên tài nguyên của người khác");
        }
    }
}
