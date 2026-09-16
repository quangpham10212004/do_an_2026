package com.mmp.profile.service;

import com.mmp.profile.entity.MenteeProfile;
import com.mmp.profile.entity.MentorProfile;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.stream.Collectors;

/**
 * Gộp các trường của profile thành 1 đoạn text chuẩn hóa trước khi đưa vào
 * embedding model. Mentor và mentee dùng CÙNG cấu trúc (Domain → Skills → mô tả)
 * để hai loại vector nằm trong cùng không gian ngữ nghĩa, giúp cosine similarity
 * giữa mentee và mentor có ý nghĩa. Thay đổi format này ảnh hưởng trực tiếp tới
 * chất lượng matching — nếu đổi, cần chạy lại /api/profile/admin/embeddings/rebuild.
 */
@Component
public class ProfileTextNormalizer {

    public String normalizeMentor(MentorProfile p) {
        return String.join(". ",
                "Domain: " + clean(p.getDomain()),
                "Skills: " + joinSkills(p.getSkills()),
                "Experience: " + p.getYearsExperience() + " years",
                "About: " + clean(p.getBio()));
    }

    public String normalizeMentee(MenteeProfile p) {
        return String.join(". ",
                "Domain: " + clean(p.getDomain()),
                "Skills: " + joinSkills(p.getSkills()),
                "Level: " + p.getCurrentLevel().name().toLowerCase(),
                "Goal: " + clean(p.getGoal()));
    }

    private static String joinSkills(String[] skills) {
        return skills == null ? "" : Arrays.stream(skills).map(ProfileTextNormalizer::clean)
                .filter(s -> !s.isEmpty()).collect(Collectors.joining(", "));
    }

    private static String clean(String s) {
        return s == null ? "" : s.trim().replaceAll("\\s+", " ");
    }
}
