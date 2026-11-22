package com.mmp.learning.service;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BlogRulesTest {

    @Test
    void slugifyRemovesVietnameseDiacriticsAndSymbols() {
        assertThat(BlogRules.slugify("Tối ưu truy vấn PostgreSQL: Đừng bỏ qua index!")).isEqualTo("toi-uu-truy-van-postgresql-dung-bo-qua-index");
        assertThat(BlogRules.slugify("  --Hello   World--  ")).isEqualTo("hello-world");
    }

    @Test
    void slugifyFallsBackWhenNothingLeft() {
        assertThat(BlogRules.slugify("!!!")).isEqualTo("bai-viet");
        assertThat(BlogRules.slugify(null)).isEqualTo("bai-viet");
    }

    @Test
    void slugifyTruncatesWithoutTrailingDash() {
        String slug = BlogRules.slugify("a".repeat(70) + " " + "b".repeat(70));
        assertThat(slug.length()).isLessThanOrEqualTo(80);
        assertThat(slug).doesNotEndWith("-");
    }

    @Test
    void tagSlugKeepsCppAndCSharpApartFromC() {
        assertThat(BlogRules.tagSlug("C++")).isEqualTo("c-plus-plus");
        assertThat(BlogRules.tagSlug("C#")).isEqualTo("c-sharp");
        assertThat(BlogRules.tagSlug("Spring Boot")).isEqualTo("spring-boot");
    }

    @Test
    void slugSuffixUsesFirstSixCharsOfId() {
        UUID id = UUID.fromString("abcdef12-0000-0000-0000-000000000000");
        assertThat(BlogRules.withSuffix("bai", id)).isEqualTo("bai-abcdef");
    }

    @Test
    void readingMinutesIsAtLeastOneAndRoundsUp() {
        assertThat(BlogRules.readingMinutes("")).isEqualTo(1);
        assertThat(BlogRules.readingMinutes("word ".repeat(200))).isEqualTo(1);
        assertThat(BlogRules.readingMinutes("word ".repeat(201))).isEqualTo(2);
        assertThat(BlogRules.readingMinutes("word ".repeat(1000))).isEqualTo(5);
    }

    @Test
    void autoSummaryStripsMarkdownAndCutsAtWordBoundary() {
        String md = "# Tiêu đề\n\n```java\nSystem.out.println(1);\n```\n\nĐọc [tài liệu](https://example.com) này " + "từ ".repeat(200);
        String summary = BlogRules.autoSummary(md);
        assertThat(summary).startsWith("Tiêu đề Đọc tài liệu này");
        assertThat(summary).doesNotContain("```", "System.out", "https://");
        assertThat(summary.length()).isLessThanOrEqualTo(201);
        assertThat(summary).endsWith("…");
        assertThat(BlogRules.autoSummary("ngắn thôi")).isEqualTo("ngắn thôi");
    }

    @Test
    void draftValidationChecksTitleSummaryContentAndCover() {
        assertThat(BlogRules.validateDraft("Tiêu đề hợp lệ nè", null, "nội dung", null)).isEmpty();
        assertThat(BlogRules.validateDraft("ngắn", null, "x", null)).isPresent();
        assertThat(BlogRules.validateDraft("x".repeat(151), null, "x", null)).isPresent();
        assertThat(BlogRules.validateDraft("Tiêu đề hợp lệ nè", "s".repeat(301), "x", null)).isPresent();
        assertThat(BlogRules.validateDraft("Tiêu đề hợp lệ nè", null, "x".repeat(50_001), null)).isPresent();
        assertThat(BlogRules.validateDraft("Tiêu đề hợp lệ nè", null, "x", "javascript:alert(1)")).isPresent();
        assertThat(BlogRules.validateDraft("Tiêu đề hợp lệ nè", null, "x", "https://cdn.example.com/a.png")).isEmpty();
        assertThat(BlogRules.validateDraft("Tiêu đề hợp lệ nè", null, "x", "  ")).isEmpty();
    }

    @Test
    void publishNeedsAtLeast300Chars() {
        assertThat(BlogRules.longEnoughToPublish("x".repeat(299))).isFalse();
        assertThat(BlogRules.longEnoughToPublish("x".repeat(300))).isTrue();
        assertThat(BlogRules.longEnoughToPublish(null)).isFalse();
    }

    @Test
    void tagsAreTrimmedDeduplicatedBySlugAndCapped() {
        assertThat(BlogRules.normalizeTags(List.of(" Spring  Boot ", "spring-boot", "Java", " "))).containsExactly("Spring Boot", "Java");
        assertThat(BlogRules.normalizeTags(null)).isEmpty();
        assertThatThrownBy(() -> BlogRules.normalizeTags(List.of("a", "b", "c", "d", "e", "f")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> BlogRules.normalizeTags(List.of("x"))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> BlogRules.normalizeTags(List.of("x".repeat(31)))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void sixTagsThatCollapseToFiveAreAccepted() {
        assertThat(BlogRules.normalizeTags(List.of("Java", "java", "React", "Docker", "Python", "DevOps"))).hasSize(5);
    }

    @Test
    void onlyAuthorAndAdminSeeUnpublishedPosts() {
        UUID author = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        assertThat(BlogRules.canView(BlogRules.PUBLISHED, author, other, false)).isTrue();
        assertThat(BlogRules.canView(BlogRules.DRAFT, author, other, false)).isFalse();
        assertThat(BlogRules.canView(BlogRules.DRAFT, author, author, false)).isTrue();
        assertThat(BlogRules.canView(BlogRules.UNPUBLISHED, author, other, true)).isTrue();
    }

    @Test
    void authorCannotRepublishPostTakenDownByAdmin() {
        assertThat(BlogRules.authorMayPublish(BlogRules.DRAFT)).isTrue();
        assertThat(BlogRules.authorMayPublish(BlogRules.PUBLISHED)).isTrue();
        assertThat(BlogRules.authorMayPublish(BlogRules.UNPUBLISHED)).isFalse();
    }

    @Test
    void commentAndReasonLengthLimits() {
        assertThat(BlogRules.validateComment("ok")).isEmpty();
        assertThat(BlogRules.validateComment("  ")).isPresent();
        assertThat(BlogRules.validateComment("x".repeat(2001))).isPresent();
        assertThat(BlogRules.validateReason("quá ngắn")).isPresent();
        assertThat(BlogRules.validateReason("Nội dung quảng cáo spam")).isEmpty();
        assertThat(BlogRules.validateReason("x".repeat(501))).isPresent();
    }

    @Test
    void onlyMentorMenteeAndAdminCanWrite() {
        assertThat(BlogRules.canWrite("MENTOR")).isTrue();
        assertThat(BlogRules.canWrite("MENTEE")).isTrue();
        assertThat(BlogRules.canWrite("ADMIN")).isTrue();
        assertThat(BlogRules.canWrite("INTERNAL")).isFalse();
        assertThat(BlogRules.canWrite(null)).isFalse();
    }

    @Test
    void coverUrlAcceptsHttpAndSameOriginPathsOnly() {
        assertThat(BlogRules.isHttpUrl("https://cdn.example.com/a.png")).isTrue();
        assertThat(BlogRules.isHttpUrl("/seed/blog/a.svg")).isTrue();
        assertThat(BlogRules.isHttpUrl("//evil.example.com/a.png")).isFalse();
        assertThat(BlogRules.isHttpUrl("/../etc/passwd")).isFalse();
        assertThat(BlogRules.isHttpUrl("javascript:alert(1)")).isFalse();
    }
}
