package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.RelationshipDtos.*;
import com.mmp.mentoring.entity.MentoringRequest;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.entity.RelationshipGoal;
import com.mmp.mentoring.entity.SessionType;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.MentoringRequestRepository;
import com.mmp.mentoring.repository.RelationshipGoalRepository;
import com.mmp.mentoring.repository.SessionRepository;
import com.mmp.mentoring.security.AuthUser;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** US-28 (PRD-REQ-5) — không gian mentoring: mục tiêu 1–5, quyền, chỉ đọc khi không còn ACCEPTED. */
class RelationshipWorkspaceTest {

    private static final String LONG_GOAL = "Tôi muốn trở thành backend developer trong 6 tháng, nắm vững Spring Boot "
            + "và thiết kế REST API.";

    private final MentoringRequestRepository requestRepo = mock(MentoringRequestRepository.class);
    private final RelationshipGoalRepository goalRepo = mock(RelationshipGoalRepository.class);
    private final SessionRepository sessionRepo = mock(SessionRepository.class);
    private final ProfileClient profileClient = mock(ProfileClient.class);
    private final TransactionTemplate tx = mock(TransactionTemplate.class);
    private final RelationshipWorkspaceService service =
            new RelationshipWorkspaceService(requestRepo, goalRepo, sessionRepo, profileClient, tx);

    private final UUID mentorId = UUID.randomUUID();
    private final UUID menteeId = UUID.randomUUID();
    private final AuthUser mentor = new AuthUser(mentorId, "m@x", "MENTOR");
    private final AuthUser mentee = new AuthUser(menteeId, "e@x", "MENTEE");
    private final AuthUser admin = new AuthUser(UUID.randomUUID(), "a@x", "ADMIN");
    private final AuthUser stranger = new AuthUser(UUID.randomUUID(), "s@x", "MENTEE");
    private final MentoringRequest request = new MentoringRequest(menteeId, mentorId, LONG_GOAL, SessionType.CODE_REVIEW,
            MentoringRequest.Frequency.WEEKLY, 3, "Xin chào");
    private final UUID relId = UUID.randomUUID();
    /** "Bảng" relationship_goals giả. */
    private final List<RelationshipGoal> store = new ArrayList<>();

    @SuppressWarnings("unchecked")
    RelationshipWorkspaceTest() {
        ReflectionTestUtils.setField(request, "id", relId);
        request.setStatus(MentoringRequest.Status.ACCEPTED);
        when(requestRepo.findById(relId)).thenReturn(Optional.of(request));
        when(tx.execute(any())).thenAnswer(inv -> ((TransactionCallback<Object>) inv.getArgument(0)).doInTransaction(null));
        when(goalRepo.findByRelationshipIdOrderByPositionAscCreatedAtAsc(relId)).thenAnswer(inv -> {
            List<RelationshipGoal> sorted = new ArrayList<>(store);
            sorted.sort(Comparator.comparingInt(RelationshipGoal::getPosition));
            return sorted;
        });
        when(goalRepo.save(any())).thenAnswer(inv -> {
            RelationshipGoal g = inv.getArgument(0);
            if (g.getId() == null) {
                ReflectionTestUtils.setField(g, "id", UUID.randomUUID());
                store.add(g);
            }
            return g;
        });
        doAnswer(inv -> store.remove((RelationshipGoal) inv.getArgument(0))).when(goalRepo).delete(any());
        when(profileClient.displayNames(any())).thenReturn(Map.of(mentorId, "Mentor A", menteeId, "Mentee B"));
    }

    private static void assertError(Runnable r, HttpStatus status, String code) {
        assertThatThrownBy(r::run).isInstanceOf(ApiException.class).satisfies(e -> {
            assertThat(((ApiException) e).getStatus()).isEqualTo(status);
            assertThat(((ApiException) e).getCode()).isEqualTo(code);
        });
    }

    private UUID addGoal(AuthUser who, String text) {
        return service.addGoal(who, relId, new GoalInput(text)).id();
    }

    // ---------------- GoalRules (thuần) ----------------

    @Test
    void textMustBe5To300CharsAfterTrim() {
        assertError(() -> GoalRules.validateText("  abc  "), HttpStatus.BAD_REQUEST, "INVALID_GOAL");
        assertError(() -> GoalRules.validateText(null), HttpStatus.BAD_REQUEST, "INVALID_GOAL");
        assertError(() -> GoalRules.validateText("x".repeat(301)), HttpStatus.BAD_REQUEST, "INVALID_GOAL");
        assertThat(GoalRules.validateText("  Học   Docker ")).isEqualTo("Học Docker");
        assertThat(GoalRules.validateText("x".repeat(300))).hasSize(300);
    }

    @Test
    void seedTextIsCutAtAWordBoundaryAndFallsBackForTooShortGoals() {
        assertThat(GoalRules.seedText(LONG_GOAL)).isEqualTo(LONG_GOAL);
        String longGoal = "học Spring Boot ".repeat(60);
        String seeded = GoalRules.seedText(longGoal);
        assertThat(seeded.length()).isLessThanOrEqualTo(300).isGreaterThan(150);
        assertThat(seeded).endsWith("…").doesNotContain("  ");
        assertThat(GoalRules.seedText("ab")).isEqualTo(GoalRules.FALLBACK_GOAL);
        assertThat(GoalRules.seedText(null)).isEqualTo(GoalRules.FALLBACK_GOAL);
    }

