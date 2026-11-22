import { BookText, ClipboardList, FileText, PlayCircle, type LucideIcon } from "lucide-react";
import type { MaterialType } from "@/types";

/** Biểu tượng và nhãn theo loại tài liệu — dùng chung trang khoá học và trang bài học. */
export const MATERIAL_TYPES: Record<MaterialType, [LucideIcon, string]> = {
  ARTICLE: [FileText, "Bài viết"],
  VIDEO: [PlayCircle, "Video"],
  DOCUMENT: [BookText, "Tài liệu"],
  EXERCISE: [ClipboardList, "Bài tập"],
};
