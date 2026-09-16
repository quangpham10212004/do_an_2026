package com.mmp.mentoring;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class MentoringServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(MentoringServiceApplication.class, args);
    }
}
