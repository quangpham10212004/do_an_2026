package com.mmp.payment.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Gắn danh tính vào SecurityContext cho mỗi request:
 * - Header X-Internal-Token hợp lệ  => principal INTERNAL (service-to-service).
 * - Header Authorization: Bearer <jwt> hợp lệ => principal là user trong token.
 * Request không có thông tin xác thực vẫn đi tiếp; SecurityConfig quyết định
 * endpoint nào yêu cầu đăng nhập.
 */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    public static final String INTERNAL_HEADER = "X-Internal-Token";

    private final JwtService jwtService;
    private final byte[] internalApiKey;

    public JwtAuthenticationFilter(JwtService jwtService,
                                   @Value("${app.security.internal-api-key}") String internalApiKey) {
        this.jwtService = jwtService;
        this.internalApiKey = internalApiKey.getBytes(StandardCharsets.UTF_8);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String internalToken = request.getHeader(INTERNAL_HEADER);
        if (internalToken != null
                && MessageDigest.isEqual(internalApiKey, internalToken.getBytes(StandardCharsets.UTF_8))) {
            authenticate(new AuthUser(null, null, AuthUser.ROLE_INTERNAL));
        } else {
            String header = request.getHeader(HttpHeaders.AUTHORIZATION);
            if (header != null && header.startsWith("Bearer ")) {
                jwtService.parse(header.substring(7)).ifPresent(this::authenticate);
            }
        }
        chain.doFilter(request, response);
    }

    private void authenticate(AuthUser user) {
        var auth = new UsernamePasswordAuthenticationToken(
                user, null, List.of(new SimpleGrantedAuthority("ROLE_" + user.role())));
        SecurityContextHolder.getContext().setAuthentication(auth);
    }
}
