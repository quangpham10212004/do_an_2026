package com.mmp.profile.service;

import com.mmp.profile.client.AuditClient;
import com.mmp.profile.client.MentoringClient;
import com.mmp.profile.dto.ProfileDtos.AdminMentorRow;
import com.mmp.profile.dto.ProfileDtos.SuspensionResult;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.UUID;

@Service
public class MentorVerificationRevocationService {
    private final MentorDomainService domains;
    private final MentoringClient mentoring;
    private final ProfileService profiles;
    private final AuditClient audit;

    public MentorVerificationRevocationService(MentorDomainService domains, MentoringClient mentoring,
                                               ProfileService profiles, AuditClient audit) {
        this.domains = domains;
        this.mentoring = mentoring;
        this.profiles = profiles;
        this.audit = audit;
    }

    public SuspensionResult revoke(UUID mentorId, String rawReason, UUID adminId) {
        String reason = MentorRules.validateSuspendReason(rawReason);
        var mentor = domains.revokeVerification(mentorId, reason);
        var cancellation = mentoring.cancelForVerificationRevocation(mentorId, reason, adminId);
        audit.recordAsync(adminId, "ADMIN", "MENTOR_VERIFICATION_REVOKED", "MENTOR", mentorId.toString(),
                null, Map.of("reason", reason, "mentoringNotified", cancellation.notified()));
        return new SuspensionResult(AdminMentorRow.from(mentor, profiles.effectiveStatus(mentor)),
                cancellation.notified(), cancellation.cancelledSessions(), cancellation.notified() ? null :
                "Đã thu hồi xác thực. Chưa xác nhận được việc hủy các phiên sắp tới. Hãy thử lại.");
    }
}
