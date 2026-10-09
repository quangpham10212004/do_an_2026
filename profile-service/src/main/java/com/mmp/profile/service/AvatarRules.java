package com.mmp.profile.service;

import com.mmp.profile.exception.ApiException;

/** US-37 (PRD-PROF-3) — kiểm tra ảnh đại diện: JPG/PNG (theo chữ ký file, không tin Content-Type), ≤ 2 MB. */
public final class AvatarRules {

    private AvatarRules() {
    }

    public static final int MAX_BYTES = 2 * 1024 * 1024;

    /** Trả content type chuẩn (image/jpeg | image/png) theo magic bytes. */
    public static String detectType(byte[] data) {
        if (data == null || data.length == 0) {
            throw ApiException.badRequest("INVALID_AVATAR", "Chưa chọn ảnh");
        }
        if (data.length > MAX_BYTES) {
            throw ApiException.badRequest("AVATAR_TOO_LARGE", "Ảnh đại diện tối đa 2 MB");
        }
        if (data.length >= 3 && (data[0] & 0xFF) == 0xFF && (data[1] & 0xFF) == 0xD8 && (data[2] & 0xFF) == 0xFF) {
            return "image/jpeg";
        }
        if (data.length >= 8 && (data[0] & 0xFF) == 0x89 && data[1] == 'P' && data[2] == 'N' && data[3] == 'G'
                && data[4] == 0x0D && data[5] == 0x0A && data[6] == 0x1A && data[7] == 0x0A) {
            return "image/png";
        }
        throw ApiException.badRequest("INVALID_AVATAR", "Chỉ nhận ảnh JPG hoặc PNG");
    }
}
