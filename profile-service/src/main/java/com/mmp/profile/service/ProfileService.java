package com.mmp.profile.service;

import com.mmp.profile.client.MatchingIndexClient;
import com.mmp.profile.dto.ProfileDtos.*;
import com.mmp.profile.entity.MenteeProfile;
import com.mmp.profile.entity.MentorAvailability;
import com.mmp.profile.entity.MentorAvailabilityException;
import com.mmp.profile.entity.MentorProfile;
import com.mmp.profile.exception.ApiException;
import com.mmp.profile.repository.MenteeProfileRepository;
import com.mmp.profile.repository.MentorAvailabilityExceptionRepository;
import com.mmp.profile.repository.MentorAvailabilityRepository;
import com.mmp.profile.repository.MentorProfileRepository;
import com.mmp.profile.repository.ProfileAvatarRepository;
import com.mmp.profile.entity.ProfileAvatar;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.*;

/**
 * Nghiệp vụ hồ sơ nghề nghiệp. Service này KHÔNG sở hữu embedding: vector, hash
 * text và trạng thái chỉ mục đều thuộc matching-service (CONVENTIONS.md mục 1).
 * Sau mỗi thay đổi nội dung hồ sơ, ta chỉ báo cho matching-service biết hồ sơ nào
 * vừa đổi (MatchingIndexClient, bắn rồi quên).
 */
@Service
public class ProfileService {

    private static final String ROLE_MENTOR = "MENTOR";
    private static final String ROLE_MENTEE = "MENTEE";

    private final MentorProfileRepository mentorRepo;
    private final MenteeProfileRepository menteeRepo;
    private final MentorAvailabilityRepository availabilityRepo;
    private final MentorAvailabilityExceptionRepository exceptionRepo;
    private final MatchingIndexClient matchingIndexClient;
    private final TransactionTemplate tx;
    private final Clock clock;
    /** US-37 — null trong các unit test cũ (coi như không ai có ảnh). */
    private final ProfileAvatarRepository avatarRepo;

    /**
     * Không thể kiểm tra trùng với phiên CONFIRMED: dữ liệu phiên thuộc mentoring-service và hiện chưa
     * có endpoint cho profile-service hỏi. mentoring-service tự tôn trọng ngoại lệ khi đặt lịch mới
     * (nhận qua GET /internal/mentor/{id}); phiên ĐÃ xác nhận không bị tự huỷ nên nhắc mentor tự xem lại.
     */
    static final String EXCEPTION_SESSION_WARNING = "Chưa kiểm tra được các phiên đã xác nhận trùng thời gian này. "
            + "Phiên đã xác nhận không tự huỷ — hãy xem trang Phiên học và dời/huỷ nếu cần.";

    public ProfileService(MentorProfileRepository mentorRepo, MenteeProfileRepository menteeRepo,
                          MentorAvailabilityRepository availabilityRepo,
                          MentorAvailabilityExceptionRepository exceptionRepo,
                          MatchingIndexClient matchingIndexClient, TransactionTemplate tx, Clock clock) {
        this(mentorRepo, menteeRepo, availabilityRepo, exceptionRepo, matchingIndexClient, tx, clock, null);
    }

    @Autowired
    public ProfileService(MentorProfileRepository mentorRepo, MenteeProfileRepository menteeRepo,
                          MentorAvailabilityRepository availabilityRepo,
                          MentorAvailabilityExceptionRepository exceptionRepo,
                          MatchingIndexClient matchingIndexClient, TransactionTemplate tx, Clock clock,
                          ProfileAvatarRepository avatarRepo) {
        this.mentorRepo = mentorRepo;
        this.menteeRepo = menteeRepo;
        this.availabilityRepo = availabilityRepo;
        this.exceptionRepo = exceptionRepo;
        this.matchingIndexClient = matchingIndexClient;
        this.tx = tx;
        this.clock = clock;
        this.avatarRepo = avatarRepo;
    }

    // ---------------- Mentor ----------------

    public MentorProfileResponse getMentor(UUID userId) {
        return toResponse(findMentor(userId));
    }

    private MentorProfileResponse toResponse(MentorProfile p) {
        LocalDate today = today(p);
        return MentorProfileResponse.from(p, effectiveStatus(p), availability(p.getUserId()),
                exceptions(p.getUserId(), today, today.plusDays(MentorRules.EXCEPTION_HORIZON_DAYS - 1)),
                avatarUrl(p.getUserId()));
    }

