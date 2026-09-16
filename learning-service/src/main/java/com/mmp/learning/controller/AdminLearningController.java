package com.mmp.learning.controller;

import com.mmp.learning.dto.LearningDtos.*;
import com.mmp.learning.entity.Course;
import com.mmp.learning.entity.CourseMaterial;
import com.mmp.learning.entity.Roadmap;
import com.mmp.learning.entity.RoadmapItem;
import com.mmp.learning.service.LearningService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/** FR-3.4 — Admin quản lý nội dung Learning Hub. */
@RestController
@RequestMapping("/api/learning/admin")
@PreAuthorize("hasRole('ADMIN')")
public class AdminLearningController {

    private final LearningService learningService;

    public AdminLearningController(LearningService learningService) {
        this.learningService = learningService;
    }

    @PostMapping("/courses")
    @ResponseStatus(HttpStatus.CREATED)
    public Course createCourse(@Valid @RequestBody CourseInput in) {
        return learningService.saveCourse(null, in);
    }

    @PutMapping("/courses/{id}")
    public Course updateCourse(@PathVariable UUID id, @Valid @RequestBody CourseInput in) {
        return learningService.saveCourse(id, in);
    }

    @DeleteMapping("/courses/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteCourse(@PathVariable UUID id) {
        learningService.deleteCourse(id);
    }

    @PostMapping("/courses/{courseId}/materials")
    @ResponseStatus(HttpStatus.CREATED)
    public CourseMaterial createMaterial(@PathVariable UUID courseId, @Valid @RequestBody MaterialInput in) {
        return learningService.saveMaterial(courseId, null, in);
    }

    @PutMapping("/materials/{id}")
    public CourseMaterial updateMaterial(@PathVariable UUID id, @Valid @RequestBody MaterialInput in) {
        return learningService.saveMaterial(null, id, in);
    }

    @DeleteMapping("/materials/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteMaterial(@PathVariable UUID id) {
        learningService.deleteMaterial(id);
    }

    @PostMapping("/roadmaps")
    @ResponseStatus(HttpStatus.CREATED)
    public Roadmap createRoadmap(@Valid @RequestBody RoadmapInput in) {
        return learningService.saveRoadmap(null, in);
    }

    @PutMapping("/roadmaps/{id}")
    public Roadmap updateRoadmap(@PathVariable UUID id, @Valid @RequestBody RoadmapInput in) {
        return learningService.saveRoadmap(id, in);
    }

    @DeleteMapping("/roadmaps/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteRoadmap(@PathVariable UUID id) {
        learningService.deleteRoadmap(id);
    }

    @PostMapping("/roadmaps/{roadmapId}/items")
    @ResponseStatus(HttpStatus.CREATED)
    public RoadmapItem createItem(@PathVariable UUID roadmapId, @Valid @RequestBody RoadmapItemInput in) {
        return learningService.saveRoadmapItem(roadmapId, null, in);
    }

    @PutMapping("/roadmap-items/{id}")
    public RoadmapItem updateItem(@PathVariable UUID id, @Valid @RequestBody RoadmapItemInput in) {
        return learningService.saveRoadmapItem(null, id, in);
    }

    @DeleteMapping("/roadmap-items/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteItem(@PathVariable UUID id) {
        learningService.deleteRoadmapItem(id);
    }
}