    @Test
    void onlyAcceptedRelationshipsAreEditableAndNeverAcceptedRequestsHaveNoWorkspace() {
        assertThat(GoalRules.isReadOnly("ACCEPTED")).isFalse();
        for (String s : List.of("ENDED", "COMPLETED", "SOMETHING_NEW")) {
            assertThat(GoalRules.isReadOnly(s)).isTrue();
            assertThat(GoalRules.isRelationship(s)).isTrue();
        }
        for (String s : List.of("PENDING", "REJECTED", "CANCELLED", "EXPIRED")) {
            assertThat(GoalRules.isRelationship(s)).isFalse();
        }
    }

    @Test
    void orderMustBeAPermutationOfTheExistingGoals() {
        UUID a = UUID.randomUUID(), b = UUID.randomUUID();
        GoalRules.validateOrder(List.of(b, a), List.of(a, b));
        assertError(() -> GoalRules.validateOrder(List.of(a), List.of(a, b)), HttpStatus.BAD_REQUEST, "INVALID_GOAL_ORDER");
        assertError(() -> GoalRules.validateOrder(List.of(a, a), List.of(a, b)), HttpStatus.BAD_REQUEST, "INVALID_GOAL_ORDER");
        assertError(() -> GoalRules.validateOrder(List.of(a, UUID.randomUUID()), List.of(a, b)), HttpStatus.BAD_REQUEST, "INVALID_GOAL_ORDER");
        assertError(() -> GoalRules.validateOrder(null, List.of(a)), HttpStatus.BAD_REQUEST, "INVALID_GOAL_ORDER");
    }

    // ---------------- Service ----------------

    @Test
    void firstOpenSeedsOneGoalFromTheRequestOnlyOnce() {
        WorkspaceView view = service.get(mentee, relId);
        assertThat(view.goals()).hasSize(1);
        assertThat(view.goals().get(0).text()).isEqualTo(LONG_GOAL);
        assertThat(view.goals().get(0).createdBy()).isNull();
        assertThat(view.goals().get(0).status()).isEqualTo("TODO");
        assertThat(view.request().mentorName()).isEqualTo("Mentor A");
        assertThat(view.request().status()).isEqualTo("ACCEPTED");
        assertThat(view.readOnly()).isFalse();
        assertThat(view.canEdit()).isTrue();

        service.get(mentor, relId);
        assertThat(store).hasSize(1);
        verify(goalRepo, times(2)).lockRelationship(relId);
    }

    @Test
    void bothParticipantsCanAddUpToFiveGoals() {
        addGoal(mentee, "Học Docker cơ bản");          // seed + 1 = 2
        addGoal(mentor, "Viết REST API có phân trang"); // 3
        addGoal(mentee, "Triển khai lên cloud");        // 4
        UUID fifth = addGoal(mentor, "Phỏng vấn thử");  // 5
        assertThat(store).hasSize(5);
        assertThat(store.stream().map(RelationshipGoal::getPosition)).containsExactly(0, 1, 2, 3, 4);
        assertThat(store.stream().filter(g -> g.getId().equals(fifth)).findFirst().orElseThrow().getCreatedBy()).isEqualTo(mentorId);
        assertError(() -> addGoal(mentee, "Mục tiêu thứ sáu"), HttpStatus.CONFLICT, "GOAL_LIMIT_REACHED");
        assertThat(store).hasSize(5);
    }

    @Test
    void cannotDeleteTheLastGoal() {
        UUID seeded = service.get(mentee, relId).goals().get(0).id();
        assertError(() -> service.deleteGoal(mentor, relId, seeded), HttpStatus.CONFLICT, "LAST_GOAL");
        UUID second = addGoal(mentee, "Học Docker cơ bản");
        service.deleteGoal(mentor, relId, seeded);
        assertThat(store).extracting(RelationshipGoal::getId).containsExactly(second);
        assertThat(store.get(0).getPosition()).isZero(); // vị trí được dồn lại
        assertError(() -> service.deleteGoal(mentor, relId, second), HttpStatus.CONFLICT, "LAST_GOAL");
    }

    @Test
    void updateChangesStatusAndOrTextAndRequiresOneOfThem() {
        UUID id = service.get(mentee, relId).goals().get(0).id();
        GoalView v = service.updateGoal(mentor, relId, id, new GoalUpdate(null, RelationshipGoal.Status.IN_PROGRESS));
        assertThat(v.status()).isEqualTo("IN_PROGRESS");
        assertThat(v.text()).isEqualTo(LONG_GOAL);
        v = service.updateGoal(mentee, relId, id, new GoalUpdate("  Nắm vững Spring Boot ", RelationshipGoal.Status.DONE));
        assertThat(v.text()).isEqualTo("Nắm vững Spring Boot");
        assertThat(v.status()).isEqualTo("DONE");
        assertError(() -> service.updateGoal(mentee, relId, id, new GoalUpdate(null, null)), HttpStatus.BAD_REQUEST, "INVALID_GOAL");
        assertError(() -> service.updateGoal(mentee, relId, UUID.randomUUID(), new GoalUpdate(null, RelationshipGoal.Status.DONE)),
                HttpStatus.NOT_FOUND, "GOAL_NOT_FOUND");
    }

