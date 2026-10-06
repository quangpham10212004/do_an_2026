package com.mmp.mentoring.controller;

import com.mmp.mentoring.dto.MentoringDtos.RelationshipView;
import com.mmp.mentoring.service.MentoringRequestService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Endpoint nội bộ cho ai-service: kiểm tra mentor có đang xét/hướng dẫn mentee hay không
 * trước khi cho mentor tải CV của mentee đó.
 */
@RestController
@RequestMapping("/internal/relationships")
public class InternalRelationshipController {

    private final MentoringRequestService requests;

    public InternalRelationshipController(MentoringRequestService requests) {
        this.requests = requests;
    }

    @GetMapping
    public RelationshipView relationship(@RequestParam UUID mentorId, @RequestParam UUID menteeId) {
        return requests.relationship(mentorId, menteeId);
    }
}
