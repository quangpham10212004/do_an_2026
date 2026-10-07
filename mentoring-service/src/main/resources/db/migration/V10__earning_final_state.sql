-- US-25 (PRD-PAY-3, PRD-SES-9) — mentoring-service báo trạng thái cuối của phiên có phí cho payment-service
-- (POST /internal/payments/sessions/{id}/final-state) qua outbox; payment-service giữ đồng hồ 48 giờ giải phóng thu nhập.
ALTER TABLE payment_outbox DROP CONSTRAINT IF EXISTS payment_outbox_kind_check;
ALTER TABLE payment_outbox ADD CONSTRAINT payment_outbox_kind_check CHECK (kind IN ('REWARD', 'REFUND', 'HOLD', 'FINAL_STATE'));

-- Backfill (phần mentoring): phiên có phí đã kết thúc trước US-25 — COMPLETED / NO_SHOW_MENTEE, và phiên mentee huỷ muộn
-- (hoàn 0%) — được xếp hàng FINAL_STATE với endedAt = giờ kết thúc. payment-service lập lịch release_at = endedAt + 48h;
-- phiên đã kết thúc hơn 48 giờ được ghi EARNING_AVAILABLE ở lần chạy đầu tiên của job giải phóng (payment V4 đã ghi
-- EARNING_PENDING/REVERSAL cho mọi giao dịch cũ). Phiên huỷ khi chưa thanh toán → payment trả 404 → outbox bỏ sau vài lần.
INSERT INTO payment_outbox (session_id, kind, payload, created_at)
SELECT s.id, 'FINAL_STATE',
       json_build_object(
           'state', s.status,
           'endedAt', to_char((s.scheduled_at + make_interval(mins => s.duration_minutes)) AT TIME ZONE 'UTC',
                              'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
           'releaseNow', false)::text,
       now()
  FROM sessions s
 WHERE s.price > 0
   AND (s.status IN ('COMPLETED', 'NO_SHOW_MENTEE')
        OR (s.status = 'CANCELLED' AND s.cancelled_by = 'MENTEE' AND s.refund_percent = 0))
   AND NOT EXISTS (SELECT 1 FROM payment_outbox o WHERE o.session_id = s.id AND o.kind = 'FINAL_STATE');
