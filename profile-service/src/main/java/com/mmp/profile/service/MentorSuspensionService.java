package com.mmp.profile.service;

import com.mmp.profile.client.AuditClient;
import com.mmp.profile.client.MentoringClient;
import com.mmp.profile.dto.ProfileDtos.AdminMentorRow;
import com.mmp.profile.dto.ProfileDtos.PageResponse;
import com.mmp.profile.dto.ProfileDtos.SuspensionResult;
import com.mmp.profile.entity.MentorProfile;
import com.mmp.profile.entity.MentorProfile.Status;
import com.mmp.profile.exception.ApiException;
import com.mmp.profile.repository.MentorProfileRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * US-27 (PRD-ADM-3) — admin đình chỉ / gỡ đình chỉ mentor.
 *
 * Đình chỉ chỉ là trạng thái hồ sơ (SUSPENDED), tách khỏi khoá tài khoản ở auth-service: mentor vẫn đăng
 * nhập được. Hệ quả: matching-service loại mentor (đọc status từ profile_db), mentoring-service từ chối yêu
 * cầu/đặt lịch mới (đọc status qua GET /internal/mentor/{id}). Sau khi commit, báo mentoring-service huỷ các
 * phiên tương lai (best-effort) rồi ghi audit log (bắn rồi quên) — không gọi mạng trong transaction.
 */
@Service
public class MentorSuspensionService {

    public static final String ACTION_SUSPENDED = "MENTOR_SUSPENDED";
    public static final String ACTION_UNSUSPENDED = "MENTOR_UNSUSPENDED";
    static final String TARGET_TYPE = "MENTOR";

    static final String WARN_NOT_NOTIFIED = "Đã tạm ngưng mentor nhưng chưa báo được dịch vụ mentoring để huỷ các phiên sắp tới "
            + "— mentor vẫn bị chặn nhận yêu cầu/đặt lịch mới; hãy thử lại sau hoặc kiểm tra các phiên của mentor.";

    private final MentorProfileRepository mentorRepo;
    private final MentoringClient mentoringClient;
    private final AuditClient auditClient;
    private final TransactionTemplate tx;
    private final Clock clock;

    public MentorSuspensionService(MentorProfileRepository mentorRepo, MentoringClient mentoringClient,
                                   AuditClient auditClient, TransactionTemplate tx, Clock clock) {
        this.mentorRepo = mentorRepo;
        this.mentoringClient = mentoringClient;
        this.auditClient = auditClient;
        this.tx = tx;
        this.clock = clock;
    }

    public PageResponse<AdminMentorRow> list(String q, String status, String verification, int page, int size) {
        Page<MentorProfile> result = mentorRepo.adminSearch(blankToNull(q), parse(Status.class, status, "status"),
                parse(MentorProfile.VerificationStatus.class, verification, "verification"),
                PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100)));
        return new PageResponse<>(result.map(m -> AdminMentorRow.from(m, effectiveStatus(m))).getContent(),
                result.getNumber(), result.getSize(), result.getTotalElements(), result.getTotalPages());
    }

    public SuspensionResult suspend(UUID mentorId, String rawReason, UUID adminId) {
        String reason = MentorRules.validateSuspendReason(rawReason);
        OffsetDateTime now = OffsetDateTime.now(clock);
        Status[] before = new Status[1];
        MentorProfile saved = tx.execute(s -> {
            MentorProfile p = findMentor(mentorId);
            before[0] = effectiveStatus(p);
            MentorRules.requireSuspendable(before[0]);
            p.suspend(reason, adminId, now);
            return mentorRepo.save(p);
        });

        MentoringClient.SuspendResult cancel = mentoringClient.suspendMentor(mentorId, reason, adminId);
        Map<String, Object> after = new LinkedHashMap<>();
        after.put("status", Status.SUSPENDED.name());
        after.put("reason", reason);
        after.put("cancelledSessions", cancel.cancelledSessions());
        after.put("mentoringNotified", cancel.notified());
        auditClient.recordAsync(adminId, "ADMIN", ACTION_SUSPENDED, TARGET_TYPE, mentorId.toString(),
                Map.of("status", before[0].name()), after);
        return new SuspensionResult(AdminMentorRow.from(saved, Status.SUSPENDED), cancel.notified(),
                cancel.cancelledSessions(), cancel.notified() ? null : WARN_NOT_NOTIFIED);
    }

    public SuspensionResult unsuspend(UUID mentorId, UUID adminId) {
        OffsetDateTime now = OffsetDateTime.now(clock);
        String[] previousReason = new String[1];
        MentorProfile saved = tx.execute(s -> {
            MentorProfile p = findMentor(mentorId);
            MentorRules.requireUnsuspendable(effectiveStatus(p));
            previousReason[0] = p.getSuspendedReason();
            p.unsuspend(now);
            return mentorRepo.save(p);
        });
        Map<String, Object> before = new LinkedHashMap<>();
        before.put("status", Status.SUSPENDED.name());
        before.put("reason", previousReason[0]);
        auditClient.recordAsync(adminId, "ADMIN", ACTION_UNSUSPENDED, TARGET_TYPE, mentorId.toString(),
                before, Map.of("status", Status.ACCEPTING.name()));
        return new SuspensionResult(AdminMentorRow.from(saved, Status.ACCEPTING), false, null, null);
    }

    private Status effectiveStatus(MentorProfile p) {
        LocalDate today = LocalDate.now(clock.withZone(MentorRules.zoneOf(p.getTimezone())));
        return MentorRules.effectiveStatus(p.getStatus(), p.getOnLeaveUntil(), today);
    }

    private MentorProfile findMentor(UUID id) {
        return mentorRepo.findById(id)
                .orElseThrow(() -> ApiException.notFound("PROFILE_NOT_FOUND", "Không tìm thấy hồ sơ mentor"));
    }

    private static <E extends Enum<E>> E parse(Class<E> type, String value, String name) {
        String v = blankToNull(value);
        if (v == null) return null;
        try {
            return Enum.valueOf(type, v.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("BAD_REQUEST", name + " không hợp lệ: " + v);
        }
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
