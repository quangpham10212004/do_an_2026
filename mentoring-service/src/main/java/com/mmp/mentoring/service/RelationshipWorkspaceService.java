package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.RelationshipDtos.*;
import com.mmp.mentoring.entity.MentoringRequest;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.entity.RelationshipGoal;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.MentoringRequestRepository;
import com.mmp.mentoring.repository.RelationshipGoalRepository;
import com.mmp.mentoring.repository.SessionRepository;
import com.mmp.mentoring.security.AuthUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * US-28 (PRD-REQ-5) — không gian mentoring. Quan hệ = yêu cầu mentoring đã chấp nhận (id quan hệ = id yêu cầu).
 *
 * - Mục tiêu đầu tiên được tạo "lười" từ goal của yêu cầu ở lần đầu workspace được mở/sửa (không sửa luồng
 *   chấp nhận yêu cầu của Team A). Vì không bao giờ xoá được xuống dưới 1 mục tiêu, "chưa có mục tiêu nào"
 *   tương đương "chưa khởi tạo".
 * - Mọi thao tác ghi chạy dưới khoá advisory theo quan hệ nên giới hạn 1–5 mục tiêu đúng cả khi hai bên sửa cùng lúc.
 * - Tên hiển thị lấy từ profile-service NGOÀI transaction.
 */
@Service
public class RelationshipWorkspaceService {

    private final MentoringRequestRepository requestRepo;
    private final RelationshipGoalRepository goalRepo;
    private final SessionRepository sessionRepo;
    private final ProfileClient profileClient;
    private final SessionNotesService sessionNotes;
    private final TransactionTemplate tx;

    public RelationshipWorkspaceService(MentoringRequestRepository requestRepo, RelationshipGoalRepository goalRepo,
                                        SessionRepository sessionRepo, ProfileClient profileClient,
                                        SessionNotesService sessionNotes, TransactionTemplate tx) {
        this.requestRepo = requestRepo;
        this.goalRepo = goalRepo;
        this.sessionRepo = sessionRepo;
        this.profileClient = profileClient;
        this.sessionNotes = sessionNotes;
        this.tx = tx;
    }

    public WorkspaceView get(AuthUser user, UUID relationshipId) {
        MentoringRequest r = findRelationship(relationshipId);
        GoalRules.requireViewer(user, r.getMentorId(), r.getMenteeId());
        List<RelationshipGoal> goals = tx.execute(s -> {
            goalRepo.lockRelationship(relationshipId);
            return ensureSeeded(r);
        });
        List<WorkspaceSession> sessions = sessionRepo.findByMenteeIdOrderByScheduledAtDesc(r.getMenteeId()).stream()
                .filter(sess -> belongsTo(sess, r))
                .map(WorkspaceSession::from)
                .toList();
        Map<UUID, String> names = profileClient.displayNames(List.of(r.getMentorId(), r.getMenteeId()));
        String status = r.getStatus().name();
        boolean readOnly = GoalRules.isReadOnly(status);
        // US-40 — việc còn mở của cặp (mang sang từ các phiên); admin không xem ghi chú/action item.
        var actionItems = GoalRules.isParticipant(user, r.getMentorId(), r.getMenteeId())
                ? sessionNotes.openItemsForPair(r.getMenteeId(), r.getMentorId()) : List.<com.mmp.mentoring.dto.SessionNotesDtos.ActionItemView>of();
        return new WorkspaceView(summary(r, names), goals.stream().map(GoalView::from).toList(), sessions, readOnly,
                !readOnly && GoalRules.isParticipant(user, r.getMentorId(), r.getMenteeId()), GoalRules.MAX_GOALS, actionItems);
    }

    public GoalView addGoal(AuthUser user, UUID relationshipId, GoalInput in) {
        String text = GoalRules.validateText(in.text());
        return GoalView.from(write(user, relationshipId, (r, goals) -> {
            GoalRules.requireCanAdd(goals.size());
            int next = goals.stream().mapToInt(RelationshipGoal::getPosition).max().orElse(-1) + 1;
            return goalRepo.save(new RelationshipGoal(relationshipId, text, next, user.userId(), OffsetDateTime.now()));
        }));
    }

    public GoalView updateGoal(AuthUser user, UUID relationshipId, UUID goalId, GoalUpdate in) {
        if (in.text() == null && in.status() == null) {
            throw ApiException.badRequest("INVALID_GOAL", "Cần nhập nội dung hoặc trạng thái mới của mục tiêu");
        }
        String text = in.text() == null ? null : GoalRules.validateText(in.text());
        return GoalView.from(write(user, relationshipId, (r, goals) -> {
            RelationshipGoal g = find(goals, goalId);
            g.edit(text, in.status(), OffsetDateTime.now());
            return goalRepo.save(g);
        }));
    }

