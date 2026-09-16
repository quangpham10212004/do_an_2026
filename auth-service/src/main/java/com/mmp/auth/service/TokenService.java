package com.mmp.auth.service;

import com.mmp.auth.entity.RefreshToken;
import com.mmp.auth.entity.User;
import com.mmp.auth.repository.RefreshTokenRepository;
import com.mmp.auth.security.JwtService;
import io.jsonwebtoken.Jwts;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.Date;
import java.util.HexFormat;

/**
 * Cấp phát token:
 * - Access token: JWT HS256, sống ngắn (mặc định 30 phút), chứa userId/email/role.
 * - Refresh token: chuỗi ngẫu nhiên 256-bit, chỉ lưu hash SHA-256 trong DB.
 */
@Service
public class TokenService {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final JwtService jwtService;
    private final RefreshTokenRepository refreshTokenRepository;
    private final Duration accessTokenTtl;
    private final Duration refreshTokenTtl;

    public TokenService(JwtService jwtService,
                        RefreshTokenRepository refreshTokenRepository,
                        @Value("${app.jwt.access-token-ttl}") Duration accessTokenTtl,
                        @Value("${app.jwt.refresh-token-ttl}") Duration refreshTokenTtl) {
        this.jwtService = jwtService;
        this.refreshTokenRepository = refreshTokenRepository;
        this.accessTokenTtl = accessTokenTtl;
        this.refreshTokenTtl = refreshTokenTtl;
    }

    public record IssuedTokens(String accessToken, String refreshToken, long expiresInSeconds) {
    }

    public IssuedTokens issue(User user) {
        Instant now = Instant.now();
        String accessToken = Jwts.builder()
                .subject(user.getId().toString())
                .claim("email", user.getEmail())
                .claim("role", user.getRole().name())
                .claim("typ", "access")
                .issuer("mmp-auth-service")
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(accessTokenTtl)))
                .signWith(jwtService.signingKey(), Jwts.SIG.HS256)
                .compact();

        String refreshToken = randomToken();
        refreshTokenRepository.save(new RefreshToken(
                user.getId(), sha256(refreshToken), OffsetDateTime.now().plus(refreshTokenTtl)));
        return new IssuedTokens(accessToken, refreshToken, accessTokenTtl.toSeconds());
    }

    public static String randomToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    public static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
