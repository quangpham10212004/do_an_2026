"use client";

import { useState } from "react";
import { Play, Trash2 } from "lucide-react";
import { Alert, Badge, Button, Card, CardBody, CardHeader, StatusBadge, useDialog } from "@/components/ui";
import { aiApi } from "@/features/ai/api";
import { errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { Interview, InterviewVideo, VideoFlag } from "@/types";

const FLAG_LABELS: Record<VideoFlag, string> = {
  CAMERA_OFF: "Camera bị ngắt giữa buổi",
  TRANSCRIPT_MISMATCH: "Hai bản chép lời lệch nhau",
};

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Hai bản chép lời cạnh nhau khi server chép lại được (admin): bản của trình duyệt (từ các câu trả lời) và bản của server. */
function TranscriptCompare({ interview, video }: { interview: Interview; video: InterviewVideo }) {
  const browser = interview.turns.map((t) => t.answer).filter(Boolean).join(" ");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-small">
        Chép lời lại phía server: {video.transcriptCheck && <StatusBadge status={video.transcriptCheck} />}
        {video.transcriptDiff != null && <span className="text-ink-muted">khác biệt {(video.transcriptDiff * 100).toFixed(0)}% số từ</span>}
        {video.transcriptCheck === "MISMATCH" && <Badge tone="warning">Điểm AI “chưa đáng tin”</Badge>}
      </div>
      {video.serverTranscript && (
        <div className="grid gap-3 md:grid-cols-2">
          <div><div className="text-small font-medium">Trình duyệt gửi</div><p className="text-small text-ink-muted">{browser || "—"}</p></div>
          <div><div className="text-small font-medium">Server chép lại từ âm thanh</div><p className="text-small text-ink-muted">{video.serverTranscript}</p></div>
        </div>
      )}
    </div>
  );
}

/**
 * Video vòng 1 của một buổi phỏng vấn (docs/design-mentor-verification.md §5.5): admin xem + xoá + đối chiếu hai bản chép lời,
 * mentor chỉ xem video của chính mình. Link phát có token ngắn hạn nên lấy khi bấm “Xem video”.
 */
export function VideoCard({ interview, admin = false, onChange }: { interview: Interview; admin?: boolean; onChange?: (video: InterviewVideo) => void }) {
  const video = interview.video;
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dialog, ask] = useDialog();
  if (!video) return null;

  async function play() {
    setBusy(true);
    setError("");
    try {
      setUrl((await aiApi.videoPlayUrl(interview.id)).url);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await ask({
      title: "Xoá video này?", danger: true, confirmText: "Xoá vĩnh viễn",
      message: "File video và âm thanh bị xoá vĩnh viễn. Bản chép lời, điểm và cờ vẫn được giữ làm căn cứ.",
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      setUrl("");
      onChange?.(await aiApi.deleteVideo(interview.id));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      {dialog}
      <CardHeader title="Video buổi phỏng vấn"
        description={video.available
          ? `${video.durationSeconds != null ? `${Math.round(video.durationSeconds / 60)} phút · ` : ""}${formatSize(video.sizeBytes)} · lưu tới ${formatDateTime(video.expiresAt)}`
          : undefined} />
      <CardBody className="flex flex-col gap-3">
        <Alert>{error}</Alert>
        {admin && video.flags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {video.flags.map((f) => <Badge key={f} tone="warning">{FLAG_LABELS[f]}{f === "CAMERA_OFF" && video.gapTotalSeconds > 0 ? ` (${video.gapTotalSeconds} giây)` : ""}</Badge>)}
          </div>
        )}
        {video.deletedAt && <Alert tone="info">Video đã bị xoá ({formatDateTime(video.deletedAt)}). Bản chép lời và điểm vẫn được giữ.</Alert>}
        {!video.deletedAt && !video.finished && <p className="text-small text-ink-muted">Video chưa được chốt — sẽ sẵn sàng sau khi mentor kết thúc buổi phỏng vấn.</p>}
        {video.available && !url && (
          <div><Button icon={Play} onClick={play} loading={busy}>Xem video</Button></div>
        )}
        {url && <video className="w-full rounded-md bg-black" src={url} controls preload="metadata" />}
        {admin && video.transcriptCheck && video.transcriptCheck !== "PENDING" && <TranscriptCompare interview={interview} video={video} />}
        {admin && video.available && (
          <div><Button variant="danger" icon={Trash2} onClick={remove} disabled={busy}>Xoá video</Button></div>
        )}
      </CardBody>
    </Card>
  );
}
