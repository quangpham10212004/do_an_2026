package com.mmp.mentoring.service;

import com.mmp.mentoring.client.AiClient;
import com.mmp.mentoring.client.AiModels.*;
import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.dto.MentoringDtos.*;
import com.mmp.mentoring.entity.Interview;
import com.mmp.mentoring.entity.InterviewTurn;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.InterviewRepository;
import com.mmp.mentoring.repository.InterviewTurnRepository;
import com.mmp.mentoring.security.AuthUser;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.OffsetDateTime;
import java.util.*;

/**
 * AI Interview xác thực năng lực mentor (FR-7.1 → FR-7.5).
 *
 * Vòng đời: mentor bắt đầu → trả lời lần lượt {maxTurns} câu (ai-service chấm từng câu
 * và sinh câu kế tiếp) → sau lượt cuối ai-service tổng hợp điểm & nhận xét → trạng
 * thái PENDING_REVIEW, thông báo admin → admin APPROVE/REJECT → đồng bộ trạng thái
 * xác thực sang profile-service (mentor chỉ xuất hiện trong matching khi APPROVED).
 *
 * Service này lưu toàn bộ trạng thái (buổi phỏng vấn, từng lượt); phần AI (DeepSeek hoặc rule-based)
 * nằm ở ai-service và không lưu trạng thái — mỗi lượt gửi kèm lịch sử hội thoại.
 */
@Service
public class InterviewService {

    private final InterviewRepository interviewRepo;
    private final InterviewTurnRepository turnRepo;
    private final ProfileClient profileClient;
    private final NotificationService notifications;
    private final AiClient aiClient;
    private final TransactionTemplate tx;
    private final int maxTurns;

    public InterviewService(InterviewRepository interviewRepo, InterviewTurnRepository turnRepo,
                            ProfileClient profileClient, NotificationService notifications, AiClient aiClient,
                            TransactionTemplate tx, @Value("${app.interview.max-turns}") int maxTurns) {
        this.interviewRepo = interviewRepo;
        this.turnRepo = turnRepo;
        this.profileClient = profileClient;
        this.notifications = notifications;
        this.aiClient = aiClient;
        this.tx = tx;
        this.maxTurns = maxTurns;
    }

    /** FR-7.1 — bắt đầu (hoặc tiếp tục) buổi phỏng vấn của mentor. */
    public InterviewView start(AuthUser mentor) {
        ProfileClient.MentorInfo profile = profileClient.findMentor(mentor.userId())
                .orElseThrow(() -> ApiException.badRequest("PROFILE_REQUIRED", "Bạn cần hoàn thành hồ sơ mentor trước khi phỏng vấn"));
        Optional<Interview> latest = interviewRepo.findFirstByMentorIdOrderByCreatedAtDesc(mentor.userId());
        if (latest.isPresent()) {
            Interview i = latest.get();
            switch (i.getStatus()) {
                case IN_PROGRESS -> {
                    return view(i, false);
                }
                case PENDING_REVIEW -> throw ApiException.conflict("INTERVIEW_PENDING_REVIEW", "Kết quả phỏng vấn đang chờ admin xem xét");
                case APPROVED -> throw ApiException.conflict("ALREADY_APPROVED", "Tài khoản mentor đã được kích hoạt");
                case REJECTED -> { /* cho phép phỏng vấn lại */ }
            }
        }
        InterviewContext ctx = new InterviewContext(profile.domain(), profile.skills(), profile.yearsExperience(), profile.bio(), maxTurns);
        QuestionResult first = aiClient.firstQuestion(ctx, null);

        Interview saved = tx.execute(s -> {
            Interview i = new Interview();
            i.setMentorId(mentor.userId());
            i.setDomain(profile.domain());
            i.setSkills(profile.skills().toArray(String[]::new));
            i.setMaxTurns(maxTurns);
            i.setEngine(first.engine());
            i = interviewRepo.save(i);
            turnRepo.save(new InterviewTurn(i.getId(), 1, first.topic(), InterviewTurn.Strategy.valueOf(first.strategy()), first.question()));
            return i;
        });
        if ("REJECTED".equals(profile.verificationStatus())) {
            profileClient.updateVerification(mentor.userId(), "PENDING_INTERVIEW");
        }
        return view(saved, false);
    }

