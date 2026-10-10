import { StatusBadge } from "@/components/ui";
import { MENTORING_STATUS_LABELS, mentoringTone } from "@/features/mentoring/labels";

/**
 * Badge trạng thái cho các trạng thái của mentoring-service / payment-service. `labels` cho phép đổi nhãn theo ngữ cảnh
 * (vd. SESSION_STATUS_LABELS: PENDING = "Chờ thanh toán").
 */
export default function MentoringStatusBadge({ status, labels = MENTORING_STATUS_LABELS }: {
  status: string | null | undefined;
  labels?: Record<string, string>;
}) {
  return <StatusBadge status={status} labels={{ ...MENTORING_STATUS_LABELS, ...labels }} tone={mentoringTone} />;
}
