-- 012 — Lưu nguyên văn hội thoại buổi phỏng vấn giọng nói (v2.1).
-- transcript = [{role: marker|assistant|user, text?, topicNo?}] theo đúng thứ tự cuộc gọi — giống practice_interviews.transcript.
-- Lượt chấm (interview_turns) gộp theo chủ đề nên mất câu hỏi nối tiếp; bản ghi này để mentor / admin xem lại AI đã hỏi gì,
-- mentor đã nói gì. NULL = buổi chat hoặc buổi giọng nói trước 012.
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS transcript JSONB;
