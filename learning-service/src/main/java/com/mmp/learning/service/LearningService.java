package com.mmp.learning.service;

import com.mmp.learning.dto.LearningDtos.*;
import com.mmp.learning.entity.*;
import com.mmp.learning.exception.ApiException;
import com.mmp.learning.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class LearningService {

    private final CourseRepository courseRepo;
    private final CourseMaterialRepository materialRepo;
    private final CourseProgressRepository progressRepo;
    private final RoadmapRepository roadmapRepo;
    private final RoadmapItemRepository itemRepo;
    private final ProgressJdbcRepository progressJdbc;

    public LearningService(CourseRepository courseRepo, CourseMaterialRepository materialRepo,
                           CourseProgressRepository progressRepo, RoadmapRepository roadmapRepo,
                           RoadmapItemRepository itemRepo, ProgressJdbcRepository progressJdbc) {
        this.courseRepo = courseRepo;
        this.materialRepo = materialRepo;
        this.progressRepo = progressRepo;
        this.roadmapRepo = roadmapRepo;
        this.itemRepo = itemRepo;
        this.progressJdbc = progressJdbc;
    }

    // ---------------- Courses (FR-3.1) ----------------

    @Transactional(readOnly = true)
    public List<CourseSummary> listCourses(UUID userId, String domain, String q, boolean enrolledOnly) {
        Set<UUID> enrolled = progressJdbc.enrolledCourseIds(userId);
        return courseRepo.search(blankToNull(domain), blankToNull(q)).stream()
                .filter(c -> !enrolledOnly || enrolled.contains(c.getId()))
                .map(c -> new CourseSummary(c.getId(), c.getTitle(), c.getDescription(), c.getDomain(), c.getLevel(),
                        Arrays.asList(c.getSkills()), materialRepo.countByCourseId(c.getId()), enrolled.contains(c.getId()),
                        percent(c.getId(), userId)))
                .toList();
    }

    @Transactional(readOnly = true)
    public CourseDetail courseDetail(UUID courseId, UUID userId) {
        Course c = findCourse(courseId);
        Set<UUID> done = progressJdbc.completedMaterialIds(courseId, userId);
        List<MaterialView> materials = materialRepo.findByCourseIdOrderByOrderIndexAsc(courseId).stream()
                .map(m -> new MaterialView(m.getId(), m.getTitle(), m.getType(), m.getUrl(), m.getContent(),
                        m.getOrderIndex(), done.contains(m.getId())))
                .toList();
        return new CourseDetail(c.getId(), c.getTitle(), c.getDescription(), c.getDomain(), c.getLevel(),
                Arrays.asList(c.getSkills()), progressJdbc.isEnrolled(courseId, userId), percent(courseId, userId),
                progressJdbc.enrollmentCount(courseId), materials);
    }

    @Transactional
    public CourseDetail enroll(UUID courseId, UUID userId) {
        findCourse(courseId);
        progressJdbc.enroll(courseId, userId);
        recalculate(courseId, userId);
        return courseDetail(courseId, userId);
    }

    @Transactional
    public void unenroll(UUID courseId, UUID userId) {
        progressJdbc.unenroll(courseId, userId);
    }

    // ---------------- Progress (FR-3.3) ----------------

    @Transactional(readOnly = true)
    public Progress progress(UUID courseId, UUID userId) {
        findCourse(courseId);
        return new Progress(courseId, userId, percent(courseId, userId));
    }

    /** Đánh dấu hoàn thành/bỏ hoàn thành 1 tài liệu và tính lại % của khoá (tự ghi danh nếu chưa). */
    @Transactional
    public CourseDetail setMaterialCompleted(UUID materialId, UUID userId, boolean completed) {
        CourseMaterial m = materialRepo.findById(materialId)
                .orElseThrow(() -> ApiException.notFound("MATERIAL_NOT_FOUND", "Không tìm thấy tài liệu"));
        progressJdbc.enroll(m.getCourseId(), userId);
        if (completed) {
            progressJdbc.completeMaterial(materialId, userId);
        } else {
            progressJdbc.uncompleteMaterial(materialId, userId);
        }
        recalculate(m.getCourseId(), userId);
        return courseDetail(m.getCourseId(), userId);
    }

    /** percent = số tài liệu đã hoàn thành / tổng số tài liệu của khoá × 100 */
    static float computePercent(long completed, long total) {
        if (total <= 0) return 0f;
        return Math.round(Math.min(completed, total) * 1000f / total) / 10f;
    }

    private void recalculate(UUID courseId, UUID userId) {
        long total = materialRepo.countByCourseId(courseId);
        long completed = progressJdbc.completedMaterialIds(courseId, userId).size();
        CourseProgress p = progressRepo.findByCourseIdAndUserId(courseId, userId)
                .orElseGet(() -> new CourseProgress(courseId, userId));
        p.setPercentComplete(computePercent(completed, total));
        progressRepo.save(p);
    }

    private float percent(UUID courseId, UUID userId) {
        return progressRepo.findByCourseIdAndUserId(courseId, userId).map(CourseProgress::getPercentComplete).orElse(0f);
    }

    // ---------------- Roadmaps (FR-3.2, FR-3.3) ----------------

    @Transactional(readOnly = true)
    public List<RoadmapSummary> listRoadmaps() {
        return roadmapRepo.findAllByOrderByCreatedAtAsc().stream()
                .map(r -> new RoadmapSummary(r.getId(), r.getTitle(), r.getTrack(), r.getDescription(),
                        itemRepo.findByRoadmapIdOrderByOrderIndexAsc(r.getId()).size()))
                .toList();
    }

    @Transactional(readOnly = true)
    public RoadmapDetail roadmapDetail(UUID roadmapId, UUID userId) {
        Roadmap r = roadmapRepo.findById(roadmapId)
                .orElseThrow(() -> ApiException.notFound("ROADMAP_NOT_FOUND", "Không tìm thấy roadmap"));
        List<RoadmapItem> items = itemRepo.findByRoadmapIdOrderByOrderIndexAsc(roadmapId);
        Set<UUID> done = progressJdbc.completedRoadmapItemIds(roadmapId, userId);
        Map<UUID, String> courseTitles = courseRepo.findAllById(items.stream().map(RoadmapItem::getCourseId)
                        .filter(Objects::nonNull).collect(Collectors.toSet())).stream()
                .collect(Collectors.toMap(Course::getId, Course::getTitle, (a, b) -> a));
        List<RoadmapItemView> views = items.stream()
                .map(i -> new RoadmapItemView(i.getId(), i.getTitle(), i.getDescription(), i.getOrderIndex(),
                        i.getCourseId(), courseTitles.get(i.getCourseId()), done.contains(i.getId())))
                .toList();
        return new RoadmapDetail(r.getId(), r.getTitle(), r.getTrack(), r.getDescription(),
                computePercent(done.size(), items.size()), views);
    }

    @Transactional
    public RoadmapDetail setRoadmapItemCompleted(UUID itemId, UUID userId, boolean completed) {
        RoadmapItem item = itemRepo.findById(itemId)
                .orElseThrow(() -> ApiException.notFound("ROADMAP_ITEM_NOT_FOUND", "Không tìm thấy mục roadmap"));
        if (completed) {
            progressJdbc.completeRoadmapItem(itemId, userId);
        } else {
            progressJdbc.uncompleteRoadmapItem(itemId, userId);
        }
        return roadmapDetail(item.getRoadmapId(), userId);
    }

    // ---------------- Admin content management (FR-3.4) ----------------

    @Transactional
    public Course saveCourse(UUID id, CourseInput in) {
        Course c = id == null ? new Course() : findCourse(id);
        c.setTitle(in.title().trim());
        c.setDescription(in.description());
        c.setDomain(in.domain().trim().toLowerCase());
        if (in.level() != null) c.setLevel(in.level());
        c.setSkills(in.skills() == null ? new String[0] : in.skills().stream().map(String::trim).distinct().toArray(String[]::new));
        return courseRepo.save(c);
    }

    @Transactional
    public void deleteCourse(UUID id) {
        courseRepo.delete(findCourse(id));
    }

    @Transactional
    public CourseMaterial saveMaterial(UUID courseId, UUID materialId, MaterialInput in) {
        CourseMaterial m;
        if (materialId == null) {
            findCourse(courseId);
            m = new CourseMaterial();
            m.setCourseId(courseId);
            m.setOrderIndex((int) materialRepo.countByCourseId(courseId) + 1);
        } else {
            m = materialRepo.findById(materialId)
                    .orElseThrow(() -> ApiException.notFound("MATERIAL_NOT_FOUND", "Không tìm thấy tài liệu"));
        }
        m.setTitle(in.title().trim());
        if (in.type() != null) m.setType(in.type());
        m.setUrl(in.url());
        m.setContent(in.content());
        if (in.orderIndex() != null) m.setOrderIndex(in.orderIndex());
        return materialRepo.save(m);
    }

    @Transactional
    public void deleteMaterial(UUID materialId) {
        materialRepo.deleteById(materialId);
    }

    @Transactional
    public Roadmap saveRoadmap(UUID id, RoadmapInput in) {
        Roadmap r = id == null ? new Roadmap() : roadmapRepo.findById(id)
                .orElseThrow(() -> ApiException.notFound("ROADMAP_NOT_FOUND", "Không tìm thấy roadmap"));
        r.setTitle(in.title().trim());
        r.setTrack(in.track().trim());
        r.setDescription(in.description());
        return roadmapRepo.save(r);
    }

    @Transactional
    public void deleteRoadmap(UUID id) {
        roadmapRepo.deleteById(id);
    }

    @Transactional
    public RoadmapItem saveRoadmapItem(UUID roadmapId, UUID itemId, RoadmapItemInput in) {
        RoadmapItem i;
        if (itemId == null) {
            roadmapRepo.findById(roadmapId).orElseThrow(() -> ApiException.notFound("ROADMAP_NOT_FOUND", "Không tìm thấy roadmap"));
            i = new RoadmapItem();
            i.setRoadmapId(roadmapId);
            i.setOrderIndex(itemRepo.findByRoadmapIdOrderByOrderIndexAsc(roadmapId).size() + 1);
        } else {
            i = itemRepo.findById(itemId).orElseThrow(() -> ApiException.notFound("ROADMAP_ITEM_NOT_FOUND", "Không tìm thấy mục roadmap"));
        }
        if (in.courseId() != null) findCourse(in.courseId());
        i.setTitle(in.title().trim());
        i.setDescription(in.description());
        i.setCourseId(in.courseId());
        if (in.orderIndex() != null) i.setOrderIndex(in.orderIndex());
        return itemRepo.save(i);
    }

    @Transactional
    public void deleteRoadmapItem(UUID itemId) {
        itemRepo.deleteById(itemId);
    }

    private Course findCourse(UUID id) {
        return courseRepo.findById(id).orElseThrow(() -> ApiException.notFound("COURSE_NOT_FOUND", "Không tìm thấy khoá học"));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

}