    /** FR-7.2 — mentor gửi câu trả lời cho câu hỏi hiện tại. */
    public InterviewView answer(AuthUser mentor, UUID interviewId, String answer) {
        Interview interview = find(interviewId);
        if (!interview.getMentorId().equals(mentor.userId())) {
            throw ApiException.forbidden("Đây không phải buổi phỏng vấn của bạn");
        }
        if (interview.getStatus() != Interview.Status.IN_PROGRESS) {
            throw ApiException.conflict("INTERVIEW_NOT_IN_PROGRESS", "Buổi phỏng vấn đã kết thúc");
        }
        List<InterviewTurn> turns = turnRepo.findByInterviewIdOrderByTurnNoAsc(interviewId);
        InterviewTurn current = turns.stream().filter(t -> t.getAnswer() == null).findFirst()
                .orElseThrow(() -> ApiException.conflict("NO_OPEN_QUESTION", "Không có câu hỏi đang chờ trả lời"));

        ProfileClient.MentorInfo profile = profileClient.findMentor(mentor.userId()).orElse(null);
        InterviewContext ctx = new InterviewContext(interview.getDomain(), Arrays.asList(interview.getSkills()),
                profile == null ? 0 : profile.yearsExperience(), profile == null ? null : profile.bio(), interview.getMaxTurns());
        List<TurnRecord> history = turns.stream().filter(t -> t.getAnswer() != null).map(InterviewService::record).toList();
        TurnRecord currentRecord = new TurnRecord(current.getTurnNo(), current.getTopic(), current.getStrategy().name(),
                current.getQuestion(), answer.trim(), null);
        boolean isLast = current.getTurnNo() >= interview.getMaxTurns();

        // Gọi ai-service bên ngoài transaction (có thể mất vài giây)
        EvaluationResult evaluation = aiClient.evaluate(ctx, history, currentRecord, isLast, interview.getEngine());
        AssessmentResult assessment = null;
        if (isLast) {
            List<TurnRecord> all = new ArrayList<>(history);
            all.add(new TurnRecord(currentRecord.turnNo(), currentRecord.topic(), currentRecord.strategy(),
                    currentRecord.question(), currentRecord.answer(), evaluation.score()));
            assessment = aiClient.summarize(ctx, all, interview.getEngine());
        }
        AssessmentResult finalAssessment = assessment;

        Interview updated = tx.execute(s -> {
            Interview i = find(interviewId);
            InterviewTurn t = turnRepo.findById(current.getId()).orElseThrow();
            if (t.getAnswer() != null) {
                throw ApiException.conflict("ALREADY_ANSWERED", "Câu hỏi này đã được trả lời");
            }
            t.setAnswer(answer.trim());
            t.setScore(evaluation.score());
            t.setFeedback(evaluation.feedback());
            t.setAnsweredAt(OffsetDateTime.now());
            if (finalAssessment == null) {
                QuestionPlan next = evaluation.next();
                if (next == null) {
                    throw new ApiException(org.springframework.http.HttpStatus.BAD_GATEWAY, "AI_SERVICE_UNAVAILABLE",
                            "Dịch vụ AI không sinh được câu hỏi tiếp theo, vui lòng gửi lại câu trả lời");
                }
                i.setCurrentTurn(t.getTurnNo() + 1);
                turnRepo.save(new InterviewTurn(i.getId(), t.getTurnNo() + 1, next.topic(),
                        InterviewTurn.Strategy.valueOf(next.strategy()), next.question()));
            } else {
                i.setStatus(Interview.Status.PENDING_REVIEW);
                i.setOverallScore(finalAssessment.overallScore());
                i.setSummary(finalAssessment.summary());
                i.setStrengths(String.join("\n", finalAssessment.strengths()));
                i.setWeaknesses(String.join("\n", finalAssessment.weaknesses()));
                i.setRecommendation(finalAssessment.recommendation());
                i.setCompletedAt(OffsetDateTime.now());
            }
            return i;
        });

        if (updated.getStatus() == Interview.Status.PENDING_REVIEW) {
            profileClient.updateVerification(mentor.userId(), "PENDING_REVIEW");
            notifications.notifyRole("ADMIN", "INTERVIEW_PENDING_REVIEW", "Có kết quả AI Interview cần duyệt",
                    String.format("Mentor lĩnh vực %s đạt %.1f/100 điểm (AI khuyến nghị: %s).",
                            updated.getDomain(), updated.getOverallScore(), updated.getRecommendation()),
                    "/admin/interviews/" + updated.getId());
            notifications.notifyUser(mentor.userId(), "INTERVIEW_COMPLETED", "Bạn đã hoàn thành AI Interview",
                    "Kết quả đang chờ quản trị viên xem xét trước khi kích hoạt tài khoản mentor.", "/interview");
        }
        return view(updated, false);
    }

    public Optional<InterviewView> latestFor(AuthUser mentor) {
        return interviewRepo.findFirstByMentorIdOrderByCreatedAtDesc(mentor.userId()).map(i -> view(i, false));
    }

