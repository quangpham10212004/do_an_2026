package com.mmp.profile.service;

import com.mmp.profile.client.DomainVerificationClient;
import com.mmp.profile.client.MatchingIndexClient;
import com.mmp.profile.dto.MentorDomainDtos.*;
import com.mmp.profile.entity.MentorDomain;
import com.mmp.profile.entity.MentorDomain.Stage;
import com.mmp.profile.entity.MentorDomain.State;
import com.mmp.profile.entity.MentorProfile;
import com.mmp.profile.entity.MentorProfile.VerificationStatus;
import com.mmp.profile.exception.ApiException;
import com.mmp.profile.repository.MentorDomainRepository;
import com.mmp.profile.repository.MentorProfileRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.*;

@Service
public class MentorDomainService {
    private static final Logger log = LoggerFactory.getLogger(MentorDomainService.class);
    private static final int MAX_DOMAINS = DomainCatalog.MAX_DOMAINS;
    private static final Set<String> CATALOG = DomainCatalog.CODES;
    private static final List<String> STAGE_LABELS = List.of("CV", "Bài đánh giá", "Video", "Admin duyệt");

    private final MentorProfileRepository profiles;
    private final MentorDomainRepository domains;
    private final DomainVerificationClient verification;
    private final MatchingIndexClient matching;
    private final ProfileService profileService;
    private final JdbcTemplate jdbc;
    private final Clock clock;

