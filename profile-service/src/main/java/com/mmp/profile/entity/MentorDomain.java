package com.mmp.profile.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "mentor_domains")
public class MentorDomain {
    public enum State { PENDING, VERIFIED, REJECTED }
    public enum Stage { CV, TEST, VIDEO, ADMIN }

    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    private UUID mentorId;
    private String domain;
    @Enumerated(EnumType.STRING)
    private State state = State.PENDING;
    @Enumerated(EnumType.STRING)
    private Stage stage = Stage.CV;
    private OffsetDateTime addedAt;
    private OffsetDateTime verifiedAt;
    private BigDecimal hourlyRate;
    private boolean accepting = true;
    private Integer testScore;
    private String rejectedReason;
    private OffsetDateTime retryAt;
    private UUID cvId;
    private UUID verificationEpoch;

    protected MentorDomain() {}

    public MentorDomain(UUID mentorId, String domain, OffsetDateTime addedAt) {
        this.mentorId = mentorId;
        this.domain = domain;
        this.addedAt = addedAt;
    }

    public UUID getId() { return id; }
    public String getDomain() { return domain; }
    public State getState() { return state; }
    public Stage getStage() { return stage; }
    public OffsetDateTime getAddedAt() { return addedAt; }
    public OffsetDateTime getVerifiedAt() { return verifiedAt; }
    public BigDecimal getHourlyRate() { return hourlyRate; }
    public boolean isAccepting() { return accepting; }
    public Integer getTestScore() { return testScore; }
    public String getRejectedReason() { return rejectedReason; }
    public OffsetDateTime getRetryAt() { return retryAt; }
    public UUID getCvId() { return cvId; }
    public UUID getVerificationEpoch() { return verificationEpoch; }
    public UUID getVerificationId() { return verificationEpoch == null ? id : verificationEpoch; }

    public void revokeVerification(String reason) {
        verificationEpoch = UUID.randomUUID();
        state = State.REJECTED;
        stage = Stage.TEST;
        verifiedAt = null;
        testScore = null;
        rejectedReason = reason;
        retryAt = null;
    }

    public void linkCv(UUID cvId) {
        this.cvId = cvId;
        if (cvId != null) this.stage = Stage.TEST;
    }

    public void updateSettings(BigDecimal rate, Boolean accepting) {
        if (rate != null) this.hourlyRate = rate;
        if (accepting != null) this.accepting = accepting;
    }

    public void updateVerification(State state, Stage stage, Integer testScore, String reason,
                                   OffsetDateTime retryAt, OffsetDateTime now) {
        if (this.state == State.VERIFIED) return;
        if (this.state == State.REJECTED && state == State.PENDING) this.testScore = null;
        this.state = state;
        if (stage != null) this.stage = stage;
        if (testScore != null) this.testScore = testScore;
        this.rejectedReason = state == State.REJECTED ? reason : null;
        this.retryAt = state == State.REJECTED ? retryAt : null;
        if (state == State.VERIFIED) this.verifiedAt = now;
    }
}
