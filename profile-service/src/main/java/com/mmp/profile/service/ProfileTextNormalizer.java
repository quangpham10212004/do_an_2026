package com.mmp.profile.service;

import com.mmp.profile.dto.MentorProfileInput;
import org.springframework.stereotype.Component;

/**
 * Gộp các trường của profile thành 1 đoạn text chuẩn hóa trước khi đưa
 * vào embedding model. Thay đổi format này ảnh hưởng trực tiếp tới chất
 * lượng matching — nếu cần đổi, nên test lại similarity trước khi merge.
 */
@Component
public class ProfileTextNormalizer {

    public String normalizeMentor(MentorProfileInput input) {
        return String.join(". ",
                "Skills: " + String.join(", ", input.skills()),
                "Domain: " + input.domain(),
                "Bio: " + input.bio()
        );
    }
}
