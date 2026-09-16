package com.mmp.profile.service;

import com.mmp.profile.dto.ProfileDtos.*;
import com.mmp.profile.entity.MenteeProfile;
import com.mmp.profile.entity.MentorAvailability;
import com.mmp.profile.entity.MentorProfile;
import com.mmp.profile.exception.ApiException;
import com.mmp.profile.repository.MenteeProfileRepository;
import com.mmp.profile.repository.MentorAvailabilityRepository;
import com.mmp.profile.repository.MentorProfileRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.util.*;

@Service
public class ProfileService {

    private final MentorProfileRepository mentorRepo;
    private final MenteeProfileRepository menteeRepo;
    private final MentorAvailabilityRepository availabilityRepo;
    private final ProfileTextNormalizer normalizer;
    private final EmbeddingService embeddingService;
    private final TransactionTemplate tx;

    public ProfileService(MentorProfileRepository mentorRepo, MenteeProfileRepository menteeRepo,
                          MentorAvailabilityRepository availabilityRepo, ProfileTextNormalizer normalizer,
                          EmbeddingService embeddingService, TransactionTemplate tx) {
        this.mentorRepo = mentorRepo;
        this.menteeRepo = menteeRepo;
        this.availabilityRepo = availabilityRepo;
        this.normalizer = normalizer;
        this.embeddingService = embeddingService;
        this.tx = tx;
    }

    // ---------------- Mentor ----------------

    public MentorProfileResponse getMentor(UUID userId) {
        MentorProfile p = findMentor(userId);
        return MentorProfileResponse.from(p, availability(userId),
                embeddingService.currentStatus(EmbeddingService.Table.MENTOR, userId).name());
    }

    /**
     * FR-2.4 + FR-2.5: lưu hồ sơ trong 1 transaction, SAU KHI commit mới gọi
     * matching-service sinh embedding (không giữ transaction trong lúc gọi mạng).
     */
    public MentorProfileResponse upsertMentor(UUID userId, MentorProfileInput in) {
        MentorProfile saved = tx.execute(status -> {
            MentorProfile p = mentorRepo.findById(userId).orElseGet(() -> {
                MentorProfile n = new MentorProfile();
                n.setUserId(userId);
                return n;
            });
            p.setDisplayName(in.displayName().trim());
            p.setSkills(normalizeList(in.skills()));
            p.setDomain(normalizeDomain(in.domain()));
            p.setBio(in.bio().trim());
            p.setYearsExperience(Optional.ofNullable(in.yearsExperience()).orElse(p.getYearsExperience()));
            p.setCvFileUrl(in.cvFileUrl());
            p.setPortfolioLinks(normalizeList(in.portfolioLinks()));
            p.setHourlyRate(Optional.ofNullable(in.hourlyRate()).orElse(Optional.ofNullable(p.getHourlyRate()).orElse(BigDecimal.ZERO)));
            p.setCapacity(Optional.ofNullable(in.capacity()).orElse(p.getCapacity()));
            p.setAvailable(Optional.ofNullable(in.isAvailable()).orElse(p.isAvailable()));
            return mentorRepo.save(p);
        });
        EmbeddingService.Status status = embeddingService.refresh(
                EmbeddingService.Table.MENTOR, userId, normalizer.normalizeMentor(saved), false);
        return MentorProfileResponse.from(findMentor(userId), availability(userId), status.name());
    }

    public List<AvailabilitySlot> availability(UUID mentorId) {
        return availabilityRepo.findByMentorIdOrderByDayOfWeekAscStartTimeAsc(mentorId).stream()
                .map(AvailabilitySlot::from).toList();
    }

