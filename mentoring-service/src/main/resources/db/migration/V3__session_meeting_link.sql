-- US-04 (PRD-SES-3) — link phòng họp của phiên: sao chép từ hồ sơ mentor lúc đặt lịch, mentor có thể đổi riêng
-- cho từng phiên. API chỉ trả link khi phiên đã CONFIRMED (hoặc trạng thái sau đó).
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS meeting_link TEXT;
