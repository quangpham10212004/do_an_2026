-- Dọn di sản: yêu cầu trạng thái COMPLETED đã được V12 đổi sang ENDED (bản chốt: bỏ hẳn trạng thái cũ), bảng late_cancellations
-- thuộc cơ chế "huỷ muộn phiên miễn phí" đã bỏ từ v2.0. payment_outbox giữ kind REWARD vì có thể còn dòng cũ chưa gửi.
UPDATE mentoring_requests SET status = 'ENDED', end_reason = COALESCE(end_reason, 'OTHER'),
       ended_at = COALESCE(ended_at, responded_at, created_at)
 WHERE status = 'COMPLETED';
ALTER TABLE mentoring_requests DROP CONSTRAINT IF EXISTS mentoring_requests_status_check;
ALTER TABLE mentoring_requests ADD CONSTRAINT mentoring_requests_status_check
    CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'ENDED'));
DROP TABLE IF EXISTS late_cancellations;
