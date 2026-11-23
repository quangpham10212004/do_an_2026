package com.mmp.profile.entity;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

/** Lĩnh vực PHỤ của mentee (lĩnh vực chính nằm ở MenteeProfile) kèm kỹ năng và mục tiêu riêng. */
@Entity
@Table(name = "mentee_domains")
public class MenteeDomain {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "mentee_id", nullable = false)
    private UUID menteeId;

    @Column(nullable = false)
    private String domain;

    @Column(columnDefinition = "text[]", nullable = false)
    private String[] skills = new String[0];

    private String goal;

    @Column(name = "added_at", nullable = false)
    private OffsetDateTime addedAt;

    protected MenteeDomain() {
    }

    public MenteeDomain(UUID menteeId, String domain, String[] skills, String goal, OffsetDateTime addedAt) {
        this.menteeId = menteeId;
        this.domain = domain;
        this.skills = skills;
        this.goal = goal;
        this.addedAt = addedAt;
    }

    public UUID getId() { return id; }
    public UUID getMenteeId() { return menteeId; }
    public String getDomain() { return domain; }
    public String[] getSkills() { return skills; }
    public String getGoal() { return goal; }
    public OffsetDateTime getAddedAt() { return addedAt; }
}
