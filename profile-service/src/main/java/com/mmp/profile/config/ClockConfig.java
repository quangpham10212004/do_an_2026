package com.mmp.profile.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

/** Đồng hồ hệ thống được inject để unit test cố định "hôm nay" (ngoại lệ lịch, nghỉ phép). */
@Configuration
public class ClockConfig {

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }
}
