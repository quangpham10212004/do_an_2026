package com.mmp.profile.security;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** NFR-9 — profile prod phải từ chối khởi động khi còn dùng khoá dev mặc định. */
class DevSecretsWarningTest {

    private static final String REAL_SECRET = "x".repeat(64);

    private static MockEnvironment env(String... profiles) {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles(profiles);
        return env;
    }

    @Test
    void prodProfileFailsWithDevJwtSecret() {
        assertThatThrownBy(() -> new DevSecretsWarning(DevSecretsWarning.DEV_JWT_SECRET, "real-key", env("prod")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("JWT_SECRET");
    }

    @Test
    void prodProfileFailsWithDevInternalKey() {
        assertThatThrownBy(() -> new DevSecretsWarning(REAL_SECRET, DevSecretsWarning.DEV_INTERNAL_API_KEY, env("prod")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("INTERNAL_API_KEY");
    }

    @Test
    void prodProfileStartsWithRealSecrets() {
        new DevSecretsWarning(REAL_SECRET, "real-key", env("prod"));
    }

    @Test
    void devProfileOnlyWarns() {
        new DevSecretsWarning(DevSecretsWarning.DEV_JWT_SECRET, DevSecretsWarning.DEV_INTERNAL_API_KEY, env());
        assertThat(DevSecretsWarning.devDefaultsInUse(DevSecretsWarning.DEV_JWT_SECRET, DevSecretsWarning.DEV_INTERNAL_API_KEY))
                .containsExactly("JWT_SECRET", "INTERNAL_API_KEY");
    }
}
