import type { Uuid } from "./common";
import type { Level } from "./profile";

// contracts/learning-service.yaml
export type MaterialType = "ARTICLE" | "VIDEO" | "DOCUMENT" | "EXERCISE";

export interface CourseSummary {
  id: Uuid;
  title: string;
  description: string;
  domain: string;
  level: Level;
  skills: string[];
  coverUrl: string | null;
  instructor: string | null;
  materialCount: number;
  durationMinutes: number;
  enrolled: boolean;
  percentComplete: number;
}

export interface Material {
  id: Uuid;
  title: string;
  type: MaterialType;
  url: string | null;
  content: string | null;
  orderIndex: number;
  durationMinutes: number;
  completed: boolean;
}

export interface CourseDetail extends CourseSummary {
  enrollmentCount: number;
  outcomes: string[];
  nextMaterialId: Uuid | null;
  materials: Material[];
}

export interface RoadmapSummary {
  id: Uuid;
  title: string;
  track: string;
  description: string;
  coverUrl: string | null;
  level: Level;
  estimatedWeeks: number | null;
  itemCount: number;
  percentComplete: number;
}

export interface RoadmapItem {
  id: Uuid;
  title: string;
  description: string;
  orderIndex: number;
  stage: string | null;
  estimatedHours: number | null;
  courseId: Uuid | null;
  courseTitle: string | null;
  courseCoverUrl: string | null;
  /** Chỉ có khi mục gắn khoá học; mục tự hoàn thành khi khoá đạt 100% */
  coursePercent: number | null;
  completed: boolean;
}

export interface RoadmapDetail {
  id: Uuid;
  title: string;
  track: string;
  description: string;
  coverUrl: string | null;
  level: Level;
  estimatedWeeks: number | null;
  percentComplete: number;
  nextItemId: Uuid | null;
  items: RoadmapItem[];
}

export interface CourseInput {
  title: string;
  description: string;
  domain: string;
  level: Level;
  skills: string[];
  coverUrl?: string;
  instructor?: string;
  outcomes?: string[];
}

export interface MaterialInput {
  title: string;
  type: MaterialType;
  url?: string;
  content?: string;
  durationMinutes?: number;
}

export interface RoadmapInput {
  title: string;
  track: string;
  description: string;
  coverUrl?: string;
  level?: Level;
  estimatedWeeks?: number;
}

export interface RoadmapItemInput {
  title: string;
  description: string;
  stage?: string;
  estimatedHours?: number;
  courseId: Uuid | null;
}
