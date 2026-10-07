package com.mmp.payment.security;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** NFR-9 — profile prod không được khởi động với bí mật dev mặc định. */
class DevSecretsWarningTest {

    private static final String REAL_SECRET = "a-real-secret-0123456789-0123456789-0123456789";

    private static MockEnvironment env(String profile) {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles(profile);
        return env;
    }

    @Test
    void prodWithDevSecretsFailsStartup() {
        assertThatThrownBy(() -> new DevSecretsWarning(DevSecretsWarning.DEV_JWT_SECRET, "real-key", env("prod")))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("JWT_SECRET");
        assertThatThrownBy(() -> new DevSecretsWarning(REAL_SECRET, DevSecretsWarning.DEV_INTERNAL_API_KEY, env("prod")))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("INTERNAL_API_KEY");
    }

    @Test
    void prodWithRealSecretsStarts() {
        assertThatCode(() -> new DevSecretsWarning(REAL_SECRET, "real-key", env("prod"))).doesNotThrowAnyException();
    }

    @Test
    void nonProdWithDevSecretsOnlyWarns() {
        assertThatCode(() -> new DevSecretsWarning(DevSecretsWarning.DEV_JWT_SECRET, DevSecretsWarning.DEV_INTERNAL_API_KEY, env("dev")))
                .doesNotThrowAnyException();
    }
}
