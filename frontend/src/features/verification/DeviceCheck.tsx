"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Mic, MicOff, VideoOff } from "lucide-react";
import { Alert, Button } from "@/components/ui";

export interface DeviceState { micOk: boolean; camOk: boolean }

/** Thông báo thân thiện cho lỗi xin quyền camera/micro. */
export function mediaErrorText(e: unknown): string {
  const name = (e as { name?: string } | null)?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Trình duyệt đang chặn micro/camera. Hãy cấp quyền ở biểu tượng ổ khoá cạnh thanh địa chỉ rồi thử lại.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Không tìm thấy micro hoặc camera. Hãy cắm thiết bị rồi thử lại.";
  if (name === "NotReadableError") return "Micro hoặc camera đang được ứng dụng khác sử dụng. Hãy đóng ứng dụng đó rồi thử lại.";
  return "Không truy cập được micro/camera. Hãy kiểm tra thiết bị rồi thử lại.";
}

/**
 * Kiểm tra micro và camera trước khi phỏng vấn: xin quyền, xem trước hình và đo mức âm thanh.
 * `onChange` báo micro/camera sẵn sàng; luồng được giải phóng khi rời trang hoặc đã kiểm tra xong để phòng live tự mở lại.
 */
export default function DeviceCheck({ onChange }: { onChange: (s: DeviceState) => void }) {
  const [state, setState] = useState<DeviceState>({ micOk: false, camOk: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [level, setLevel] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  async function check() {
    stop();
    setBusy(true);
    setError("");
    let micOk = false;
    let camOk = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: "user" } });
      streamRef.current = stream;
      micOk = stream.getAudioTracks().length > 0;
      camOk = stream.getVideoTracks().length > 0;
    } catch (e) {
      // Không có camera vẫn thử riêng micro: use case chỉ buộc micro sẵn sàng.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        micOk = stream.getAudioTracks().length > 0;
        setError(`Chưa bật được camera. ${mediaErrorText(e)} Bạn vẫn có thể phỏng vấn bằng giọng nói, nhưng buổi phỏng vấn sẽ không có hình.`);
      } catch (e2) {
        setError(mediaErrorText(e2));
      }
    }
    const next = { micOk, camOk };
    setState(next);
    onChange(next);
    setBusy(false);
    const stream = streamRef.current;
    if (!stream) return;
    if (camOk && videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play().catch(() => {}); }
    if (micOk) {
      try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        ctxRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let peak = 0;
          for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
          setLevel(Math.min(100, Math.round((peak / 128) * 160)));
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch { /* không đo được mức âm: vẫn coi micro sẵn sàng */ }
    }
  }

  const ready = state.micOk;
  return (
    <div className="vf-device" data-ready={ready}>
      <div className="vf-device-view">
        {state.camOk
          ? <video ref={videoRef} muted playsInline aria-label="Xem trước camera" />
          : <div className="vf-device-empty" aria-hidden="true">{ready ? <VideoOff /> : <Camera />}</div>}
      </div>
      <div className="vf-device-side">
        <div className="vf-device-row">
          {state.micOk ? <Mic aria-hidden="true" /> : <MicOff aria-hidden="true" />}
          <span>Micro</span>
          <b data-ok={state.micOk}>{state.micOk ? "Sẵn sàng" : "Chưa kiểm tra"}</b>
        </div>
        <div className="vf-meter" role="img" aria-label={`Mức âm thanh ${level}%`}><span style={{ width: `${level}%` }} /></div>
        <div className="vf-device-row">
          {state.camOk ? <Camera aria-hidden="true" /> : <VideoOff aria-hidden="true" />}
          <span>Camera</span>
          <b data-ok={state.camOk}>{state.camOk ? "Sẵn sàng" : "Chưa kiểm tra"}</b>
        </div>
        <Button size="sm" icon={ready ? CheckCircle2 : Mic} loading={busy} onClick={check}>{ready ? "Kiểm tra lại" : "Kiểm tra micro và camera"}</Button>
        <p className="text-small text-ink-subtle">Nói thử một câu: thanh mức âm phải nhúc nhích. Chỉ cần micro là bắt đầu được, nhưng nên bật camera để lưu video cho quản trị viên.</p>
      </div>
      {error && <div className="vf-device-alert"><Alert tone={state.micOk ? "warning" : undefined}>{error}</Alert></div>}
    </div>
  );
}
