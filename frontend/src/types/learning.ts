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
  materialCount: number;
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
  completed: boolean;
}

export interface CourseDetail extends CourseSummary {
  enrollmentCount: number;
  materials: Material[];
}

export interface RoadmapSummary {
  id: Uuid;
  title: string;
  track: string;
  description: string;
  itemCount: number;
}

export interface RoadmapItem {
  id: Uuid;
  title: string;
  description: string;
  orderIndex: number;
  courseId: Uuid | null;
  courseTitle: string | null;
  completed: boolean;
}

export interface RoadmapDetail {
  id: Uuid;
  title: string;
  track: string;
  description: string;
  percentComplete: number;
  items: RoadmapItem[];
}

export interface CourseInput {
  title: string;
  description: string;
  domain: string;
  level: Level;
  skills: string[];
}

export interface MaterialInput {
  title: string;
  type: MaterialType;
  url?: string;
  content?: string;
}

export interface RoadmapInput {
  title: string;
  track: string;
  description: string;
}

export interface RoadmapItemInput {
  title: string;
  description: string;
  courseId: Uuid | null;
}
