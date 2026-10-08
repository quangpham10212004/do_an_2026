package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.MentoringDtos.RescheduleInput;
import com.mmp.mentoring.dto.MentoringDtos.RescheduleResponseInput;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.SessionRepository;
import com.mmp.mentoring.security.AuthUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static com.mmp.mentoring.service.TestSupport.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/** Đổi lịch: tự áp dụng khi đủ điều kiện, ngược lại thành đề xuất; luôn qua cùng bộ kiểm tra như đặt lịch. */
class RescheduleServiceTest {

    private final UUID menteeId = UUID.randomUUID();
    private final UUID mentorId = UUID.randomUUID();
    private final AuthUser mentee = user(menteeId, "MENTEE");
    private final AuthUser mentor = user(mentorId, "MENTOR");

    private SessionRepository sessionRepo;
    private ProfileClient profileClient;
    private NotificationService notifications;
    private RescheduleService service;
    private MentoringSession session;

    @BeforeEach
    void setUp() {
        sessionRepo = mock(SessionRepository.class);
        profileClient = mock(ProfileClient.class);
        notifications = mock(NotificationService.class);
        when(profileClient.findMentor(mentorId)).thenReturn(java.util.Optional.of(mentor(mentorId, BigDecimal.valueOf(200_000), 3)));
        service = new RescheduleService(sessionRepo, profileClient, notifications, validator(sessionRepo),
                mock(SessionViewMapper.class), tx(), Duration.ofHours(24), 2);
        session = session(menteeId, mentorId, MentoringSession.Status.CONFIRMED, at(5, 10));
        when(sessionRepo.findById(session.getId())).thenReturn(java.util.Optional.of(session));
    }

    @Test
    void menteeChangingEarlyMovesTheSessionImmediatelyAndUsesOneFreeChange() {
        session.setReminderSent(true);
        OffsetDateTime target = at(6, 14);

        service.reschedule(mentee, session.getId(), new RescheduleInput(target));

        assertThat(session.getScheduledAt()).isEqualTo(target);
        assertThat(session.getRescheduleCount()).isEqualTo(1);
        assertThat(session.isReminderSent()).as("nhắc lịch phải gửi lại cho giờ mới").isFalse();
        assertThat(session.hasPendingProposal()).isFalse();
        verify(notifications).notifyUser(eq(mentorId), eq("SESSION_RESCHEDULED"), anyString(), anyString(), anyString());
    }

    @Test
    void menteeChangingWithinTheFreeWindowOnlyCreatesAProposalForTheMentor() {
        session.setScheduledAt(OffsetDateTime.now().plusHours(10)); // còn 10 giờ: ngắn hơn cửa sổ đổi miễn phí 24 giờ
        OffsetDateTime target = at(3, 11);

        service.reschedule(mentee, session.getId(), new RescheduleInput(target));

        assertThat(session.getScheduledAt()).as("lịch cũ giữ nguyên cho tới khi mentor đồng ý").isNotEqualTo(target);
        assertThat(session.getProposedAt()).isEqualTo(target);
        assertThat(session.getProposedBy()).isEqualTo(menteeId);
        assertThat(session.getRescheduleCount()).isZero();
        verify(notifications).notifyUser(eq(mentorId), eq("RESCHEDULE_PROPOSED"), anyString(), anyString(), anyString());
    }

    @Test
    void menteeWhoUsedBothFreeChangesNeedsApprovalEvenWhenEarly() {
        session.setRescheduleCount(2);
        OffsetDateTime target = at(6, 14);

        service.reschedule(mentee, session.getId(), new RescheduleInput(target));

        assertThat(session.getProposedAt()).isEqualTo(target);
        assertThat(session.getScheduledAt()).isNotEqualTo(target);
    }

    @Test
    void mentorProposalAlwaysWaitsForTheMentee() {
        OffsetDateTime target = at(7, 16);

        service.reschedule(mentor, session.getId(), new RescheduleInput(target));

        assertThat(session.getProposedBy()).isEqualTo(mentorId);
        assertThat(session.getScheduledAt()).isNotEqualTo(target);
        verify(notifications).notifyUser(eq(menteeId), eq("RESCHEDULE_PROPOSED"), anyString(), anyString(), anyString());
    }

    @Test
    void menteeAcceptingAMentorProposalMovesTheSessionWithoutUsingTheQuota() {
        OffsetDateTime target = at(7, 16);
        service.reschedule(mentor, session.getId(), new RescheduleInput(target));

        service.respond(mentee, session.getId(), new RescheduleResponseInput(true));

        assertThat(session.getScheduledAt()).isEqualTo(target);
        assertThat(session.hasPendingProposal()).isFalse();
        assertThat(session.getRescheduleCount()).as("mentor khởi xướng không tính vào lượt của mentee").isZero();
        verify(notifications).notifyUser(eq(mentorId), eq("RESCHEDULE_ACCEPTED"), anyString(), anyString(), anyString());
    }

