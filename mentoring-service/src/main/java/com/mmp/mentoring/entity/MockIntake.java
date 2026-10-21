package com.mmp.mentoring.entity;

import jakarta.persistence.*;

import java.time.LocalDate;
import java.util.UUID;

/** US-58 (PRD-PREP-7) — thông tin mentee điền khi đặt phiên phỏng vấn thử. */
@Entity
@Table(name = "mock_intakes")
public class MockIntake {

    /** Dạng phỏng vấn — quyết định trọng số chấm điểm (§6.5). */
    public enum InterviewType { BACKEND, FRONTEND, SYSTEM_DESIGN, BEHAVIORAL }

    public enum Level { INTERN, FRESHER, JUNIOR }

    @Id
    @Column(name = "session_id")
    private UUID sessionId;

    @Enumerated(EnumType.STRING)
    @Column(name = "interview_type", nullable = false)
    private InterviewType interviewType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Level level;

    @Column(name = "target_role", nullable = false)
    private String targetRole;

    @Column(name = "target_company")
    private String targetCompany;

    @Column(name = "interview_date")
    private LocalDate interviewDate;

    @Column(name = "jd_url")
    private String jdUrl;

    protected MockIntake() {
    }

    public MockIntake(UUID sessionId, InterviewType interviewType, Level level, String targetRole, String targetCompany,
                      LocalDate interviewDate, String jdUrl) {
        this.sessionId = sessionId;
        this.interviewType = interviewType;
        this.level = level;
        this.targetRole = targetRole;
        this.targetCompany = targetCompany;
        this.interviewDate = interviewDate;
        this.jdUrl = jdUrl;
    }

    public UUID getSessionId() { return sessionId; }
    public InterviewType getInterviewType() { return interviewType; }
    public Level getLevel() { return level; }
    public String getTargetRole() { return targetRole; }
    public String getTargetCompany() { return targetCompany; }
    public LocalDate getInterviewDate() { return interviewDate; }
    public String getJdUrl() { return jdUrl; }
}
