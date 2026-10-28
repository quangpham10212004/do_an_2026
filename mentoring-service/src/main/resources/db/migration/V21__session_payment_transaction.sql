-- Mã giao dịch payment-service đã tạm giữ học phí của phiên (callback payment-succeeded).
-- Dùng để callback gọi lại cùng mã là idempotent, và để chỉ xếp một lần hoàn tiền khi tiền về sau lúc phiên đã huỷ / hết hạn.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS payment_transaction_id UUID;
