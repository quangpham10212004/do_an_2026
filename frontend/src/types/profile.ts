import type { Uuid } from "./common";

// contracts/profile-service.yaml
export type VerificationStatus = "PENDING_INTERVIEW" | "PENDING_REVIEW" | "APPROVED" | "REJECTED";
export type Level = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";

export interface AvailabilitySlot {
  id?: Uuid;
  /** ISO-8601: 1 = Thứ Hai … 7 = Chủ Nhật */
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface MentorProfileInput {
  displayName: string;
  skills: string[];
  domain: string;
  bio: string;
  yearsExperience?: number;
  cvFileUrl?: string | null;
  portfolioLinks?: string[];
  hourlyRate?: number;
  capacity?: number;
  isAvailable?: boolean;
}

export interface MentorProfile {
  userId: Uuid;
  displayName: string;
  skills: string[];
  domain: string;
  bio: string | null;
  yearsExperience: number;
  cvFileUrl: string | null;
  portfolioLinks: string[];
  hourlyRate: number;
  capacity: number;
  activeMenteeCount: number;
  isAvailable: boolean;
  rating: number;
  ratingCount: number;
  verificationStatus: VerificationStatus;
  availability: AvailabilitySlot[];
}

export interface MenteeProfileInput {
  displayName: string;
  goal: string;
  domain: string;
  currentLevel?: Level;
  skills?: string[];
  portfolioLinks?: string[];
  cvFileUrl?: string | null;
}

export interface MenteeProfile {
  userId: Uuid;
  displayName: string;
  goal: string | null;
  domain: string;
  currentLevel: Level;
  skills: string[];
  portfolioLinks: string[];
  cvFileUrl: string | null;
}

/** Thẻ mentor ở trang duyệt danh sách (GET /api/profile/mentors). */
export interface MentorCard {
  userId: Uuid;
  displayName: string;
  domain: string;
  skills: string[];
  yearsExperience: number;
  rating: number;
  ratingCount: number;
  hourlyRate: number;
  isAvailable: boolean;
  hasCapacity: boolean;
  verificationStatus: VerificationStatus;
}

export interface MentorSearchParams {
  domain?: string;
  q?: string;
  page?: number;
  size?: number;
  includeUnverified?: boolean;
}
