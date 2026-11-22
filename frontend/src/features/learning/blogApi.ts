import { api } from "@/lib/api";
import type {
  BlogAuthor,
  BlogComment,
  BlogLikeState,
  BlogPostDetail,
  BlogPostInput,
  BlogPostPage,
  BlogPostSummary,
  BlogReport,
  BlogTag,
  Uuid,
} from "@/types";

const BASE = "/api/learning/blog";

/** Bài đã bị admin gỡ (GET /api/learning/admin/blog/removed). */
export interface RemovedBlogPost {
  id: Uuid; slug: string; title: string; authorId: Uuid; authorName: string; publishedAt: string | null;
  views: number; unpublishReason: string; unpublishedAt: string;
}

// learning-service (Quang) — module blog
export const blogApi = {
  posts: (params: { tag?: string; q?: string; author?: string; page?: number; size?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.tag) qs.set("tag", params.tag);
    if (params.q) qs.set("q", params.q);
    if (params.author) qs.set("author", params.author);
    qs.set("page", String(params.page ?? 0));
    qs.set("size", String(params.size ?? 10));
    return api<BlogPostPage>(`${BASE}/posts?${qs}`);
  },
  feed: (page = 0, size = 10) => api<BlogPostPage>(`${BASE}/feed?page=${page}&size=${size}`),
  bySlug: (slug: string) => api<BlogPostDetail>(`${BASE}/posts/${encodeURIComponent(slug)}`),
  forEdit: (id: Uuid) => api<BlogPostDetail>(`${BASE}/posts/${id}/edit`),
  create: (body: BlogPostInput) => api<BlogPostDetail>(`${BASE}/posts`, { method: "POST", body }),
  update: (id: Uuid, body: BlogPostInput) => api<BlogPostDetail>(`${BASE}/posts/${id}`, { method: "PUT", body }),
  remove: (id: Uuid) => api<null>(`${BASE}/posts/${id}`, { method: "DELETE" }),
  publish: (id: Uuid) => api<BlogPostDetail>(`${BASE}/posts/${id}/publish`, { method: "POST" }),
  unpublish: (id: Uuid) => api<BlogPostDetail>(`${BASE}/posts/${id}/unpublish`, { method: "POST" }),
  myPosts: () => api<BlogPostSummary[]>(`${BASE}/me/posts`),
  myBookmarks: () => api<BlogPostSummary[]>(`${BASE}/me/bookmarks`),
  tags: () => api<BlogTag[]>(`${BASE}/tags`),
  like: (id: Uuid, on: boolean) => api<BlogLikeState>(`${BASE}/posts/${id}/like`, { method: on ? "PUT" : "DELETE" }),
  bookmark: (id: Uuid, on: boolean) => api<null>(`${BASE}/posts/${id}/bookmark`, { method: on ? "PUT" : "DELETE" }),
  comments: (id: Uuid) => api<BlogComment[]>(`${BASE}/posts/${id}/comments`),
  comment: (id: Uuid, body: string, parentId?: Uuid | null) =>
    api<BlogComment>(`${BASE}/posts/${id}/comments`, { method: "POST", body: { body, parentId: parentId ?? null } }),
  removeComment: (id: Uuid) => api<null>(`${BASE}/comments/${id}`, { method: "DELETE" }),
  myFollowing: () => api<BlogAuthor[]>(`${BASE}/me/following`),
  author: (id: Uuid) => api<BlogAuthor>(`${BASE}/authors/${id}`),
  follow: (id: Uuid, on: boolean) => api<null>(`${BASE}/authors/${id}/follow`, { method: on ? "PUT" : "DELETE" }),
  reportPost: (id: Uuid, reason: string) => api<null>(`${BASE}/posts/${id}/report`, { method: "POST", body: { reason } }),
  reportComment: (id: Uuid, reason: string) => api<null>(`${BASE}/comments/${id}/report`, { method: "POST", body: { reason } }),
  admin: {
    removed: () => api<RemovedBlogPost[]>(`/api/learning/admin/blog/removed`),
    reports: (status: "OPEN" | "RESOLVED" = "OPEN") => api<BlogReport[]>(`/api/learning/admin/blog/reports?status=${status}`),
    unpublish: (id: Uuid, reason: string) =>
      api<BlogPostDetail>(`/api/learning/admin/blog/posts/${id}/unpublish`, { method: "POST", body: { reason } }),
    removeComment: (id: Uuid) => api<null>(`/api/learning/admin/blog/comments/${id}/remove`, { method: "POST" }),
    resolve: (id: Uuid) => api<null>(`/api/learning/admin/blog/reports/${id}/resolve`, { method: "POST" }),
  },
};