    /** FR-2.4 — thay toàn bộ lịch rảnh hằng tuần của mentor. */
    public List<AvailabilitySlot> replaceAvailability(UUID mentorId, AvailabilityInput in) {
        findMentor(mentorId);
        List<AvailabilitySlot> slots = new ArrayList<>(in.slots());
        slots.sort(Comparator.comparing(AvailabilitySlot::dayOfWeek).thenComparing(AvailabilitySlot::startTime));
        for (int i = 0; i < slots.size(); i++) {
            AvailabilitySlot s = slots.get(i);
            if (!s.endTime().isAfter(s.startTime())) {
                throw ApiException.badRequest("INVALID_SLOT", "Giờ kết thúc phải sau giờ bắt đầu");
            }
            if (i > 0) {
                AvailabilitySlot prev = slots.get(i - 1);
                if (prev.dayOfWeek().equals(s.dayOfWeek()) && s.startTime().isBefore(prev.endTime())) {
                    throw ApiException.badRequest("OVERLAPPING_SLOTS", "Các khung giờ trong cùng một ngày bị chồng lấn");
                }
            }
        }
        tx.executeWithoutResult(status -> {
            availabilityRepo.deleteByMentorId(mentorId);
            availabilityRepo.flush();
            slots.forEach(s -> availabilityRepo.save(
                    new MentorAvailability(mentorId, s.dayOfWeek(), s.startTime(), s.endTime())));
        });
        return availability(mentorId);
    }