    @Test
    void reorderRewritesPositions() {
        UUID a = service.get(mentee, relId).goals().get(0).id();
        UUID b = addGoal(mentee, "Học Docker cơ bản");
        UUID c = addGoal(mentor, "Triển khai lên cloud");
        List<GoalView> res = service.reorder(mentor, relId, new GoalOrder(List.of(c, a, b)));
        assertThat(res).extracting(GoalView::id).containsExactly(c, a, b);
        assertThat(res).extracting(GoalView::position).containsExactly(0, 1, 2);
        assertError(() -> service.reorder(mentor, relId, new GoalOrder(List.of(c, a))), HttpStatus.BAD_REQUEST, "INVALID_GOAL_ORDER");
    }

    @Test
    void strangersAreForbiddenAndAdminIsReadOnly() {
        assertError(() -> service.get(stranger, relId), HttpStatus.FORBIDDEN, "FORBIDDEN");
        assertError(() -> addGoal(stranger, "Học Docker cơ bản"), HttpStatus.FORBIDDEN, "FORBIDDEN");

        WorkspaceView asAdmin = service.get(admin, relId);
        assertThat(asAdmin.goals()).hasSize(1);
        assertThat(asAdmin.canEdit()).isFalse();
        assertError(() -> addGoal(admin, "Học Docker cơ bản"), HttpStatus.FORBIDDEN, "FORBIDDEN");
        UUID id = asAdmin.goals().get(0).id();
        assertError(() -> service.updateGoal(admin, relId, id, new GoalUpdate(null, RelationshipGoal.Status.DONE)),
                HttpStatus.FORBIDDEN, "FORBIDDEN");
    }

    @Test
    void workspaceIsReadOnlyOnceTheRelationshipIsNoLongerAccepted() {
        UUID id = service.get(mentee, relId).goals().get(0).id();
        request.setStatus(MentoringRequest.Status.COMPLETED); // US-31 ENDED được xử lý giống hệt (so theo tên)
        WorkspaceView view = service.get(mentee, relId);
        assertThat(view.readOnly()).isTrue();
        assertThat(view.canEdit()).isFalse();
        assertError(() -> addGoal(mentee, "Học Docker cơ bản"), HttpStatus.CONFLICT, "RELATIONSHIP_READ_ONLY");
        assertError(() -> service.updateGoal(mentor, relId, id, new GoalUpdate(null, RelationshipGoal.Status.DONE)),
                HttpStatus.CONFLICT, "RELATIONSHIP_READ_ONLY");
        assertError(() -> service.deleteGoal(mentor, relId, id), HttpStatus.CONFLICT, "RELATIONSHIP_READ_ONLY");
        // Người ngoài vẫn bị 403 trước khi xét chỉ đọc.
        assertError(() -> addGoal(stranger, "Học Docker cơ bản"), HttpStatus.FORBIDDEN, "FORBIDDEN");
    }

    @Test
    void requestsThatWereNeverAcceptedHaveNoWorkspace() {
        request.setStatus(MentoringRequest.Status.PENDING);
        assertError(() -> service.get(mentee, relId), HttpStatus.NOT_FOUND, "RELATIONSHIP_NOT_FOUND");
        assertError(() -> service.get(mentee, UUID.randomUUID()), HttpStatus.NOT_FOUND, "RELATIONSHIP_NOT_FOUND");
    }

    @Test
    void sessionsAreThisPairsOnlyNewestFirst() {
        MentoringSession mine = session(mentorId, menteeId, relId, 2);
        MentoringSession legacy = session(mentorId, menteeId, null, 5);
        MentoringSession otherRelationship = session(mentorId, menteeId, UUID.randomUUID(), 3);
        MentoringSession otherMentor = session(UUID.randomUUID(), menteeId, null, 1);
        when(sessionRepo.findByMenteeIdOrderByScheduledAtDesc(menteeId))
                .thenReturn(List.of(otherMentor, mine, otherRelationship, legacy));
        WorkspaceView view = service.get(mentor, relId);
        assertThat(view.sessions()).extracting(WorkspaceSession::id).containsExactly(mine.getId(), legacy.getId());
    }

    private static MentoringSession session(UUID mentor, UUID mentee, UUID requestId, int daysAhead) {
        MentoringSession s = new MentoringSession();
        ReflectionTestUtils.setField(s, "id", UUID.randomUUID());
        ReflectionTestUtils.setField(s, "mentorId", mentor);
        ReflectionTestUtils.setField(s, "menteeId", mentee);
        ReflectionTestUtils.setField(s, "requestId", requestId);
        ReflectionTestUtils.setField(s, "scheduledAt", OffsetDateTime.now().plusDays(daysAhead));
        return s;
    }
}
