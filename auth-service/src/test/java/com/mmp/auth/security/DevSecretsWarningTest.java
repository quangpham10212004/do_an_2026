package com.mmp.auth.security;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** US-10 / NFR-9 — profile prod không được khởi động với bí mật dev mặc định. */
class DevSecretsWarningTest {

    private static final String REAL_SECRET = "x".repeat(64);

    private static MockEnvironment env(String... profiles) {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles(profiles);
        return env;
    }

    @Test
    void detectsEachDevDefault() {
        assertThat(DevSecretsWarning.devDefaultsInUse(DevSecretsWarning.DEV_JWT_SECRET, DevSecretsWarning.DEV_INTERNAL_API_KEY))
                .containsExactly("JWT_SECRET", "INTERNAL_API_KEY");
        assertThat(DevSecretsWarning.devDefaultsInUse(REAL_SECRET, DevSecretsWarning.DEV_INTERNAL_API_KEY))
                .containsExactly("INTERNAL_API_KEY");
        assertThat(DevSecretsWarning.devDefaultsInUse(REAL_SECRET, "real-key")).isEmpty();
    }

    @Test
    void prodProfileWithDevSecretFailsStartup() {
        assertThatThrownBy(() -> new DevSecretsWarning(DevSecretsWarning.DEV_JWT_SECRET, "real-key", env("prod")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("JWT_SECRET");
        assertThatThrownBy(() -> new DevSecretsWarning(REAL_SECRET, DevSecretsWarning.DEV_INTERNAL_API_KEY, env("prod")))
                .hasMessageContaining("INTERNAL_API_KEY");
    }

    @Test
    void prodProfileWithRealSecretsStarts() {
        assertThatCode(() -> new DevSecretsWarning(REAL_SECRET, "real-key", env("prod"))).doesNotThrowAnyException();
    }

    @Test
    void nonProdProfileOnlyWarns() {
        assertThatCode(() -> new DevSecretsWarning(DevSecretsWarning.DEV_JWT_SECRET, DevSecretsWarning.DEV_INTERNAL_API_KEY, env()))
                .doesNotThrowAnyException();
        assertThatCode(() -> new DevSecretsWarning(DevSecretsWarning.DEV_JWT_SECRET, DevSecretsWarning.DEV_INTERNAL_API_KEY, env("dev")))
                .doesNotThrowAnyException();
        assertThatCode(() -> DevSecretsWarning.enforce(false, List.of("JWT_SECRET"))).doesNotThrowAnyException();
    }
}
