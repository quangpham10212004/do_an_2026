package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.MockInterviewDtos.*;
import com.mmp.mentoring.entity.ActionItem;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.entity.MockIntake;
import com.mmp.mentoring.entity.MockScorecard;
import com.mmp.mentoring.entity.SessionType;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.ActionItemRepository;
import com.mmp.mentoring.repository.MockIntakeRepository;
import com.mmp.mentoring.repository.MockScorecardRepository;
import com.mmp.mentoring.repository.SessionRepository;
import com.mmp.mentoring.security.AuthUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * US-58 (PRD-PREP-1..5, 7) — phỏng vấn thử với mentor.
 * <ul>
 *   <li>Intake lưu lúc đặt phiên (SessionService.book).</li>
 *   <li>Sau giờ kết thúc, mentor điền phiếu (4 tiêu chí 0–10 theo trọng số của dạng phỏng vấn, kết luận, đúng 3 điểm cần
 *   sửa). Lần nộp đầu tạo 3 việc cần làm cho mentee (mang sang phiên sau như mọi action item).</li>
 *   <li>Phiếu chỉ mentee và mentor của phiên xem được (Q66); ghi chú riêng chỉ cho mentee.</li>
 *   <li>Job: nhắc mentor ở 12 giờ / 36 giờ; 48 giờ chưa có phiếu → đánh dấu thiếu phiếu (thu nhập vẫn giải phóng 48 giờ).</li>
 * </ul>
 */
@Service
public class MockInterviewService {

    private static final Logger log = LoggerFactory.getLogger(MockInterviewService.class);

    private final SessionRepository sessionRepo;
    private final MockIntakeRepository intakeRepo;
    private final MockScorecardRepository scorecardRepo;
    private final ActionItemRepository itemRepo;
    private final ProfileClient profileClient;
    private final NotificationService notifications;
    private final TransactionTemplate tx;

    public MockInterviewService(SessionRepository sessionRepo, MockIntakeRepository intakeRepo, MockScorecardRepository scorecardRepo,
                                ActionItemRepository itemRepo, ProfileClient profileClient, NotificationService notifications,
                                TransactionTemplate tx) {
        this.sessionRepo = sessionRepo;
        this.intakeRepo = intakeRepo;
        this.scorecardRepo = scorecardRepo;
        this.itemRepo = itemRepo;
        this.profileClient = profileClient;
        this.notifications = notifications;
        this.tx = tx;
    }

    public MockInterviewView get(AuthUser user, UUID sessionId) {
        MentoringSession s = mockSession(sessionId);
        String role = requireViewer(user, s);
        MockIntake intake = intakeRepo.findById(sessionId).orElse(null);
        MockScorecard card = scorecardRepo.findById(sessionId).orElse(null);
        boolean isMentor = "MENTOR".equals(role);
        // Ghi chú riêng là lời nhắn mentor gửi mentee — chỉ mentor (người viết) và mentee thấy, admin thì không
        ScorecardView cardView = card == null ? null : view(card, name(card.getMentorId()), !"ADMIN".equals(role));
        OffsetDateTime now = OffsetDateTime.now();
        boolean canScore = isMentor && intake != null && scorableNow(s, now);
        return new MockInterviewView(s.getId(), role, s.getStatus().name(), s.getScheduledAt(), s.endsAt(),
                intake == null ? null : view(intake), cardView, canScore, s.endsAt().plus(MockInterviewRules.MISSING_AFTER),
                card == null && scorecardRepo.isMissing(sessionId), weights());
    }