    /** US-08 — trạng thái hiệu lực (nghỉ phép hết hạn = ACCEPTING), tính khi đọc. */
    MentorProfile.Status effectiveStatus(MentorProfile p) {
        return MentorRules.effectiveStatus(p.getStatus(), p.getOnLeaveUntil(), today(p));
    }

    /** "Hôm nay" theo múi giờ của mentor. */
    LocalDate today(MentorProfile p) {
        return LocalDate.now(clock.withZone(MentorRules.zoneOf(p.getTimezone())));
    }

    /**
     * FR-2.4 + FR-2.5: lưu hồ sơ trong 1 transaction, SAU KHI commit mới báo
     * matching-service lập lại chỉ mục (không gọi mạng bên trong transaction).
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
            if (in.headline() != null) {
                p.setHeadline(blankToNull(in.headline().strip().replaceAll("\\s+", " ")));
            }
            // Cờ isAvailable cũ (US-08): chỉ đổi giữa ACCEPTING/PAUSED, không bao giờ gỡ SUSPENDED.
            MentorProfile.Status legacy = MentorRules.statusFromLegacyFlag(in.isAvailable(), effectiveStatus(p));
            if (legacy != null) {
                p.changeStatus(legacy, null, null);
            }
            return mentorRepo.save(p);
        });
        matchingIndexClient.reindexAsync(ROLE_MENTOR, saved.getUserId());
        return getMentor(userId);
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

    // ---------------- US-07: ngoại lệ lịch rảnh ----------------

    public List<AvailabilityExceptionDto> exceptions(UUID mentorId, LocalDate from, LocalDate to) {
        return exceptionRepo.findByMentorIdAndDateBetweenOrderByDateAscStartTimeAsc(mentorId, from, to).stream()
                .sorted(EXCEPTION_ORDER)
                .map(AvailabilityExceptionDto::from).toList();
    }

    /** Ngoại lệ chưa qua (từ hôm nay theo múi giờ mentor tới hết khoảng cho phép khai báo). */
    public List<AvailabilityExceptionDto> upcomingExceptions(UUID mentorId) {
        LocalDate today = today(findMentor(mentorId));
        return exceptions(mentorId, today, today.plusDays(MentorRules.EXCEPTION_MAX_AHEAD_DAYS));
    }

    public AvailabilityExceptionResult createException(UUID mentorId, AvailabilityExceptionInput in) {
        MentorProfile mentor = findMentor(mentorId);
        LocalDate today = today(mentor);
        MentorAvailabilityException saved = tx.execute(status -> {
            MentorRules.validateException(in.date(), in.startTime(), in.endTime(), today,
                    exceptionRepo.findByMentorIdAndDate(mentorId, in.date()), null);
            if (exceptionRepo.countByMentorIdAndDateGreaterThanEqual(mentorId, today) >= MentorRules.MAX_UPCOMING_EXCEPTIONS) {
                throw ApiException.badRequest("TOO_MANY_EXCEPTIONS",
                        "Tối đa " + MentorRules.MAX_UPCOMING_EXCEPTIONS + " ngoại lệ sắp tới");
            }
            return exceptionRepo.save(new MentorAvailabilityException(mentorId, in.date(), in.startTime(), in.endTime(),
                    MentorRules.trimToNull(in.reason())));
        });
        return new AvailabilityExceptionResult(AvailabilityExceptionDto.from(saved), EXCEPTION_SESSION_WARNING);
    }

    public AvailabilityExceptionResult updateException(UUID mentorId, UUID exceptionId, AvailabilityExceptionInput in) {
        MentorProfile mentor = findMentor(mentorId);
        LocalDate today = today(mentor);
        MentorAvailabilityException saved = tx.execute(status -> {
            MentorAvailabilityException e = findException(mentorId, exceptionId);
            if (e.getDate().isBefore(today)) {
                throw ApiException.badRequest("INVALID_EXCEPTION", "Không thể sửa ngoại lệ của ngày đã qua");
            }
            MentorRules.validateException(in.date(), in.startTime(), in.endTime(), today,
                    exceptionRepo.findByMentorIdAndDate(mentorId, in.date()), exceptionId);
            e.update(in.date(), in.startTime(), in.endTime(), MentorRules.trimToNull(in.reason()));
            return exceptionRepo.save(e);
        });
        return new AvailabilityExceptionResult(AvailabilityExceptionDto.from(saved), EXCEPTION_SESSION_WARNING);
    }

