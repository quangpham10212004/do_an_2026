import { api } from "@/lib/api";
import type {
  CourseDetail,
  CourseInput,
  CourseSummary,
  Material,
  MaterialInput,
  RoadmapDetail,
  RoadmapInput,
  RoadmapItem,
  RoadmapItemInput,
  RoadmapSummary,
  Uuid,
} from "@/types";

// learning-service (Quang)
export const learningApi = {
  courses: (domain = "", q = "") =>
    api<CourseSummary[]>(`/api/learning/courses?domain=${encodeURIComponent(domain)}&q=${encodeURIComponent(q)}`),
  myCourses: () => api<CourseSummary[]>("/api/learning/me/courses"),
  course: (id: Uuid) => api<CourseDetail>(`/api/learning/courses/${id}`),
  enroll: (id: Uuid) => api<CourseDetail>(`/api/learning/courses/${id}/enroll`, { method: "POST" }),
  unenroll: (id: Uuid) => api<null>(`/api/learning/courses/${id}/enroll`, { method: "DELETE" }),
  completeMaterial: (id: Uuid, done: boolean) =>
    api<CourseDetail>(`/api/learning/materials/${id}/complete`, { method: done ? "POST" : "DELETE" }),
  roadmaps: () => api<RoadmapSummary[]>("/api/learning/roadmaps"),
  roadmap: (id: Uuid) => api<RoadmapDetail>(`/api/learning/roadmaps/${id}`),
  completeRoadmapItem: (id: Uuid, done: boolean) =>
    api<RoadmapDetail>(`/api/learning/roadmap-items/${id}/complete`, { method: done ? "POST" : "DELETE" }),
  admin: {
    createCourse: (body: CourseInput) => api<CourseDetail>("/api/learning/admin/courses", { method: "POST", body }),
    updateCourse: (id: Uuid, body: CourseInput) => api<CourseDetail>(`/api/learning/admin/courses/${id}`, { method: "PUT", body }),
    deleteCourse: (id: Uuid) => api<null>(`/api/learning/admin/courses/${id}`, { method: "DELETE" }),
    createMaterial: (courseId: Uuid, body: MaterialInput) =>
      api<Material>(`/api/learning/admin/courses/${courseId}/materials`, { method: "POST", body }),
    deleteMaterial: (id: Uuid) => api<null>(`/api/learning/admin/materials/${id}`, { method: "DELETE" }),
    createRoadmap: (body: RoadmapInput) => api<RoadmapDetail>("/api/learning/admin/roadmaps", { method: "POST", body }),
    deleteRoadmap: (id: Uuid) => api<null>(`/api/learning/admin/roadmaps/${id}`, { method: "DELETE" }),
    createRoadmapItem: (roadmapId: Uuid, body: RoadmapItemInput) =>
      api<RoadmapItem>(`/api/learning/admin/roadmaps/${roadmapId}/items`, { method: "POST", body }),
    deleteRoadmapItem: (id: Uuid) => api<null>(`/api/learning/admin/roadmap-items/${id}`, { method: "DELETE" }),
  },
};
