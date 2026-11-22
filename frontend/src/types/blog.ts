import type { Uuid } from "./common";

// contracts/learning-service.yaml — Blog
export type BlogStatus = "DRAFT" | "PUBLISHED" | "UNPUBLISHED";

export interface BlogPostSummary {
  id: Uuid;
  slug: string;
  title: string;
  summary: string;
  coverUrl: string | null;
  tags: string[];
  authorId: Uuid;
  authorName: string;
  authorRole: "MENTOR" | "MENTEE" | "ADMIN";
  status: BlogStatus;
  readingMinutes: number;
  likeCount: number;
  commentCount: number;
  publishedAt: string | null;
  liked: boolean;
  bookmarked: boolean;
}

export interface BlogPostDetail extends BlogPostSummary {
  contentMd: string;
  unpublishReason: string | null;
  followingAuthor: boolean;
}

export interface BlogPostPage {
  items: BlogPostSummary[];
  page: number;
  size: number;
  total: number;
}

export interface BlogPostInput {
  visibility?: "PUBLIC" | "UNLISTED";
  title: string;
  summary?: string;
  contentMd: string;
  coverUrl?: string | null;
  tags?: string[];
}

export interface BlogComment {
  id: Uuid;
  postId: Uuid;
  parentId: Uuid | null;
  authorId: Uuid;
  authorName: string;
  body: string;
  status: "VISIBLE" | "REMOVED";
  createdAt: string;
}

export interface BlogTag {
  name: string;
  slug: string;
  postCount: number;
}

export interface BlogAuthor {
  authorId: Uuid;
  authorName: string;
  authorRole: string;
  postCount: number;
  followerCount: number;
  followingCount: number;
  following: boolean;
}

export interface BlogLikeState {
  liked: boolean;
  likeCount: number;
}

export interface BlogReport {
  id: Uuid;
  targetType: "POST" | "COMMENT";
  targetId: Uuid;
  postId: Uuid;
  postTitle: string;
  excerpt: string;
  reporterId: Uuid;
  reason: string;
  status: "OPEN" | "RESOLVED";
  createdAt: string;
}