    public void deleteException(UUID mentorId, UUID exceptionId) {
        tx.executeWithoutResult(status -> exceptionRepo.delete(findException(mentorId, exceptionId)));
    }

    private MentorAvailabilityException findException(UUID mentorId, UUID exceptionId) {
        return exceptionRepo.findById(exceptionId)
                .filter(e -> e.getMentorId().equals(mentorId))
                .orElseThrow(() -> ApiException.notFound("EXCEPTION_NOT_FOUND", "Không tìm thấy ngoại lệ lịch rảnh"));
    }

    /** Theo ngày; trong cùng ngày, nghỉ cả ngày đứng trước rồi tới giờ bắt đầu. */
    private static final Comparator<MentorAvailabilityException> EXCEPTION_ORDER =
            Comparator.comparing(MentorAvailabilityException::getDate)
                    .thenComparing(MentorAvailabilityException::getStartTime, Comparator.nullsFirst(Comparator.naturalOrder()));

    public PageResponse<MentorCard> searchMentors(String domain, String q, boolean includeUnverified, int page, int size) {
        Page<MentorProfile> result = mentorRepo.search(
                blankToNull(domain) == null ? null : normalizeDomain(domain),
                includeUnverified ? null : MentorProfile.VerificationStatus.APPROVED,
                blankToNull(q),
                PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 50)));
        Map<UUID, String> avatars = avatarUrls(result.getContent().stream().map(MentorProfile::getUserId).toList());
        return new PageResponse<>(result.map(m -> MentorCard.from(m, effectiveStatus(m), avatars.get(m.getUserId()))).getContent(),
                result.getNumber(), result.getSize(), result.getTotalElements(), result.getTotalPages());
    }

    // ---------------- US-04: cài đặt đặt lịch ----------------

    public MentorProfileResponse updateBookingSettings(UUID mentorId, BookingSettingsInput in) {
        String link = MentorRules.normalizeMeetingLink(in.meetingLink());
        MentorRules.validateBufferAndNotice(in.bufferMinutes(), in.minNoticeHours());
        String[] languages = MentorRules.normalizeCodes(in.languages(), MentorRules.LANGUAGES, false, "Ngôn ngữ");
        String[] types = MentorRules.normalizeCodes(in.sessionTypes(), MentorRules.SESSION_TYPES, true, "Loại phiên");
        String timezone = MentorRules.normalizeTimezone(in.timezone());
        tx.executeWithoutResult(s -> {
            MentorProfile p = findMentor(mentorId);
            p.updateBookingSettings(link, in.bufferMinutes(), in.minNoticeHours(), languages, types, timezone);
            mentorRepo.save(p);
        });
        return getMentor(mentorId);
    }

    // ---------------- US-08: trạng thái mentor ----------------

    /** Mentor tự đổi ACCEPTING / PAUSED / ON_LEAVE (không đặt/gỡ được SUSPENDED). */
    public MentorProfileResponse changeOwnStatus(UUID mentorId, MentorStatusInput in) {
        tx.executeWithoutResult(s -> {
            MentorProfile p = findMentor(mentorId);
            MentorProfile.Status requested = MentorProfile.Status.valueOf(in.status());
            MentorRules.validateSelfStatusChange(effectiveStatus(p), requested, in.onLeaveUntil(), today(p));
            p.changeStatus(requested, in.onLeaveUntil(), MentorRules.trimToNull(in.reason()));
            mentorRepo.save(p);
        });
        return getMentor(mentorId);
    }

    /** Interface 2 — mentoring-service đặt PAUSED / SUSPENDED / ACCEPTING (ACCEPTING gỡ cả đình chỉ). */
    public MentorProfileResponse setStatusInternal(UUID mentorId, InternalStatusUpdate in) {
        tx.executeWithoutResult(s -> {
            MentorProfile p = findMentor(mentorId);
            p.changeStatus(MentorProfile.Status.valueOf(in.status()), null, MentorRules.trimToNull(in.reason()));
            mentorRepo.save(p);
        });
        return getMentor(mentorId);
    }

    /** MentorStatusJob — ghi lại vào DB các kỳ nghỉ phép đã hết hạn (đọc vốn đã tính đúng không cần job). */
    public int returnExpiredLeaves() {
        Integer n = tx.execute(s -> mentorRepo.returnExpiredLeaves());
        return n == null ? 0 : n;
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

    /** US-35 — mentoring-service đồng bộ thời gian phản hồi; matching-service đọc để tính responsiveness. */
    public void updateResponseTime(UUID mentorId, BigDecimal medianHours, int sampleSize) {
        tx.executeWithoutResult(s -> findMentor(mentorId).updateResponseTime(medianHours, sampleSize));
    }

    public void updateActiveMentees(UUID mentorId, int count) {
        tx.executeWithoutResult(s -> findMentor(mentorId).setActiveMenteeCount(count));
    }

    // ---------------- Mentee ----------------

    public MenteeProfileResponse getMentee(UUID userId) {
        return menteeResponse(findMentee(userId));
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
        matchingIndexClient.reindexAsync(ROLE_MENTEE, saved.getUserId());
        return menteeResponse(findMentee(userId));
    }

    /**
     * US-16 — lưu sở thích tìm mentor (thay toàn bộ). Không thuộc text embedding nên không báo
     * matching-service: matching đọc thẳng các cột này từ profile_db ở mỗi lượt tìm (US-17).
     */
    public MenteeProfileResponse updatePreferences(UUID userId, MenteePreferencesInput in) {
        Integer[] days = MenteeRules.normalizeDays(in.preferredDays());
        MenteeProfile.TimeOfDay timeOfDay = MenteeRules.parseTimeOfDay(in.preferredTimeOfDay());
        BigDecimal budget = MenteeRules.normalizeBudget(in.budgetMaxPerHour());
        String[] languages = MenteeRules.normalizeLanguages(in.languages());
        tx.executeWithoutResult(s -> {
            MenteeProfile p = findMentee(userId);
            p.updatePreferences(days, timeOfDay, budget, languages);
            menteeRepo.save(p);
        });
        return menteeResponse(findMentee(userId));
    }

    /**
     * FR-8.5 — nhận goal đã được chatbot làm rõ, cập nhật hồ sơ (goal + gộp kỹ năng
     * trích từ CV); matching-service lập lại chỉ mục sau đó.
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
        matchingIndexClient.reindexAsync(ROLE_MENTEE, saved.getUserId());
        return menteeResponse(findMentee(userId));
    }

    /** US-45 (PRD-CV-6) — gỡ kỹ năng (không phân biệt hoa thường) rồi báo matching-service lập lại chỉ mục. */
    public MenteeProfileResponse removeMenteeSkills(UUID userId, List<String> skills) {
        Set<String> remove = new HashSet<>();
        skills.forEach(x -> { if (x != null) remove.add(x.strip().toLowerCase(Locale.ROOT)); });
        Boolean changed = tx.execute(st -> {
            MenteeProfile p = findMentee(userId);
            String[] kept = Arrays.stream(p.getSkills()).filter(x -> !remove.contains(x.toLowerCase(Locale.ROOT)))
                    .toArray(String[]::new);
            if (kept.length == p.getSkills().length) return false;
            p.setSkills(kept);
            menteeRepo.save(p);
            return true;
        });
        if (Boolean.TRUE.equals(changed)) matchingIndexClient.reindexAsync(ROLE_MENTEE, userId);
        return menteeResponse(findMentee(userId));
    }

    // ---------------- Shared ----------------

    // ---- US-37: múi giờ, ảnh đại diện ----

    /** PRD-PROF-6 — múi giờ của chính người dùng; cập nhật mọi hồ sơ (mentor/mentee) của userId. */
    public ProfileSummary updateTimezone(UUID userId, TimezoneInput in) {
        String tz = MentorRules.normalizeTimezone(in.timezone());
        Boolean found = tx.execute(st -> {
            boolean any = false;
            Optional<MentorProfile> mentor = mentorRepo.findById(userId);
            if (mentor.isPresent()) {
                mentor.get().setTimezone(tz);
                mentorRepo.save(mentor.get());
                any = true;
            }
            Optional<MenteeProfile> mentee = menteeRepo.findById(userId);
            if (mentee.isPresent()) {
                mentee.get().setTimezone(tz);
                menteeRepo.save(mentee.get());
                any = true;
            }
            return any;
        });
        if (!Boolean.TRUE.equals(found)) {
            throw ApiException.notFound("PROFILE_NOT_FOUND", "Hãy tạo hồ sơ trước khi đặt múi giờ");
        }
        return summary(userId);
    }

    public AvatarResult uploadAvatar(UUID userId, byte[] data) {
        String type = AvatarRules.detectType(data);
        if (mentorRepo.findById(userId).isEmpty() && menteeRepo.findById(userId).isEmpty()) {
            throw ApiException.notFound("PROFILE_NOT_FOUND", "Hãy tạo hồ sơ trước khi tải ảnh đại diện");
        }
        tx.executeWithoutResult(st -> avatarRepo.save(new ProfileAvatar(userId, type, data, OffsetDateTime.now(clock))));
        return new AvatarResult(avatarUrl(userId));
    }

    public void deleteAvatar(UUID userId) {
        tx.executeWithoutResult(st -> avatarRepo.deleteById(userId));
    }

    public ProfileAvatar avatar(UUID userId) {
        return avatarRepo.findById(userId)
                .orElseThrow(() -> ApiException.notFound("AVATAR_NOT_FOUND", "Người dùng chưa có ảnh đại diện"));
    }

    /** URL công khai kèm ?v= mốc cập nhật để trình duyệt không giữ ảnh cũ trong cache. */
    String avatarUrl(UUID userId) {
        if (avatarRepo == null) return null;
        return avatarRepo.findUpdatedAt(userId).map(at -> avatarPath(userId, at)).orElse(null);
    }

    private Map<UUID, String> avatarUrls(Collection<UUID> ids) {
        Map<UUID, String> out = new HashMap<>();
        if (avatarRepo == null || ids.isEmpty()) return out;
        for (Object[] row : avatarRepo.findUpdatedAtIn(ids)) {
            out.put((UUID) row[0], avatarPath((UUID) row[0], (OffsetDateTime) row[1]));
        }
        return out;
    }

    private static String avatarPath(UUID userId, OffsetDateTime at) {
        return "/api/profile/avatars/" + userId + "?v=" + at.toInstant().toEpochMilli();
    }

    private MenteeProfileResponse menteeResponse(MenteeProfile p) {
        return MenteeProfileResponse.from(p, avatarUrl(p.getUserId()));
    }

    public ProfileSummary summary(UUID userId) {
        return mentorRepo.findById(userId)
                .map(m -> new ProfileSummary(m.getUserId(), m.getDisplayName(), "MENTOR", m.getDomain(), m.getTimezone()))
                .or(() -> menteeRepo.findById(userId)
                        .map(m -> new ProfileSummary(m.getUserId(), m.getDisplayName(), "MENTEE", m.getDomain(), m.getTimezone())))
                .orElseThrow(() -> ApiException.notFound("PROFILE_NOT_FOUND", "Không tìm thấy hồ sơ"));
    }

    /**
     * Gỡ tham chiếu tới CV đã bị xoá ở ai-service. Chỉ gỡ khi hồ sơ đang trỏ ĐÚNG file đó,
     * để không xoá nhầm CV khác người dùng gắn sau. cv_file_url không thuộc text embedding
     * nên không cần báo matching-service. Trả về true nếu có hồ sơ được cập nhật.
     */
    public boolean clearCvFileUrl(UUID userId, String cvFileUrl) {
        Boolean cleared = tx.execute(status -> {
            boolean changed = false;
            Optional<MentorProfile> mentor = mentorRepo.findById(userId);
            if (mentor.isPresent() && cvFileUrl.equals(mentor.get().getCvFileUrl())) {
                mentor.get().setCvFileUrl(null);
                mentorRepo.save(mentor.get());
                changed = true;
            }
            Optional<MenteeProfile> mentee = menteeRepo.findById(userId);
            if (mentee.isPresent() && cvFileUrl.equals(mentee.get().getCvFileUrl())) {
                mentee.get().setCvFileUrl(null);
                menteeRepo.save(mentee.get());
                changed = true;
            }
            return changed;
        });
        return Boolean.TRUE.equals(cleared);
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
