package com.mmp.learning.controller;

import com.mmp.learning.dto.LearningDtos.*;
import com.mmp.learning.security.CurrentUser;
import com.mmp.learning.service.LearningService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/learning")
public class LearningController {

    private final LearningService learningService;

    public LearningController(LearningService learningService) {
        this.learningService = learningService;
    }

    @GetMapping("/courses")
    public List<CourseSummary> courses(@RequestParam(required = false) String domain,
                                       @RequestParam(required = false) String q) {
        return learningService.listCourses(CurrentUser.get().userId(), domain, q, false);
    }

    @GetMapping("/me/courses")
    public List<CourseSummary> myCourses() {
        return learningService.listCourses(CurrentUser.get().userId(), null, null, true);
    }

    @GetMapping("/courses/{courseId}")
    public CourseDetail course(@PathVariable UUID courseId) {
        return learningService.courseDetail(courseId, CurrentUser.get().userId());
    }

    @PostMapping("/courses/{courseId}/enroll")
    public CourseDetail enroll(@PathVariable UUID courseId) {
        return learningService.enroll(courseId, CurrentUser.get().userId());
    }

    @DeleteMapping("/courses/{courseId}/enroll")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unenroll(@PathVariable UUID courseId) {
        learningService.unenroll(courseId, CurrentUser.get().userId());
    }

    @GetMapping("/courses/{courseId}/progress/{userId}")
    public Progress progress(@PathVariable UUID courseId, @PathVariable UUID userId) {
        CurrentUser.requireAccess(userId);
        return learningService.progress(courseId, userId);
    }

    @PostMapping("/materials/{materialId}/complete")
    public CourseDetail completeMaterial(@PathVariable UUID materialId) {
        return learningService.setMaterialCompleted(materialId, CurrentUser.get().userId(), true);
    }

    @DeleteMapping("/materials/{materialId}/complete")
    public CourseDetail uncompleteMaterial(@PathVariable UUID materialId) {
        return learningService.setMaterialCompleted(materialId, CurrentUser.get().userId(), false);
    }

    @GetMapping("/roadmaps")
    public List<RoadmapSummary> roadmaps() {
        return learningService.listRoadmaps();
    }

    @GetMapping("/roadmaps/{roadmapId}")
    public RoadmapDetail roadmap(@PathVariable UUID roadmapId) {
        return learningService.roadmapDetail(roadmapId, CurrentUser.get().userId());
    }

    @PostMapping("/roadmap-items/{itemId}/complete")
    public RoadmapDetail completeItem(@PathVariable UUID itemId) {
        return learningService.setRoadmapItemCompleted(itemId, CurrentUser.get().userId(), true);
    }

    @DeleteMapping("/roadmap-items/{itemId}/complete")
    public RoadmapDetail uncompleteItem(@PathVariable UUID itemId) {
        return learningService.setRoadmapItemCompleted(itemId, CurrentUser.get().userId(), false);
    }
}
