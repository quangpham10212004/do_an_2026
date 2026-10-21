package com.mmp.profile.service;

import com.mmp.profile.client.MatchingIndexClient;
import com.mmp.profile.dto.ProfileDtos.MentorProfileInput;
import com.mmp.profile.entity.MentorProfile;
import com.mmp.profile.exception.ApiException;
import com.mmp.profile.repository.MenteeProfileRepository;
import com.mmp.profile.repository.MentorAvailabilityExceptionRepository;
import com.mmp.profile.repository.MentorAvailabilityRepository;
import com.mmp.profile.repository.MentorProfileRepository;
import com.mmp.profile.service.PricingTiers.Tier;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** Bản chốt v2.0 §3–4 — cấp độ mentor và khung giá. */
class MentorTierTest {

    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-07T03:00:00Z"), ZoneOffset.UTC);
    private final PricingTiers tiers = PricingTiers.defaults();

    // ---- hàm thuần ----

    @Test
    void suggestsTierFromInterviewScore() {
        assertThat(tiers.suggest(59)).isEmpty();
        assertThat(tiers.suggest(60)).contains(Tier.JUNIOR);
        assertThat(tiers.suggest(74)).contains(Tier.JUNIOR);
        assertThat(tiers.suggest(75)).contains(Tier.SENIOR);
        assertThat(tiers.suggest(87)).contains(Tier.SENIOR);
        assertThat(tiers.suggest(88)).contains(Tier.EXPERT);
        assertThat(tiers.suggest(100)).contains(Tier.EXPERT);
    }

    @Test
    void bandsMatchTheAgreedPriceRanges() {
        assertThat(tiers.band(Tier.JUNIOR)).isEqualTo(new PricingTiers.Band(Tier.JUNIOR, 100_000, 200_000));
        assertThat(tiers.band(Tier.SENIOR)).isEqualTo(new PricingTiers.Band(Tier.SENIOR, 200_000, 400_000));
        assertThat(tiers.band(Tier.EXPERT)).isEqualTo(new PricingTiers.Band(Tier.EXPERT, 400_000, 700_000));
        assertThat(tiers.step()).isEqualTo(10_000);
    }

    @Test
    void violationChecksBandAndStep() {
        assertThat(tiers.violation(Tier.JUNIOR, new BigDecimal("150000"))).isEmpty();
        assertThat(tiers.violation(Tier.JUNIOR, new BigDecimal("100000"))).isEmpty();
        assertThat(tiers.violation(Tier.JUNIOR, new BigDecimal("200000"))).isEmpty();
        assertThat(tiers.violation(Tier.JUNIOR, new BigDecimal("90000"))).isPresent();
        assertThat(tiers.violation(Tier.JUNIOR, new BigDecimal("210000"))).isPresent();
        assertThat(tiers.violation(Tier.JUNIOR, new BigDecimal("155000"))).isPresent();   // không chia hết bước 10.000
        assertThat(tiers.violation(Tier.EXPERT, new BigDecimal("700000"))).isEmpty();
        assertThat(tiers.violation(Tier.EXPERT, new BigDecimal("710000"))).isPresent();
    }

    @Test
    void clampSnapsToNearestEdgeOfTheNewBand() {
        assertThat(tiers.clamp(Tier.SENIOR, new BigDecimal("150000"))).isEqualByComparingTo("200000");
        assertThat(tiers.clamp(Tier.JUNIOR, new BigDecimal("350000"))).isEqualByComparingTo("200000");
        assertThat(tiers.clamp(Tier.SENIOR, new BigDecimal("300000"))).isEqualByComparingTo("300000");
        assertThat(tiers.clamp(Tier.EXPERT, BigDecimal.ZERO)).isEqualByComparingTo("400000");
    }

    @Test
    void legacyRateMapsToTheBandThatContainsIt() {
        assertThat(tiers.tierForRate(BigDecimal.ZERO)).isEqualTo(Tier.JUNIOR);
        assertThat(tiers.tierForRate(new BigDecimal("200000"))).isEqualTo(Tier.JUNIOR);   // ranh giới → khung thấp hơn
        assertThat(tiers.tierForRate(new BigDecimal("250000"))).isEqualTo(Tier.SENIOR);
        assertThat(tiers.tierForRate(new BigDecimal("900000"))).isEqualTo(Tier.EXPERT);
    }

    // ---- ProfileService ----

