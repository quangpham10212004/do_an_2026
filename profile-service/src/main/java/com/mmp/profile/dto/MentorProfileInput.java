package com.mmp.profile.dto;

import java.util.List;

public record MentorProfileInput(
        List<String> skills,
        String domain,
        String bio,
        Integer yearsExperience,
        String cvFileUrl
) {
}
