import { MENTORING_STATUS_LABELS, mentoringTone } from "@/features/mentoring/labels";

/**
 * Badge trạng thái cho các trạng thái của mentoring-service / payment-service. `labels` cho phép đổi nhãn theo ngữ cảnh
 * (vd. SESSION_STATUS_LABELS: PENDING = "Chờ thanh toán").
 */
export default function MentoringStatusBadge({ status, labels = MENTORING_STATUS_LABELS }: {
  status: string | null | undefined;
  labels?: Record<string, string>;
}) {
  if (!status) return null;
  return <span className={`badge ${mentoringTone(status)}`}>{labels[status] || MENTORING_STATUS_LABELS[status] || status}</span>;
}