    @Test
    void mentorAcceptingAMenteeProposalCountsTowardTheMenteeQuota() {
        session.setRescheduleCount(2);
        OffsetDateTime target = at(6, 14);
        service.reschedule(mentee, session.getId(), new RescheduleInput(target));

        service.respond(mentor, session.getId(), new RescheduleResponseInput(true));

        assertThat(session.getScheduledAt()).isEqualTo(target);
        assertThat(session.getRescheduleCount()).isEqualTo(3);
    }

    @Test
    void rejectingAProposalKeepsTheOriginalTimeAndTellsTheProposer() {
        OffsetDateTime original = session.getScheduledAt();
        service.reschedule(mentor, session.getId(), new RescheduleInput(at(7, 16)));

        service.respond(mentee, session.getId(), new RescheduleResponseInput(false));

        assertThat(session.getScheduledAt()).isEqualTo(original);
        assertThat(session.hasPendingProposal()).isFalse();
        verify(notifications).notifyUser(eq(mentorId), eq("RESCHEDULE_REJECTED"), anyString(), anyString(), anyString());
    }

    @Test
    void theProposerCanWithdrawButCannotAcceptTheirOwnProposal() {
        service.reschedule(mentor, session.getId(), new RescheduleInput(at(7, 16)));

        assertThatThrownBy(() -> service.respond(mentor, session.getId(), new RescheduleResponseInput(true)))
                .isInstanceOf(ApiException.class);
        service.respond(mentor, session.getId(), new RescheduleResponseInput(false));

        assertThat(session.hasPendingProposal()).isFalse();
        verify(notifications).notifyUser(eq(menteeId), eq("RESCHEDULE_WITHDRAWN"), anyString(), anyString(), anyString());
    }

    @Test
    void respondingWithoutAPendingProposalFails() {
        assertThatThrownBy(() -> service.respond(mentee, session.getId(), new RescheduleResponseInput(true)))
                .isInstanceOf(ApiException.class).hasMessageContaining("không có đề xuất");
    }

    @Test
    void onlyConfirmedSessionsCanBeRescheduled() {
        session.setStatus(MentoringSession.Status.PENDING);

        assertThatThrownBy(() -> service.reschedule(mentee, session.getId(), new RescheduleInput(at(6, 14))))
                .isInstanceOf(ApiException.class).hasMessageContaining("đã xác nhận");
    }

    @Test
    void theNewTimeMustFitTheMentorAvailability() {
        // 23:00 nằm ngoài khung rảnh 08:00-22:00
        assertThatThrownBy(() -> service.reschedule(mentee, session.getId(), new RescheduleInput(at(6, 23))))
                .isInstanceOf(ApiException.class).hasMessageContaining("không rảnh");
        assertThat(session.getRescheduleCount()).isZero();
    }

    @Test
    void theNewTimeMustRespectTheMinimumLeadTime() {
        assertThatThrownBy(() -> service.reschedule(mentee, session.getId(), new RescheduleInput(OffsetDateTime.now().plusMinutes(20))))
                .isInstanceOf(ApiException.class).hasMessageContaining("trước giờ bắt đầu");
    }

    @Test
    void aClashWithAnotherSessionOfTheMentorIsRejected() {
        MentoringSession other = session(UUID.randomUUID(), mentorId, MentoringSession.Status.CONFIRMED, at(6, 14));
        when(sessionRepo.findActiveAround(eq(mentorId), any(), any())).thenReturn(List.of(other));

        assertThatThrownBy(() -> service.reschedule(mentee, session.getId(), new RescheduleInput(at(6, 14))))
                .isInstanceOf(ApiException.class).hasMessageContaining("đã có lịch");
        assertThat(session.getScheduledAt()).isNotEqualTo(at(6, 14));
    }

    @Test
    void theSessionBeingMovedDoesNotBlockItsOwnNewSlot() {
        // Dời sang 11:00 cùng ngày, chồng lên chính khung 10:00-11:00 hiện tại: phải được phép
        OffsetDateTime sameDayLater = session.getScheduledAt().plusMinutes(30);
        when(sessionRepo.findActiveAround(eq(mentorId), any(), any())).thenReturn(List.of(session));

        service.reschedule(mentee, session.getId(), new RescheduleInput(sameDayLater));

        assertThat(session.getScheduledAt()).isEqualTo(sameDayLater);
    }

    @Test
    void anOutsiderCannotRescheduleOrRespond() {
        AuthUser stranger = user(UUID.randomUUID(), "MENTEE");

        assertThatThrownBy(() -> service.reschedule(stranger, session.getId(), new RescheduleInput(at(6, 14))))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void adminMovesTheSessionImmediatelyAndNotifiesBothSides() {
        AuthUser admin = user(UUID.randomUUID(), "ADMIN");
        OffsetDateTime target = at(6, 14);

        service.reschedule(admin, session.getId(), new RescheduleInput(target));

        assertThat(session.getScheduledAt()).isEqualTo(target);
        assertThat(session.getRescheduleCount()).isZero();
        verify(notifications).notifyUser(eq(menteeId), eq("SESSION_RESCHEDULED"), anyString(), anyString(), anyString());
        verify(notifications).notifyUser(eq(mentorId), eq("SESSION_RESCHEDULED"), anyString(), anyString(), anyString());
    }
}