    /** PRD-PREP-2 — mentor nộp / sửa phiếu. Lần nộp đầu: 3 điểm cần sửa → 3 việc cần làm của mentee, báo mentee. */
    public MockInterviewView submit(AuthUser mentor, UUID sessionId, ScorecardInput in) {
        MockInterviewRules.requireScore("kỹ thuật", in.technical());
        MockInterviewRules.requireScore("giải quyết vấn đề", in.problemSolving());
        MockInterviewRules.requireScore("chiều sâu", in.depth());
        MockInterviewRules.requireScore("giao tiếp", in.communication());
        if (in.liveCoding() != null) MockInterviewRules.requireScore("live coding", in.liveCoding());
        List<String> fixes = MockInterviewRules.fixes(in.fixes());
        String note = MentoringRequestService.trimToNull(in.privateNote());
        if (note != null && note.length() > MockInterviewRules.NOTE_MAX) {
            throw ApiException.badRequest("INVALID_NOTE", "Ghi chú tối đa " + MockInterviewRules.NOTE_MAX + " ký tự");
        }
        boolean[] first = {false};
        MentoringSession session = tx.execute(st -> {
            MentoringSession s = mockSession(sessionId);
            if (!mentor.userId().equals(s.getMentorId())) {
                throw ApiException.forbidden("Chỉ mentor của phiên mới điền phiếu đánh giá");
            }
            OffsetDateTime now = OffsetDateTime.now();
            MockInterviewRules.requireScorable(s.getStatus().name(), s.endsAt(), now);
            MockIntake intake = intakeRepo.findById(sessionId)
                    .orElseThrow(() -> ApiException.conflict("MOCK_INTAKE_MISSING", "Phiên chưa có thông tin phỏng vấn thử"));
            MockScorecard card = scorecardRepo.findById(sessionId).orElse(null);
            if (card == null) {
                card = new MockScorecard(s, intake.getInterviewType(), now);
                first[0] = true;
            }
            card.write(in.technical(), in.problemSolving(), in.depth(), in.communication(), in.liveCoding(),
                    MockInterviewRules.overall(intake.getInterviewType(), in.technical(), in.problemSolving(), in.depth(), in.communication()),
                    in.verdict(), fixes.toArray(String[]::new), note, now);
            scorecardRepo.save(card);
            if (first[0]) {
                for (String fix : fixes) {
                    itemRepo.save(new ActionItem(s, fix, ActionItem.Owner.MENTEE, null, mentor.userId(), now));
                }
                scorecardRepo.clearMissing(sessionId);
            }
            return s;
        });
        if (first[0]) {
            notifications.notifyUser(session.getMenteeId(), "MOCK_SCORECARD_READY", "Đã có kết quả phỏng vấn thử",
                    "Mentor đã chấm buổi phỏng vấn thử của bạn và gợi ý 3 điểm cần cải thiện.",
                    "/mentoring/sessions/" + sessionId + "/mock");
            log.info("Mock scorecard submitted for session {}", sessionId);
        }
        return get(mentor, sessionId);
    }

    /** PRD-PREP-4 — lịch sử phiếu của mentee đang đăng nhập, theo ngày phỏng vấn cũ → mới (theo dõi tiến bộ). */
    public List<MockHistoryItem> history(AuthUser mentee) {
        List<MockScorecard> cards = scorecardRepo.findByMenteeIdOrderByCreatedAtAsc(mentee.userId());
        if (cards.isEmpty()) return List.of();
        Map<UUID, String> names = profileClient.displayNames(cards.stream().map(MockScorecard::getMentorId).distinct().toList());
        Map<UUID, MentoringSession> sessions = new java.util.HashMap<>();
        sessionRepo.findAllById(cards.stream().map(MockScorecard::getSessionId).toList()).forEach(x -> sessions.put(x.getId(), x));
        return cards.stream().map(c -> new MockHistoryItem(c.getSessionId(),
                sessions.containsKey(c.getSessionId()) ? sessions.get(c.getSessionId()).getScheduledAt() : c.getCreatedAt(),
                c.getMentorId(), names.get(c.getMentorId()), c.getInterviewType(), c.getTechnical(), c.getProblemSolving(),
                c.getDepth(), c.getCommunication(), c.getLiveCoding(), c.getOverall(), c.getVerdict()))
                .sorted(java.util.Comparator.comparing(MockHistoryItem::scheduledAt)) // theo ngày phỏng vấn, không theo lúc chấm
                .toList();
    }