    public PageResponse<MentorCard> searchMentors(String domain, String q, boolean includeUnverified, int page, int size) {
        Page<MentorProfile> result = mentorRepo.search(
                blankToNull(domain) == null ? null : normalizeDomain(domain),
                includeUnverified ? null : MentorProfile.VerificationStatus.APPROVED,
                blankToNull(q),
                PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 50)));
        return new PageResponse<>(result.map(MentorCard::from).getContent(), result.getNumber(), result.getSize(),
                result.getTotalElements(), result.getTotalPages());
    }

    public MentorProfileResponse updateVerification(UUID mentorId, String status) {
        tx.executeWithoutResult(s -> findMentor(mentorId).setVerificationStatus(MentorProfile.VerificationStatus.valueOf(status)));
        return getMentor(mentorId);
    }

    public void updateRating(UUID mentorId, float rating, int ratingCount) {
        tx.executeWithoutResult(s -> {
            MentorProfile p = findMentor(mentorId);
            p.setRating(rating);
            p.setRatingCount(ratingCount);
        });
    }

    public void updateActiveMentees(UUID mentorId, int count) {
        tx.executeWithoutResult(s -> findMentor(mentorId).setActiveMenteeCount(count));
    }

    // ---------------- Mentee ----------------

    public MenteeProfileResponse getMentee(UUID userId) {
        return MenteeProfileResponse.from(findMentee(userId),
                embeddingService.currentStatus(EmbeddingService.Table.MENTEE, userId).name());
    }

    public MenteeProfileResponse upsertMentee(UUID userId, MenteeProfileInput in) {
        MenteeProfile saved = tx.execute(status -> {
            MenteeProfile p = menteeRepo.findById(userId).orElseGet(() -> {
                MenteeProfile n = new MenteeProfile();
                n.setUserId(userId);
                return n;
            });
            p.setDisplayName(in.displayName().trim());
            p.setGoal(in.goal().trim());
            p.setDomain(normalizeDomain(in.domain()));
            if (in.currentLevel() != null) {
                p.setCurrentLevel(MenteeProfile.Level.valueOf(in.currentLevel()));
            }
            p.setSkills(normalizeList(in.skills()));
            p.setPortfolioLinks(normalizeList(in.portfolioLinks()));
            if (in.cvFileUrl() != null) {
                p.setCvFileUrl(in.cvFileUrl());
            }
            return menteeRepo.save(p);
        });
        EmbeddingService.Status status = embeddingService.refresh(
                EmbeddingService.Table.MENTEE, userId, normalizer.normalizeMentee(saved), false);
        return MenteeProfileResponse.from(findMentee(userId), status.name());
    }

    /**
     * FR-8.5 — nhận goal đã được chatbot làm rõ, cập nhật hồ sơ (goal + gộp kỹ năng
     * trích từ CV) rồi sinh lại embedding.
     */
    public MenteeProfileResponse applyEnrichment(UUID userId, EnrichmentInput in) {
        MenteeProfile saved = tx.execute(status -> {
            MenteeProfile p = findMentee(userId);
            p.setGoal(in.enrichedGoalText().trim());
            if (in.cvSkills() != null && !in.cvSkills().isEmpty()) {
                LinkedHashMap<String, String> merged = new LinkedHashMap<>();
                for (String s : p.getSkills()) merged.putIfAbsent(s.toLowerCase(), s);
                for (String s : in.cvSkills()) if (s != null && !s.isBlank()) merged.putIfAbsent(s.trim().toLowerCase(), s.trim());
                p.setSkills(merged.values().stream().limit(30).toArray(String[]::new));
            }
            if (in.cvFileUrl() != null) {
                p.setCvFileUrl(in.cvFileUrl());
            }
            return menteeRepo.save(p);
        });
        EmbeddingService.Status status = embeddingService.refresh(
                EmbeddingService.Table.MENTEE, userId, normalizer.normalizeMentee(saved), false);
        return MenteeProfileResponse.from(findMentee(userId), status.name());
    }

    // ---------------- Shared ----------------

    public ProfileSummary summary(UUID userId) {
        return mentorRepo.findById(userId)
                .map(m -> new ProfileSummary(m.getUserId(), m.getDisplayName(), "MENTOR", m.getDomain()))
                .or(() -> menteeRepo.findById(userId)
                        .map(m -> new ProfileSummary(m.getUserId(), m.getDisplayName(), "MENTEE", m.getDomain())))
                .orElseThrow(() -> ApiException.notFound("PROFILE_NOT_FOUND", "Không tìm thấy hồ sơ"));
    }

    /** Sinh lại embedding cho toàn bộ profile (dùng khi đổi model hoặc format text). */
    public Map<String, Integer> rebuildAllEmbeddings(boolean force) {
        int mentors = 0, mentees = 0, pending = 0;
        for (MentorProfile p : mentorRepo.findAll()) {
            var s = embeddingService.refresh(EmbeddingService.Table.MENTOR, p.getUserId(), normalizer.normalizeMentor(p), force);
            if (s == EmbeddingService.Status.PENDING) pending++; else mentors++;
        }
        for (MenteeProfile p : menteeRepo.findAll()) {
            var s = embeddingService.refresh(EmbeddingService.Table.MENTEE, p.getUserId(), normalizer.normalizeMentee(p), force);
            if (s == EmbeddingService.Status.PENDING) pending++; else mentees++;
        }
        return Map.of("mentors", mentors, "mentees", mentees, "pending", pending);
    }

    /** Dùng bởi EmbeddingRetryJob. */
    public void retryPendingEmbeddings(int batchSize) {
        for (UUID id : embeddingService.findPending(EmbeddingService.Table.MENTOR, batchSize)) {
            mentorRepo.findById(id).ifPresent(p -> embeddingService.refresh(
                    EmbeddingService.Table.MENTOR, id, normalizer.normalizeMentor(p), true));
        }
        for (UUID id : embeddingService.findPending(EmbeddingService.Table.MENTEE, batchSize)) {
            menteeRepo.findById(id).ifPresent(p -> embeddingService.refresh(
                    EmbeddingService.Table.MENTEE, id, normalizer.normalizeMentee(p), true));
        }
    }

    private MentorProfile findMentor(UUID userId) {
        return mentorRepo.findById(userId)
                .orElseThrow(() -> ApiException.notFound("PROFILE_NOT_FOUND", "Mentor chưa tạo hồ sơ"));
    }

    private MenteeProfile findMentee(UUID userId) {
        return menteeRepo.findById(userId)
                .orElseThrow(() -> ApiException.notFound("PROFILE_NOT_FOUND", "Mentee chưa tạo hồ sơ"));
    }

    static String normalizeDomain(String domain) {
        return domain.trim().toLowerCase();
    }

    static String[] normalizeList(List<String> values) {
        if (values == null) return new String[0];
        LinkedHashMap<String, String> unique = new LinkedHashMap<>();
        for (String v : values) {
            if (v != null && !v.isBlank()) unique.putIfAbsent(v.trim().toLowerCase(), v.trim());
        }
        return unique.values().toArray(String[]::new);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