    public MentorDomainService(MentorProfileRepository profiles, MentorDomainRepository domains,
                               DomainVerificationClient verification, MatchingIndexClient matching,
                               ProfileService profileService, JdbcTemplate jdbc, Clock clock) {
        this.profiles = profiles;
        this.domains = domains;
        this.verification = verification;
        this.matching = matching;
        this.profileService = profileService;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Domains list(UUID id, boolean publicOnly) {
        return response(findProfile(id, false), records(id), publicOnly);
    }

    @Transactional(readOnly = true)
    public InternalDomains internalList(UUID id) {
        return internalResponse(findProfile(id, false), records(id));
    }

    @Transactional
    public Domain add(UUID id, String code, MultipartFile cv, String authorization) {
        code = catalogCode(code);
        var profile = findProfile(id, true);
        var records = records(id);
        if (code.equalsIgnoreCase(profile.getDomain()) || find(records, code).isPresent()) {
            throw ApiException.conflict("DOMAIN_ALREADY_EXISTS", "Bạn đã có lĩnh vực này");
        }
        checkCapacity(profile, records);
        var uploaded = cv == null ? verification.currentCvs(authorization).stream().findFirst().orElse(null)
                : verification.uploadCv(authorization, cv);
        var record = new MentorDomain(id, code, OffsetDateTime.now(clock));
        record.linkCv(uploaded == null ? null : uploaded.id());
        return view(profile, domains.save(record));
    }

    @Transactional
    public Domains setPrimary(UUID id, String code) {
        var profile = findProfile(id, true);
        var records = records(id);
        if (!isLegacyPrimary(profile, code)) {
            var target = requireDomain(records, code);
            requireVerified(target);
            if (!code.equalsIgnoreCase(profile.getDomain())) {
                // Preserve the current profile domain when it was approved by the legacy flow.
                var previous = find(records, profile.getDomain()).orElseGet(() -> saveLegacyPrimary(profile));
                previous.updateSettings(profile.getHourlyRate(), null);
                if (target.getHourlyRate() != null) profile.setHourlyRate(target.getHourlyRate());
                switchPrimary(profile, target.getDomain());
                reindexAfterCommit(id);
            }
        }
        return response(profile, records(id), false);
    }

    @Transactional
    public Domains remove(UUID id, String code) {
        var profile = findProfile(id, true);
        if (code.equalsIgnoreCase(profile.getDomain())) {
            throw ApiException.conflict("PRIMARY_DOMAIN", "Hãy đặt lĩnh vực khác làm chính trước khi gỡ lĩnh vực này");
        }
        var record = requireDomain(records(id), code);
        domains.delete(record);
        afterCommit(() -> {
            try {
                verification.cancelTrack(id, record.getDomain(), record.getId());
            } catch (ApiException e) {
                log.warn("Could not cancel verification track for mentor {} and domain {}: {}",
                        id, record.getDomain(), e.getCode());
            }
        });
        if (record.getState() == State.VERIFIED) reindexAfterCommit(id);
        return response(profile, records(id), false);
    }

    @Transactional
    public Domains update(UUID id, String code, Settings patch) {
        var profile = findProfile(id, true);
        var record = find(records(id), code).orElseGet(() -> {
            if (!isLegacyPrimary(profile, code)) throw domainNotFound();
            return saveLegacyPrimary(profile);
        });
        requireVerified(record);
        record.updateSettings(patch.hourlyRate(), patch.accepting());
        if (patch.hourlyRate() != null && record.getDomain().equalsIgnoreCase(profile.getDomain())) {
            profile.setHourlyRate(patch.hourlyRate());
        }
        reindexAfterCommit(id);
        return response(profile, records(id), false);
    }

    @Transactional
    public InternalDomains verify(UUID id, String code, Verdict verdict) {
        var profile = findProfile(id, true);
        var records = records(id);
        var existing = find(records, code);
        if (verdict.profileDomainId() != null && existing
                .filter(d -> verdict.profileDomainId().equals(d.getId())).isEmpty()) throw domainNotFound();
        if (existing.isEmpty() && !code.equalsIgnoreCase(profile.getDomain())) {
            if (!Boolean.TRUE.equals(verdict.register()) || verdict.state() != State.PENDING) throw domainNotFound();
            code = catalogCode(code);
            checkCapacity(profile, records);
        }
        MentorDomain record = existing.isPresent() ? existing.get()
                : isLegacyPrimary(profile, code) ? saveLegacyPrimary(profile)
                : domains.save(new MentorDomain(id, code, OffsetDateTime.now(clock)));
        State previous = record.getState();
        record.updateVerification(verdict.state(), verdict.stage(), verdict.testScore(), verdict.rejectedReason(),
                verdict.retryAt(), OffsetDateTime.now(clock));
        if (previous != State.VERIFIED && record.getState() == State.VERIFIED) {
            record.updateSettings(profile.getHourlyRate(), null);
            reindexAfterCommit(id);
        }
        if (profile.getVerificationStatus() != VerificationStatus.APPROVED) {
            if (record.getState() == State.VERIFIED) {
                if (!record.getDomain().equalsIgnoreCase(profile.getDomain()) && find(records, profile.getDomain()).isEmpty()) {
                    saveLegacyPrimary(profile);
                }
                switchPrimary(profile, record.getDomain());
                profile.setVerificationStatus(VerificationStatus.APPROVED);
            } else if (record.getDomain().equalsIgnoreCase(profile.getDomain())) {
                profile.setVerificationStatus(record.getState() == State.REJECTED ? VerificationStatus.REJECTED
                        : record.getStage() == Stage.ADMIN ? VerificationStatus.PENDING_REVIEW
                        : VerificationStatus.PENDING_INTERVIEW);
            }
        }
        return internalResponse(profile, records(id));
    }

    @Transactional(readOnly = true)
    public Cvs cvs(UUID id, String authorization) {
        var profile = findProfile(id, false);
        var records = records(id);
        return new Cvs(verification.currentCvs(authorization).stream().map(cv -> {
            String domain = records.stream().filter(record -> cv.id().equals(record.getCvId()))
                    .map(MentorDomain::getDomain).findFirst().orElse(profile.getDomain());
            return new Cv(cv.fileName(), domain, "Dùng khi xác thực");
        }).toList());
    }

    public void suggest(UUID userId, Suggestion suggestion) {
        jdbc.update("INSERT INTO domain_suggestions (submitted_by, name) VALUES (?, ?)", userId, suggestion.name().strip());
    }

    private List<MentorDomain> records(UUID id) {
        return domains.findByMentorIdOrderByAddedAtAscDomainAsc(id);
    }

    private MentorProfile findProfile(UUID id, boolean lock) {
        return (lock ? profiles.findForUpdate(id) : profiles.findById(id)).orElseThrow(() ->
                ApiException.notFound("MENTOR_NOT_FOUND", "Không tìm thấy hồ sơ mentor"));
    }

    private Domains response(MentorProfile profile, List<MentorDomain> records, boolean publicOnly) {
        if (publicOnly && profile.getVerificationStatus() != VerificationStatus.APPROVED) {
            return new Domains(List.of(), MAX_DOMAINS);
        }
        List<MentorDomain> all = new ArrayList<>(records);
        if (find(all, profile.getDomain()).isEmpty()) all.add(legacyDomain(profile));
        return new Domains(all.stream().filter(d -> !publicOnly || d.getState() == State.VERIFIED)
                .map(d -> view(profile, d)).sorted(Comparator.comparing(Domain::primary).reversed()).toList(), MAX_DOMAINS);
    }

    private InternalDomains internalResponse(MentorProfile profile, List<MentorDomain> records) {
        var list = response(profile, records, false);
        return new InternalDomains(list.domains(), list.max(), records.stream()
                .map(d -> new DomainRecord(d.getDomain(), d.getId(), d.getCvId())).toList());
    }

    private Domain view(MentorProfile profile, MentorDomain domain) {
        boolean verified = domain.getState() == State.VERIFIED;
        boolean primary = verified && domain.getDomain().equalsIgnoreCase(profile.getDomain());
        boolean accepting = verified && domain.isAccepting() && profileService.effectiveStatus(profile) == MentorProfile.Status.ACCEPTING;
        int slotsLeft = accepting ? Math.max(0, profile.getCapacity() - profile.getActiveMenteeCount()) : 0;
        return new Domain(domain.getDomain(), domain.getState(), primary, domain.getAddedAt(), domain.getVerifiedAt(),
                primary ? profile.getHeadline() : null,
                verified ? Objects.requireNonNullElse(domain.getHourlyRate(), profile.getHourlyRate()) : null,
                primary ? profile.getRating() : null, verified ? domain.isAccepting() : null, verified ? slotsLeft : null,
                domain.getState() == State.PENDING ? steps(domain.getStage()) : null,
                verified ? null : domain.getTestScore(), domain.getRejectedReason(), domain.getRetryAt());
    }

    private static List<Step> steps(Stage current) {
        return Arrays.stream(Stage.values()).map(stage -> new Step(stage, STAGE_LABELS.get(stage.ordinal()),
                stage == current ? "CURRENT" : stage.ordinal() < current.ordinal() ? "DONE" : "TODO")).toList();
    }

    private MentorDomain saveLegacyPrimary(MentorProfile profile) {
        return domains.save(legacyDomain(profile));
    }

    private MentorDomain legacyDomain(MentorProfile profile) {
        OffsetDateTime addedAt = profile.getCreatedAt() == null ? OffsetDateTime.now(clock) : profile.getCreatedAt();
        var record = new MentorDomain(profile.getUserId(), profile.getDomain().toLowerCase(Locale.ROOT), addedAt);
        switch (profile.getVerificationStatus()) {
            case APPROVED -> record.updateVerification(State.VERIFIED, Stage.ADMIN, null, null, null, addedAt);
            case PENDING_REVIEW -> record.updateVerification(State.PENDING, Stage.ADMIN, null, null, null, addedAt);
            case REJECTED -> record.updateVerification(State.REJECTED, Stage.ADMIN, null, null, null, addedAt);
            case PENDING_INTERVIEW -> { }
        }
        return record;
    }

    private static boolean isLegacyPrimary(MentorProfile profile, String code) {
        return profile.getVerificationStatus() == VerificationStatus.APPROVED && code.equalsIgnoreCase(profile.getDomain());
    }

    private static void switchPrimary(MentorProfile profile, String domain) {
        profile.setDomain(domain);
        profile.setPreviousDomains(Arrays.stream(profile.getPreviousDomains())
                .filter(previous -> !previous.equalsIgnoreCase(domain)).toArray(String[]::new));
    }

    static int effectiveDomainCount(MentorProfile profile, List<MentorDomain> records) {
        return records.size() + (find(records, profile.getDomain()).isPresent() ? 0 : 1);
    }

    private static void checkCapacity(MentorProfile profile, List<MentorDomain> records) {
        if (effectiveDomainCount(profile, records) >= MAX_DOMAINS) {
            throw ApiException.conflict("DOMAIN_LIMIT", "Bạn đã có tối đa 3 lĩnh vực");
        }
    }

    static String catalogCode(String raw) {
        String code = raw.strip().toLowerCase(Locale.ROOT);
        if (!CATALOG.contains(code)) throw ApiException.badRequest("INVALID_DOMAIN", "Lĩnh vực không hợp lệ");
        return code;
    }

    private static Optional<MentorDomain> find(List<MentorDomain> records, String code) {
        return records.stream().filter(record -> code.equalsIgnoreCase(record.getDomain())).findFirst();
    }

    private static MentorDomain requireDomain(List<MentorDomain> records, String code) {
        return find(records, code).orElseThrow(MentorDomainService::domainNotFound);
    }

    private static ApiException domainNotFound() {
        return ApiException.notFound("DOMAIN_NOT_FOUND", "Không tìm thấy lĩnh vực");
    }

    private static void requireVerified(MentorDomain record) {
        if (record.getState() != State.VERIFIED) {
            throw ApiException.conflict("DOMAIN_NOT_VERIFIED", "Chỉ có thể chỉnh lĩnh vực đã xác thực");
        }
    }

    private void reindexAfterCommit(UUID id) {
        afterCommit(() -> matching.reindexAsync("MENTOR", id));
    }

    private static void afterCommit(Runnable callback) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() { callback.run(); }
        });
    }
}
