"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Alert, Badge, Card, CardBody, CardFooter, CardHeader, Checkbox } from "@/components/ui";
import type { VoiceEntry, VoicePhase } from "./useRealtimeVoice";

/** Thông báo khi ai-service chưa cấu hình OPENAI_API_KEY (voice = null / voiceAvailable = false). */
export const VOICE_DISABLED = "Phỏng vấn giọng nói chưa được bật";

/** Đồng ý bắt buộc: âm thanh được OpenAI (Mỹ) xử lý — lưu thành consentExternalAi trên buổi phỏng vấn. */
export function VoiceConsent({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <Checkbox checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)}
      label="Tôi đồng ý để giọng nói của tôi được OpenAI (Mỹ) xử lý trong buổi phỏng vấn để chép lời và trò chuyện. Âm thanh không được lưu lại." />
  );
}

const PHASE_BADGE: Partial<Record<VoicePhase, ReactNode>> = {
  connecting: <Badge>Đang kết nối…</Badge>,
  live: <Badge tone="success">Đang nói chuyện</Badge>,
  dropped: <Badge tone="warning">Mất kết nối</Badge>,
};

/** Bản ghi trực tiếp của cuộc gọi: lời người phỏng vấn AI, lời ứng viên và mốc từng chủ đề. */
export function VoiceCallCard({ entries, phase, topics, error, footer, title = "Hội thoại" }: {
  entries: VoiceEntry[]; phase: VoicePhase; topics: string[]; error?: string; footer: ReactNode; title?: string;
}) {
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [entries]);
  const topicName = (n?: number) => (n && topics[n - 1]) || `Chủ đề ${n ?? "?"}`;
  return (
    <Card>
      <CardHeader title={title} actions={PHASE_BADGE[phase]} />
      <CardBody className="flex flex-col gap-3">
        {error && <Alert>{error}</Alert>}
        {entries.length === 0 && <p className="text-small text-ink-muted">Bản ghi lời nói sẽ hiện ở đây khi buổi phỏng vấn bắt đầu.</p>}
        {entries.map((x) => x.role === "marker"
          ? <div key={x.id} className="text-small font-medium text-ink-muted">— {topicName(x.topicNo)} —</div>
          : (
            <div key={x.id} className={x.role === "user" ? "self-end rounded-md border border-border bg-surface px-3 py-2" : "px-3 py-2"}>
              <div className="text-small text-ink-muted">{x.role === "user" ? "Bạn" : "Người phỏng vấn AI"}</div>
              <div>{x.text || "…"}</div>
            </div>
          ))}
        <div ref={bottom} />
      </CardBody>
      <CardFooter>{footer}</CardFooter>
    </Card>
  );
}

/** Kế hoạch chủ đề của buổi giọng nói. */
export function TopicPlan({ topics, note }: { topics: string[]; note?: ReactNode }) {
  return (
    <Card>
      <CardHeader title="Kế hoạch" description={note ?? `${topics.length} chủ đề, khoảng 15 phút`} />
      <CardBody><ol className="list-decimal pl-5">{topics.map((t) => <li key={t}>{t}</li>)}</ol></CardBody>
    </Card>
  );
}
