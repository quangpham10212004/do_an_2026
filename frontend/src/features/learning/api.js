import { api } from "@/lib/api";

// learning-service (Quang)
export const learningApi = {
  courses: (domain = "", q = "") => api(`/api/learning/courses?domain=${encodeURIComponent(domain)}&q=${encodeURIComponent(q)}`),
  myCourses: () => api("/api/learning/me/courses"),
  course: (id) => api(`/api/learning/courses/${id}`),
  enroll: (id) => api(`/api/learning/courses/${id}/enroll`, { method: "POST" }),
  unenroll: (id) => api(`/api/learning/courses/${id}/enroll`, { method: "DELETE" }),
  completeMaterial: (id, done) => api(`/api/learning/materials/${id}/complete`, { method: done ? "POST" : "DELETE" }),
  roadmaps: () => api("/api/learning/roadmaps"),
  roadmap: (id) => api(`/api/learning/roadmaps/${id}`),
  completeRoadmapItem: (id, done) => api(`/api/learning/roadmap-items/${id}/complete`, { method: done ? "POST" : "DELETE" }),
  admin: {
    createCourse: (body) => api("/api/learning/admin/courses", { method: "POST", body }),
    updateCourse: (id, body) => api(`/api/learning/admin/courses/${id}`, { method: "PUT", body }),
    deleteCourse: (id) => api(`/api/learning/admin/courses/${id}`, { method: "DELETE" }),
    createMaterial: (courseId, body) => api(`/api/learning/admin/courses/${courseId}/materials`, { method: "POST", body }),
    deleteMaterial: (id) => api(`/api/learning/admin/materials/${id}`, { method: "DELETE" }),
    createRoadmap: (body) => api("/api/learning/admin/roadmaps", { method: "POST", body }),
    deleteRoadmap: (id) => api(`/api/learning/admin/roadmaps/${id}`, { method: "DELETE" }),
    createRoadmapItem: (roadmapId, body) => api(`/api/learning/admin/roadmaps/${roadmapId}/items`, { method: "POST", body }),
    deleteRoadmapItem: (id) => api(`/api/learning/admin/roadmap-items/${id}`, { method: "DELETE" }),
  },
};