    private final MentorProfileRepository mentorRepo = mock(MentorProfileRepository.class);
    private final TransactionTemplate tx = mock(TransactionTemplate.class);
    private final ProfileService service = new ProfileService(mentorRepo, mock(MenteeProfileRepository.class),
            mock(MentorAvailabilityRepository.class), mock(MentorAvailabilityExceptionRepository.class),
            mock(MatchingIndexClient.class), tx, CLOCK);
    private final UUID mentorId = UUID.randomUUID();
    private final MentorProfile mentor = new MentorProfile();

    @SuppressWarnings("unchecked")
    MentorTierTest() {
        when(tx.execute(any())).thenAnswer(inv -> ((TransactionCallback<Object>) inv.getArgument(0)).doInTransaction(null));
        doAnswer(inv -> {
            ((Consumer<TransactionStatus>) inv.getArgument(0)).accept(null);
            return null;
        }).when(tx).executeWithoutResult(any());
        mentor.setUserId(mentorId);
        mentor.setDisplayName("Mentor");
        mentor.setDomain("backend");
        mentor.setBio("bio");
        mentor.setVerificationStatus(MentorProfile.VerificationStatus.PENDING_REVIEW);
        when(mentorRepo.findById(mentorId)).thenReturn(Optional.of(mentor));
        when(mentorRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    private static void assertCode(Runnable r, String code) {
        assertThatThrownBy(r::run).isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).getCode()).isEqualTo(code));
    }

    @Test
    void approvingWithATierAssignsItAndClampsTheRate() {
        mentor.setHourlyRate(new BigDecimal("150000"));

        service.updateVerification(mentorId, "APPROVED", "EXPERT");

        assertThat(mentor.getTier()).isEqualTo("EXPERT");
        assertThat(mentor.getTierAssignedAt()).isNotNull();
        assertThat(mentor.getHourlyRate()).isEqualByComparingTo("400000");
    }

    @Test
    void approvingWithoutATierDerivesItFromTheCurrentRateAndKeepsTheRate() {
        mentor.setHourlyRate(new BigDecimal("250000"));

        service.updateVerification(mentorId, "APPROVED");

        assertThat(mentor.getTier()).isEqualTo("SENIOR");
        assertThat(mentor.getHourlyRate()).isEqualByComparingTo("250000");
    }

    @Test
    void rejectingDoesNotTouchTheTier() {
        mentor.assignTier("JUNIOR", null);

        service.updateVerification(mentorId, "REJECTED", null);

        assertThat(mentor.getTier()).isEqualTo("JUNIOR");
    }

    @Test
    void mentorCannotPickARateBeforeBeingAssignedATier() {
        assertCode(() -> service.updateRate(mentorId, new BigDecimal("150000")), "TIER_NOT_ASSIGNED");
    }

    @Test
    void mentorPicksARateInsideTheBandOnly() {
        mentor.assignTier("SENIOR", null);

        service.updateRate(mentorId, new BigDecimal("320000"));
        assertThat(mentor.getHourlyRate()).isEqualByComparingTo("320000");

        assertCode(() -> service.updateRate(mentorId, new BigDecimal("150000")), "RATE_OUT_OF_TIER");
        assertCode(() -> service.updateRate(mentorId, new BigDecimal("325000")), "RATE_OUT_OF_TIER");
        assertThat(mentor.getHourlyRate()).isEqualByComparingTo("320000");
    }

    @Test
    void changingTierClampsTheRateIntoTheNewBand() {
        mentor.assignTier("EXPERT", null);
        mentor.setHourlyRate(new BigDecimal("600000"));

        service.changeTier(mentorId, "SENIOR");

        assertThat(mentor.getTier()).isEqualTo("SENIOR");
        assertThat(mentor.getHourlyRate()).isEqualByComparingTo("400000");
    }

    @Test
    void profileFormCannotSneakARateOutsideTheBand() {
        mentor.assignTier("JUNIOR", null);
        mentor.setHourlyRate(new BigDecimal("150000"));

        assertCode(() -> service.upsertMentor(mentorId, input(new BigDecimal("500000"))), "RATE_OUT_OF_TIER");
        // gửi lại đúng mức hiện tại thì không bị kiểm tra lại (tương thích form cũ)
        service.upsertMentor(mentorId, input(new BigDecimal("150000")));
        assertThat(mentor.getHourlyRate()).isEqualByComparingTo("150000");
    }

    private MentorProfileInput input(BigDecimal rate) {
        return new MentorProfileInput("Mentor", List.of("java"), "backend", "bio", 3, null, List.of(), rate, 3, null, null);
    }
}
