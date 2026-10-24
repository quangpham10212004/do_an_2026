-- 004 — G6 (docs/design-ai-matching-spec.md): đánh dấu mentor vượt ngân sách (C11, ngân sách mềm)
-- ngay trong match_impressions, để tỉ lệ "Không phù hợp" theo hạng (M3) tách được hai nhóm — trước
-- đây hạng của nhóm vượt ngân sách là hạng trong danh sách đã NỐI, trộn lẫn hai nhóm trong cùng một
-- con số, làm lệch M3 cho nhóm mentor trong ngân sách.
--
-- DEFAULT false: các dòng cũ (trước khi có ngân sách mềm, hoặc trước migration này) coi là trong
-- ngân sách — đúng với hành vi trước đây (không có khái niệm vượt ngân sách).

ALTER TABLE match_impressions ADD COLUMN IF NOT EXISTS over_budget BOOLEAN NOT NULL DEFAULT false;
