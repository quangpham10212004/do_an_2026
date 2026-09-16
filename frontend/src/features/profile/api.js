import { api } from "@/lib/api";

// profile-service (Thảo)
export const profileApi = {
  getMentor: (id) => api(`/api/profile/mentor/${id}`),
  saveMentor: (id, body) => api(`/api/profile/mentor/${id}`, { method: "PUT", body }),
  getAvailability: (id) => api(`/api/profile/mentor/${id}/availability`),
  saveAvailability: (id, slots) => api(`/api/profile/mentor/${id}/availability`, { method: "PUT", body: { slots } }),
  getMentee: (id) => api(`/api/profile/mentee/${id}`),
  saveMentee: (id, body) => api(`/api/profile/mentee/${id}`, { method: "PUT", body }),
  searchMentors: ({ domain = "", q = "", page = 0, includeUnverified = false } = {}) =>
    api(`/api/profile/mentors?domain=${encodeURIComponent(domain)}&q=${encodeURIComponent(q)}&page=${page}&includeUnverified=${includeUnverified}`),
  rebuildEmbeddings: (force) => api(`/api/profile/admin/embeddings/rebuild?force=${force}`, { method: "POST" }),
};

export const DOMAINS = [
  ["backend", "Backend"],
  ["frontend", "Frontend"],
  ["fullstack", "Fullstack"],
  ["devops", "DevOps / Cloud"],
  ["data", "Data / AI"],
  ["mobile", "Mobile"],
];