    /** PRD-PREP-2 — nhắc mentor 12 giờ / 36 giờ sau phiên; 48 giờ chưa có phiếu → đánh dấu thiếu phiếu. */
    public int runScorecardJob(OffsetDateTime now) {
        int n = 0;
        for (Object[] row : scorecardRepo.findAwaitingScorecard(now.minus(MockInterviewRules.REMIND_FIRST))) {
            UUID id = UUID.fromString((String) row[0]);
            OffsetDateTime endsAt = toOffset(row[1]);
            MockInterviewRules.Due due = MockInterviewRules.due(endsAt, now, Boolean.TRUE.equals(row[2]), Boolean.TRUE.equals(row[3]));
            if (due == null) continue;
            Integer claimed = tx.execute(st -> switch (due) {
                case REMIND_12H -> scorecardRepo.claimReminder12h(id, now);
                case REMIND_36H -> scorecardRepo.claimReminder36h(id, now);
                case MISSING -> scorecardRepo.markMissing(id, now);
            });
            if (claimed == null || claimed == 0) continue;
            n++;
            sessionRepo.findById(id).ifPresent(s -> {
                String link = "/mentoring/sessions/" + id + "/mock";
                if (due == MockInterviewRules.Due.MISSING) {
                    log.info("Mock session {} marked scorecard missing", id);
                    notifications.notifyUser(s.getMentorId(), "MOCK_SCORECARD_MISSING", "Phiếu phỏng vấn thử bị đánh dấu thiếu",
                            "Đã quá 48 giờ mà chưa có phiếu đánh giá. Phiên bị đánh dấu thiếu phiếu (ảnh hưởng thứ hạng phỏng vấn thử); "
                                    + "bạn vẫn có thể nộp phiếu trong 7 ngày sau phiên.", link);
                } else {
                    notifications.notifyUser(s.getMentorId(), "MOCK_SCORECARD_REMINDER", "Nhắc điền phiếu phỏng vấn thử",
                            "Mentee đang chờ phiếu đánh giá buổi phỏng vấn thử. Hạn: 48 giờ sau phiên.", link);
                }
            });
        }
        return n;
    }

    // ---- helpers ----

    private MentoringSession mockSession(UUID sessionId) {
        MentoringSession s = sessionRepo.findById(sessionId)
                .orElseThrow(() -> ApiException.notFound("SESSION_NOT_FOUND", "Không tìm thấy phiên"));
        if (s.getSessionType() != SessionType.MOCK_INTERVIEW) {
            throw ApiException.notFound("NOT_MOCK_INTERVIEW", "Phiên này không phải phỏng vấn thử");
        }
        return s;
    }

    /** "MENTOR" | "MENTEE"; admin xem như mentor nhưng không được chấm (Q66 — phiếu riêng tư của hai bên). */
    private static String requireViewer(AuthUser user, MentoringSession s) {
        if (user.userId().equals(s.getMentorId())) return "MENTOR";
        if (user.userId().equals(s.getMenteeId())) return "MENTEE";
        if (user.isAdmin()) return "ADMIN";
        throw ApiException.forbidden("Bạn không có quyền xem phỏng vấn thử này");
    }

    private static boolean scorableNow(MentoringSession s, OffsetDateTime now) {
        return !now.isBefore(s.endsAt()) && MockInterviewRules.scorable(s.getStatus().name())
                && !now.isAfter(s.endsAt().plus(MockInterviewRules.EDIT_WINDOW));
    }

    private String name(UUID userId) {
        return profileClient.displayNames(List.of(userId)).get(userId);
    }

    static MockIntakeView view(MockIntake i) {
        return new MockIntakeView(i.getInterviewType(), i.getLevel(), i.getTargetRole(), i.getTargetCompany(),
                i.getInterviewDate(), i.getJdUrl());
    }

    static ScorecardView view(MockScorecard c, String mentorName, boolean withNote) {
        return new ScorecardView(c.getSessionId(), c.getMentorId(), mentorName, c.getInterviewType(), c.getTechnical(),
                c.getProblemSolving(), c.getDepth(), c.getCommunication(), c.getLiveCoding(), c.getOverall(), c.getVerdict(),
                List.of(c.getFixes()), withNote ? c.getPrivateNote() : null, c.getCreatedAt(), c.getUpdatedAt());
    }

    static Map<MockIntake.InterviewType, WeightsView> weights() {
        Map<MockIntake.InterviewType, WeightsView> m = new EnumMap<>(MockIntake.InterviewType.class);
        MockInterviewRules.WEIGHTS.forEach((k, w) -> m.put(k, new WeightsView(w.technical(), w.problemSolving(), w.depth(), w.communication())));
        return m;
    }

    /** Native query trả timestamptz theo kiểu tuỳ driver/Hibernate. */
    static OffsetDateTime toOffset(Object o) {
        if (o instanceof OffsetDateTime odt) return odt;
        if (o instanceof Instant i) return i.atOffset(ZoneOffset.UTC);
        if (o instanceof Timestamp t) return t.toInstant().atOffset(ZoneOffset.UTC);
        if (o instanceof java.time.ZonedDateTime z) return z.toOffsetDateTime();
        throw new IllegalArgumentException("Unexpected timestamp type " + (o == null ? null : o.getClass()));
    }
}
