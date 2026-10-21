package com.mmp.mentoring.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * US-58 (PRD-PREP-2, §6.5) — phiếu đánh giá phỏng vấn thử do mentor điền. 4 tiêu chí chung 0–10 (cùng thang với AI
 * practice sau này), live coding tuỳ chọn, kết luận tuyển/không tuyển (chỉ mentor đưa ra), đúng 3 điểm cần sửa.
 */
@Entity
@Table(name = "mock_scorecards")
public class MockScorecard {

    public enum Verdict { STRONG_HIRE, HIRE, LEAN_NO, NO_HIRE }

    @Id
    @Column(name = "session_id")
    private UUID sessionId;

    @Column(name = "mentor_id", nullable = false, updatable = false)
    private UUID mentorId;

    @Column(name = "mentee_id", nullable = false, updatable = false)
    private UUID menteeId;

    @Enumerated(EnumType.STRING)
    @Column(name = "interview_type", nullable = false)
    private MockIntake.InterviewType interviewType;

    @Column(nullable = false)
    private int technical;

    @Column(name = "problem_solving", nullable = false)
    private int problemSolving;

    @Column(nullable = false)
    private int depth;

    @Column(nullable = false)
    private int communication;

    @Column(name = "live_coding")
    private Integer liveCoding;

    @Column(nullable = false)
    private BigDecimal overall;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Verdict verdict;

    @Column(columnDefinition = "text[]", nullable = false)
    private String[] fixes;

    @Column(name = "private_note")
    private String privateNote;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected MockScorecard() {
    }

    public MockScorecard(MentoringSession session, MockIntake.InterviewType interviewType, OffsetDateTime now) {
        this.sessionId = session.getId();
        this.mentorId = session.getMentorId();
        this.menteeId = session.getMenteeId();
        this.interviewType = interviewType;
        this.createdAt = now;
    }

    public void write(int technical, int problemSolving, int depth, int communication, Integer liveCoding, BigDecimal overall,
                      Verdict verdict, String[] fixes, String privateNote, OffsetDateTime now) {
        this.technical = technical;
        this.problemSolving = problemSolving;
        this.depth = depth;
        this.communication = communication;
        this.liveCoding = liveCoding;
        this.overall = overall;
        this.verdict = verdict;
        this.fixes = fixes;
        this.privateNote = privateNote;
        this.updatedAt = now;
    }

    public UUID getSessionId() { return sessionId; }
    public UUID getMentorId() { return mentorId; }
    public UUID getMenteeId() { return menteeId; }
    public MockIntake.InterviewType getInterviewType() { return interviewType; }
    public int getTechnical() { return technical; }
    public int getProblemSolving() { return problemSolving; }
    public int getDepth() { return depth; }
    public int getCommunication() { return communication; }
    public Integer getLiveCoding() { return liveCoding; }
    public BigDecimal getOverall() { return overall; }
    public Verdict getVerdict() { return verdict; }
    public String[] getFixes() { return fixes; }
    public String getPrivateNote() { return privateNote; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
