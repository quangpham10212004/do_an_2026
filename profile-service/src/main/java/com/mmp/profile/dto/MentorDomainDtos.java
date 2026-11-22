package com.mmp.profile.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.mmp.profile.entity.MentorDomain.Stage;
import com.mmp.profile.entity.MentorDomain.State;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class MentorDomainDtos {
    private MentorDomainDtos() {}

    public record Step(Stage key, String label, String state) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Domain(String domain, State state, boolean primary, OffsetDateTime addedAt, OffsetDateTime verifiedAt,
                         String summary, BigDecimal hourlyRate, Float rating, Boolean accepting, Integer slotsLeft,
                         List<Step> steps, Integer testScore, String rejectedReason, OffsetDateTime retryAt) {}

    public record Domains(List<Domain> domains, int max) {}

    public record DomainRecord(String domain, UUID id, UUID cvId) {}
    public record InternalDomains(List<Domain> domains, int max, List<DomainRecord> records) {}

    public record Settings(@DecimalMin("50000") @DecimalMax("100000000") @Digits(integer = 9, fraction = 2) BigDecimal hourlyRate,
                           Boolean accepting) {}

    public record Verdict(@NotNull State state, Stage stage, @Min(0) @Max(100) Integer testScore,
                          @Size(max = 2000) String rejectedReason, OffsetDateTime retryAt,
                          Boolean register, UUID profileDomainId) {}

    public record Cv(String name, String domain, String note) {}
    public record Cvs(List<Cv> cvs) {}
    public record Suggestion(@NotBlank @Size(max = 120) String name) {}
}
