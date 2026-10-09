package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.SessionRepository;
import com.mmp.mentoring.security.AuthUser;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * US-34 (PRD-SES-13) — "Thêm vào lịch": file .ics của một phiên cho mentor/mentee. Có từ khi phiên CONFIRMED; phiên đã
 * dời lịch có SEQUENCE lớn hơn nên tải lại sẽ cập nhật sự kiện cũ; phiên huỷ / hết hạn trả file huỷ sự kiện.
 */
@Service
public class CalendarService {

    private static final Set<MentoringSession.Status> CANCELLED = Set.of(MentoringSession.Status.CANCELLED, MentoringSession.Status.EXPIRED);
    private static final Map<String, String> TYPE_LABELS = Map.of(
            "CAREER_ADVICE", "Tư vấn nghề nghiệp", "CODE_REVIEW", "Review code",
            "MOCK_INTERVIEW", "Phỏng vấn thử", "PROJECT_GUIDANCE", "Hướng dẫn dự án");

    private final SessionRepository sessionRepo;
    private final ProfileClient profileClient;
    private final String frontendUrl;

    public CalendarService(SessionRepository sessionRepo, ProfileClient profileClient,
                           @Value("${app.frontend-url}") String frontendUrl) {
        this.sessionRepo = sessionRepo;
        this.profileClient = profileClient;
        this.frontendUrl = frontendUrl.replaceAll("/+$", "");
    }

    public record IcsFile(String filename, String content) {
    }

    public IcsFile ics(AuthUser user, UUID sessionId) {
        MentoringSession s = sessionRepo.findById(sessionId)
                .orElseThrow(() -> ApiException.notFound("SESSION_NOT_FOUND", "Không tìm thấy phiên mentoring"));
        if (!GoalRules.isParticipant(user, s.getMentorId(), s.getMenteeId())) {
            throw ApiException.forbidden("Chỉ mentor và mentee của phiên tải được lịch");
        }
        if (s.getStatus() == MentoringSession.Status.PENDING) {
            throw ApiException.conflict("SESSION_NOT_CONFIRMED", "Phiên chưa được xác nhận (chờ thanh toán) — chưa thể thêm vào lịch");
        }
        boolean cancelled = CANCELLED.contains(s.getStatus());
        UUID other = user.userId().equals(s.getMentorId()) ? s.getMenteeId() : s.getMentorId();
        Map<UUID, String> names = profileClient.displayNames(List.of(s.getMentorId(), other));
        String type = s.getSessionType() == null ? null : TYPE_LABELS.get(s.getSessionType().name());
        String summary = "Mentoring" + (type == null ? "" : " · " + type) + " với " + names.getOrDefault(other, "Người dùng");
        String link = MeetingLinks.visibleFor(s.getStatus()) ? s.getMeetingLink() : null;
        String page = frontendUrl + "/mentoring/sessions/" + s.getId() + "/notes";
        StringBuilder desc = new StringBuilder();
        if (s.getTopic() != null && !s.getTopic().isBlank()) desc.append("Chủ đề: ").append(s.getTopic()).append("\n");
        if (s.getAgenda() != null && !s.getAgenda().isBlank()) desc.append("Agenda: ").append(s.getAgenda().strip()).append("\n");
        desc.append(link == null ? "Link phòng họp: mentor sẽ cập nhật trên MentorHub.\n" : "Link tham gia: " + link + "\n");
        desc.append("Ghi chú phiên: ").append(page);
        String content = IcsCalendar.build(new IcsCalendar.Event(s.getId(), s.getScheduledAt(), s.getDurationMinutes(),
                s.getRescheduleCount(), cancelled, summary, desc.toString(), link, page, names.get(s.getMentorId())),
                OffsetDateTime.now());
        return new IcsFile("mentoring-" + s.getScheduledAt().toLocalDate() + "-" + s.getId().toString().substring(0, 8) + ".ics", content);
    }
}
