package com.mmp.profile.service;

import com.mmp.profile.client.EmbeddingClient;
import com.mmp.profile.entity.MenteeProfile;
import com.mmp.profile.entity.MentorProfile;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ProfileLogicTest {

    private final ProfileTextNormalizer normalizer = new ProfileTextNormalizer();

    @Test
    void mentorAndMenteeTextShareTheSameStructure() {
        MentorProfile m = new MentorProfile();
        m.setDomain("backend");
        m.setSkills(new String[]{"Java", " Spring  Boot "});
        m.setYearsExperience(7);
        m.setBio("Kỹ sư backend\n tại công ty X");
        assertThat(normalizer.normalizeMentor(m))
                .isEqualTo("Domain: backend. Skills: Java, Spring Boot. Experience: 7 years. About: Kỹ sư backend tại công ty X");

        MenteeProfile e = new MenteeProfile();
        e.setDomain("backend");
        e.setSkills(new String[]{"Java"});
        e.setGoal("Học system design");
        assertThat(normalizer.normalizeMentee(e))
                .isEqualTo("Domain: backend. Skills: Java. Level: beginner. Goal: Học system design");
    }

    @Test
    void normalizeListTrimsAndDeduplicatesCaseInsensitively() {
        assertThat(ProfileService.normalizeList(List.of(" Java", "java", "", "Spring Boot", "SPRING BOOT")))
                .containsExactly("Java", "Spring Boot");
        assertThat(ProfileService.normalizeList(null)).isEmpty();
    }

    @Test
    void vectorIsSerializedInPgvectorLiteralFormat() {
        assertThat(EmbeddingService.toPgVector(List.of(0.5, -1.0, 0.25))).isEqualTo("[0.5,-1.0,0.25]");
    }

    @Test
    void embeddingIsSkippedWhenTextUnchanged() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        EmbeddingClient client = mock(EmbeddingClient.class);
        EmbeddingService service = new EmbeddingService(client, jdbc);
        when(jdbc.queryForObject(anyString(), eq(Integer.class), any(), any())).thenReturn(1);

        assertThat(service.refresh(EmbeddingService.Table.MENTOR, UUID.randomUUID(), "same text", false))
                .isEqualTo(EmbeddingService.Status.UNCHANGED);
        verifyNoInteractions(client);
    }

    @Test
    void embeddingFailureMarksProfilePendingForRetry() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        EmbeddingClient client = mock(EmbeddingClient.class);
        EmbeddingService service = new EmbeddingService(client, jdbc);
        when(jdbc.queryForObject(anyString(), eq(Integer.class), any(), any())).thenReturn(0);
        when(client.embed(anyString())).thenReturn(Optional.empty());
        UUID id = UUID.randomUUID();

        assertThat(service.refresh(EmbeddingService.Table.MENTEE, id, "new text", false))
                .isEqualTo(EmbeddingService.Status.PENDING);
        verify(jdbc).update(contains("embedding_text_hash = NULL"), eq(id));
    }

    @Test
    void successfulEmbeddingStoresVectorAndHash() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        EmbeddingClient client = mock(EmbeddingClient.class);
        EmbeddingService service = new EmbeddingService(client, jdbc);
        when(jdbc.queryForObject(anyString(), eq(Integer.class), any(), any())).thenReturn(0);
        when(client.embed("text")).thenReturn(Optional.of(List.of(0.1, 0.2)));
        UUID id = UUID.randomUUID();

        assertThat(service.refresh(EmbeddingService.Table.MENTOR, id, "text", false)).isEqualTo(EmbeddingService.Status.UPDATED);
        verify(jdbc).update(contains("CAST(? AS vector)"), eq("[0.1,0.2]"), eq(EmbeddingService.sha256("text")), eq(id));
    }
}
