package com.mmp.mentoring.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mmp.mentoring.exception.ErrorResponse;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

import java.io.IOException;
import java.util.List;

/**
 * Cấu hình bảo mật chung (stateless, JWT):
 * - /health, /actuator/health: công khai.
 * - app.security.public-paths: các đường dẫn công khai riêng của từng service.
 * - /internal/**: chỉ service nội bộ (header X-Internal-Token).
 * - Còn lại: bắt buộc đăng nhập; phân quyền chi tiết theo role bằng @PreAuthorize.
 */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http,
                                            JwtAuthenticationFilter jwtFilter,
                                            ObjectMapper objectMapper,
                                            @Value("${app.security.public-paths:}") List<String> publicPaths)
            throws Exception {
        http.csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> {
                    auth.requestMatchers("/health", "/actuator/health/**", "/error").permitAll();
                    publicPaths.stream().filter(p -> !p.isBlank())
                            .forEach(p -> auth.requestMatchers(p.trim()).permitAll());
                    auth.requestMatchers("/internal/**").hasRole(AuthUser.ROLE_INTERNAL);
                    auth.anyRequest().authenticated();
                })
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((req, res, e) ->
                                writeError(res, objectMapper, 401, "UNAUTHORIZED", "Bạn cần đăng nhập"))
                        .accessDeniedHandler((req, res, e) ->
                                writeError(res, objectMapper, 403, "FORBIDDEN", "Bạn không có quyền truy cập")))
                .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    private static void writeError(HttpServletResponse res, ObjectMapper mapper, int status, String code, String msg)
            throws IOException {
        res.setStatus(status);
        res.setContentType(MediaType.APPLICATION_JSON_VALUE);
        res.setCharacterEncoding("UTF-8");
        mapper.writeValue(res.getOutputStream(), ErrorResponse.of(code, msg));
    }
}