    public InterviewView get(AuthUser user, UUID id) {
        Interview i = find(id);
        if (!user.isAdmin() && !i.getMentorId().equals(user.userId())) {
            throw ApiException.forbidden("Bạn không có quyền xem buổi phỏng vấn này");
        }
        return view(i, user.isAdmin());
    }

    public List<InterviewView> list(String status) {
        List<Interview> list = status == null || status.isBlank()
                ? interviewRepo.findAllByOrderByCreatedAtDesc()
                : interviewRepo.findByStatusOrderByCompletedAtAsc(Interview.Status.valueOf(status.toUpperCase()));
        return list.stream().map(i -> view(i, true)).toList();
    }

    /** FR-7.5 / NFR-8 — admin xác nhận cuối cùng. */
    public InterviewView review(AuthUser admin, UUID id, ReviewInterviewInput in) {
        Interview updated = tx.execute(s -> {
            Interview i = find(id);
            if (i.getStatus() != Interview.Status.PENDING_REVIEW) {
                throw ApiException.conflict("INTERVIEW_NOT_PENDING_REVIEW", "Buổi phỏng vấn không ở trạng thái chờ duyệt");
            }
            i.setStatus("APPROVE".equals(in.decision()) ? Interview.Status.APPROVED : Interview.Status.REJECTED);
            i.setReviewedBy(admin.userId());
            i.setReviewNote(MentoringRequestService.trimToNull(in.note()));
            i.setReviewedAt(OffsetDateTime.now());
            return i;
        });
        boolean approved = updated.getStatus() == Interview.Status.APPROVED;
        profileClient.updateVerification(updated.getMentorId(), approved ? "APPROVED" : "REJECTED");
        notifications.notifyUser(updated.getMentorId(), approved ? "MENTOR_APPROVED" : "MENTOR_REJECTED",
                approved ? "Tài khoản mentor đã được kích hoạt" : "Hồ sơ mentor chưa được duyệt",
                approved ? "Chúc mừng! Bạn đã có thể xuất hiện trong kết quả gợi ý và nhận mentee."
                        : "Bạn có thể cập nhật hồ sơ và phỏng vấn lại." + (updated.getReviewNote() == null ? "" : " Nhận xét: " + updated.getReviewNote()),
                "/interview");
        return view(updated, true);
    }

    private Interview find(UUID id) {
        return interviewRepo.findById(id).orElseThrow(() -> ApiException.notFound("INTERVIEW_NOT_FOUND", "Không tìm thấy buổi phỏng vấn"));
    }

    private static TurnRecord record(InterviewTurn t) {
        return new TurnRecord(t.getTurnNo(), t.getTopic(), t.getStrategy().name(), t.getQuestion(), t.getAnswer(), t.getScore());
    }

    /**
     * Trong lúc phỏng vấn, mentor KHÔNG thấy điểm/nhận xét từng câu (tránh "học tủ"
     * theo phản hồi). Sau khi hoàn thành, mentor và admin xem được toàn bộ.
     */
    private InterviewView view(Interview i, boolean forAdmin) {
        boolean revealScores = forAdmin || i.getStatus() != Interview.Status.IN_PROGRESS;
        List<InterviewTurn> turns = turnRepo.findByInterviewIdOrderByTurnNoAsc(i.getId());
        List<InterviewTurnView> turnViews = turns.stream().map(t -> new InterviewTurnView(t.getTurnNo(), t.getTopic(),
                t.getStrategy().name(), t.getQuestion(), t.getAnswer(), revealScores ? t.getScore() : null,
                revealScores ? t.getFeedback() : null, t.getAskedAt(), t.getAnsweredAt())).toList();
        InterviewTurnView current = i.getStatus() == Interview.Status.IN_PROGRESS
                ? turnViews.stream().filter(t -> t.answer() == null).findFirst().orElse(null) : null;
        String mentorName = forAdmin ? profileClient.summary(i.getMentorId()).map(ProfileClient.ProfileSummary::displayName).orElse(null) : null;
        return new InterviewView(i.getId(), i.getMentorId(), mentorName, i.getDomain(), Arrays.asList(i.getSkills()),
                i.getStatus().name(), i.getEngine(), i.getMaxTurns(), i.getCurrentTurn(), current, turnViews,
                i.getOverallScore(), i.getSummary(), split(i.getStrengths()), split(i.getWeaknesses()),
                i.getRecommendation(), i.getReviewNote(), i.getCreatedAt(), i.getCompletedAt(), i.getReviewedAt());
    }

    private static List<String> split(String s) {
        return s == null || s.isBlank() ? List.of() : Arrays.stream(s.split("\n")).filter(x -> !x.isBlank()).toList();
    }

    public long countByStatus(Interview.Status status) {
        return interviewRepo.countByStatus(status);
    }
}