    public void deleteGoal(AuthUser user, UUID relationshipId, UUID goalId) {
        write(user, relationshipId, (r, goals) -> {
            RelationshipGoal g = find(goals, goalId);
            GoalRules.requireCanDelete(goals.size());
            goalRepo.delete(g);
            // Dồn lại vị trí 0..n-1 để thứ tự luôn liền mạch.
            OffsetDateTime now = OffsetDateTime.now();
            int pos = 0;
            for (RelationshipGoal other : goals) {
                if (!other.getId().equals(goalId)) other.moveTo(pos++, now);
            }
            return g;
        });
    }

    public List<GoalView> reorder(AuthUser user, UUID relationshipId, GoalOrder in) {
        return write(user, relationshipId, (r, goals) -> {
            GoalRules.validateOrder(in.goalIds(), goals.stream().map(RelationshipGoal::getId).toList());
            Map<UUID, RelationshipGoal> byId = goals.stream().collect(Collectors.toMap(RelationshipGoal::getId, Function.identity()));
            OffsetDateTime now = OffsetDateTime.now();
            for (int i = 0; i < in.goalIds().size(); i++) {
                byId.get(in.goalIds().get(i)).moveTo(i, now);
            }
            goalRepo.saveAll(goals);
            return goalRepo.findByRelationshipIdOrderByPositionAscCreatedAtAsc(relationshipId);
        }).stream().map(GoalView::from).toList();
    }

    // ------------------------------------------------------------------

    @FunctionalInterface
    private interface GoalWrite<T> {
        T apply(MentoringRequest request, List<RelationshipGoal> goals);
    }

    /** Kiểm tra quyền + trạng thái, khoá quan hệ, khởi tạo mục tiêu đầu nếu chưa có rồi chạy thao tác ghi. */
    private <T> T write(AuthUser user, UUID relationshipId, GoalWrite<T> op) {
        return tx.execute(s -> {
            MentoringRequest r = findRelationship(relationshipId);
            GoalRules.requireEditor(user, r.getMentorId(), r.getMenteeId(), r.getStatus().name());
            goalRepo.lockRelationship(relationshipId);
            return op.apply(r, ensureSeeded(r));
        });
    }

    /** Trong transaction đã khoá: tạo mục tiêu đầu tiên từ goal của yêu cầu nếu quan hệ chưa có mục tiêu nào. */
    private List<RelationshipGoal> ensureSeeded(MentoringRequest r) {
        List<RelationshipGoal> goals = goalRepo.findByRelationshipIdOrderByPositionAscCreatedAtAsc(r.getId());
        if (!goals.isEmpty()) return goals;
        RelationshipGoal first = goalRepo.save(new RelationshipGoal(r.getId(), GoalRules.seedText(r.getGoal()), 0, null,
                OffsetDateTime.now()));
        return new java.util.ArrayList<>(List.of(first));
    }

    private MentoringRequest findRelationship(UUID id) {
        return requestRepo.findById(id)
                .filter(r -> GoalRules.isRelationship(r.getStatus().name()))
                .orElseThrow(() -> ApiException.notFound("RELATIONSHIP_NOT_FOUND", "Không tìm thấy quan hệ mentoring"));
    }

    private static RelationshipGoal find(List<RelationshipGoal> goals, UUID goalId) {
        return goals.stream().filter(g -> g.getId().equals(goalId)).findFirst()
                .orElseThrow(() -> ApiException.notFound("GOAL_NOT_FOUND", "Không tìm thấy mục tiêu"));
    }

    /** Phiên của quan hệ: gắn đúng yêu cầu này, hoặc phiên cũ không gắn yêu cầu của cùng cặp mentor–mentee. */
    static boolean belongsTo(MentoringSession s, MentoringRequest r) {
        if (!Objects.equals(s.getMentorId(), r.getMentorId()) || !Objects.equals(s.getMenteeId(), r.getMenteeId())) {
            return false;
        }
        return s.getRequestId() == null || s.getRequestId().equals(r.getId());
    }

    private static RelationshipSummary summary(MentoringRequest r, Map<UUID, String> names) {
        return new RelationshipSummary(r.getId(), r.getMentorId(), names.get(r.getMentorId()), r.getMenteeId(),
                names.get(r.getMenteeId()), r.getGoal(), r.getSessionType() == null ? null : r.getSessionType().name(),
                r.getFrequency() == null ? null : r.getFrequency().name(), r.getExpectedDurationMonths(),
                r.getStatus().name(), r.getCreatedAt(), r.getRespondedAt());
    }
}
