import { MENTORING_STATUS_LABELS, mentoringTone } from "@/features/mentoring/labels";

/** Badge trạng thái cho các trạng thái của mentoring-service / payment-service. */
export default function MentoringStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  return <span className={`badge ${mentoringTone(status)}`}>{MENTORING_STATUS_LABELS[status] || status}</span>;
}
