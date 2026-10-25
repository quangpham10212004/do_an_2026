"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/api";
import type { VoiceSession, VoiceTranscriptItem } from "@/types";

const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const CHUNK_MS = 10_000;

/** Một mục của hội thoại theo đúng thứ tự OpenAI thêm vào (lời nói hoặc lần gọi tool begin_topic). */
export interface VoiceEntry {
  id: string;
  role: VoiceTranscriptItem["role"];
  text: string;
  topicNo?: number;
}

/** idle: chưa gọi · connecting · live: đang nói chuyện · dropped: rớt kết nối (kết nối lại được) · ended: đã kết thúc. */
export type VoicePhase = "idle" | "connecting" | "live" | "dropped" | "ended";

/** Loại đoạn tải lên: video có tiếng (cho admin xem) hoặc chỉ âm thanh (cho server chép lời lại). */
export type RecordingKind = "chunks" | "audio-chunks";

/**
 * Ghi hình buổi phỏng vấn (vòng 1 xác thực mentor, docs/design-mentor-verification.md §5.2) — tuỳ chọn, mặc định TẮT nên
 * buổi luyện phỏng vấn của mentee không đổi. Bật thì camera + micro bắt buộc; hook quay hai luồng từ cùng nguồn, cắt đoạn mỗi
 * 10 giây và gọi `onChunk` để trang tải lên. startMs / durMs tính từ lúc bắt đầu buổi nên khoảng trống khi camera ngắt lộ ra.
 */
export interface VoiceRecording {
  onChunk: (kind: RecordingKind, n: number, blob: Blob, startMs: number, durMs: number) => Promise<unknown>;
}

function pickMime(candidates: string[]): string | undefined {
  return typeof MediaRecorder === "undefined" ? undefined : candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

/**
 * Phỏng vấn giọng nói với OpenAI Realtime qua WebRTC — dùng chung cho AI Interview của mentor (/interview) và buổi luyện
 * phỏng vấn của mentee (/practice-interview). ai-service cấp client secret ngắn hạn (API key không tới trình duyệt); model
 * gọi begin_topic trước mỗi chủ đề để bản ghi chia đúng chủ đề, end_interview khi kết thúc => `onEnd(items)` để trang gửi
 * bản ghi về ai-service chấm. Kết nối lại (rớt mạng) giữ bản ghi cũ; ai-service gộp các marker trùng chủ đề.
 * Khi ghi hình, camera/micro sống qua các lần kết nối lại (chỉ dừng khi kết thúc) nên rớt WebRTC không làm đứt video.
 */
export function useRealtimeVoice(onEnd: (items: VoiceTranscriptItem[]) => void, recording?: VoiceRecording) {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [entries, setEntries] = useState<VoiceEntry[]>([]);
  const [error, setError] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const media = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const entriesRef = useRef<VoiceEntry[]>([]);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const recordingRef = useRef(recording);
  recordingRef.current = recording;
  const recorders = useRef<MediaRecorder[]>([]);
  const uploads = useRef<Promise<unknown>[]>([]);
  const stopWaits = useRef<Promise<void>[]>([]);
  const sessionStart = useRef(0);
  const nextIndex = useRef<Record<RecordingKind, number>>({ chunks: 0, "audio-chunks": 0 });

  const update = useCallback((fn: (list: VoiceEntry[]) => VoiceEntry[]) => {
    entriesRef.current = fn(entriesRef.current);
    setEntries(entriesRef.current);
  }, []);

  const upsert = useCallback((id: string, patch: Partial<VoiceEntry>) => {
    update((list) => {
      const i = list.findIndex((e) => e.id === id);
      if (i < 0) return [...list, { id, role: patch.role ?? "assistant", text: "", ...patch }];
      const copy = [...list];
      copy[i] = { ...copy[i], ...patch };
      return copy;
    });
  }, [update]);

  /** Chỉ đóng kết nối WebRTC; camera/micro (và việc quay) vẫn chạy để nối lại được. */
  const hangUp = useCallback(() => {
    const conn = pc.current;
    pc.current = null;
    if (conn) conn.onconnectionstatechange = null;
    conn?.close();
  }, []);

  /** Dừng quay (đoạn cuối được đẩy ra trước sự kiện stop) rồi tắt camera/micro. */
  const stopMedia = useCallback(() => {
    recorders.current.forEach((r) => { if (r.state !== "inactive") r.stop(); });
    recorders.current = [];
    media.current?.getTracks().forEach((t) => t.stop());
    media.current = null;
    setStream(null);
  }, []);

  useEffect(() => () => { hangUp(); stopMedia(); }, [hangUp, stopMedia]);

  const startRecorder = useCallback((kind: RecordingKind, source: MediaStream) => {
    const rec = recordingRef.current;
    if (!rec || typeof MediaRecorder === "undefined") return;
    const mimeType = kind === "chunks"
      ? pickMime(["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"])
      : pickMime(["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]);
    const recorder = new MediaRecorder(source, {
      ...(mimeType ? { mimeType } : {}),
      ...(kind === "chunks" ? { videoBitsPerSecond: 500_000, audioBitsPerSecond: 64_000 } : { audioBitsPerSecond: 32_000 }),
    });
    let last = Date.now() - sessionStart.current;
    recorder.ondataavailable = (e) => {
      if (!e.data.size) return;
      const now = Date.now() - sessionStart.current;
      const n = nextIndex.current[kind]++;
      const startMs = last;
      last = now;
      uploads.current.push(rec.onChunk(kind, n, e.data, startMs, Math.max(0, now - startMs)).catch(() => undefined));
    };
    stopWaits.current.push(new Promise<void>((resolve) => { recorder.onstop = () => resolve(); }));
    recorder.start(CHUNK_MS);
    recorders.current.push(recorder);
  }, []);

  /** Lấy micro (và camera nếu ghi hình), dùng lại luồng còn sống; luồng bị ngắt thì mở lại và quay đoạn mới. */
  const ensureMedia = useCallback(async (): Promise<MediaStream> => {
    const rec = recordingRef.current;
    const alive = media.current?.getTracks().every((t) => t.readyState === "live");
    if (media.current && alive) return media.current;
    recorders.current.forEach((r) => { if (r.state !== "inactive") r.stop(); });
    recorders.current = [];
    media.current?.getTracks().forEach((t) => t.stop());
    const next = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: rec ? { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15 } } : false,
    });
    media.current = next;
    setStream(rec ? next : null);
    if (rec) {
      if (sessionStart.current === 0) sessionStart.current = Date.now();
      startRecorder("chunks", next);
      startRecorder("audio-chunks", new MediaStream(next.getAudioTracks()));
      next.getVideoTracks().forEach((t) => {
        t.onended = () => setError("Camera bị ngắt. Hãy bật lại camera rồi bấm “Kết nối lại” — nếu mất camera quá 60 giây, lần phỏng vấn này sẽ không hợp lệ.");
      });
    }
    return next;
  }, [startRecorder]);

  /** Bản ghi gửi về ai-service (POST .../voice-transcript hoặc .../complete). */
  const items = useCallback((): VoiceTranscriptItem[] =>
    entriesRef.current.map((x) => (x.role === "marker" ? { role: "marker", topicNo: x.topicNo } : { role: x.role, text: x.text })), []);

  const finish = useCallback(() => {
    if (!pc.current) return;
    hangUp();
    stopMedia();
    setPhase("ended");
    onEndRef.current(items());
  }, [hangUp, items, stopMedia]);

  /** Chờ các đoạn quay cuối được đẩy ra và tải lên xong (gọi sau khi kết thúc, trước khi chốt video). */
  const drain = useCallback(async () => {
    await Promise.all(stopWaits.current);
    await Promise.all(uploads.current);
  }, []);

  const onEvent = useCallback((dc: RTCDataChannel, e: any) => {
    switch (e.type) {
      case "conversation.item.added":
      case "conversation.item.created": {
        const item = e.item;
        if (item?.type === "message" && (item.role === "user" || item.role === "assistant")) upsert(item.id, { role: item.role });
        if (item?.type === "function_call" && item.name === "begin_topic") upsert(item.id, { role: "marker" });
        break;
      }
      case "response.output_audio_transcript.delta":
        update((list) => list.map((x) => (x.id === e.item_id ? { ...x, text: x.text + e.delta } : x)));
        break;
      case "response.output_audio_transcript.done":
        upsert(e.item_id, { role: "assistant", text: e.transcript });
        break;
      case "conversation.item.input_audio_transcription.completed":
        upsert(e.item_id, { role: "user", text: e.transcript });
        break;
      case "response.function_call_arguments.done": {
        let args: { topic_no?: number } = {};
        try { args = JSON.parse(e.arguments || "{}"); } catch { /* tham số hỏng: bỏ qua */ }
        if (e.name === "begin_topic") upsert(e.item_id, { role: "marker", topicNo: Number(args.topic_no) });
        dc.send(JSON.stringify({ type: "conversation.item.create", item: { type: "function_call_output", call_id: e.call_id, output: "{\"ok\":true}" } }));
        if (e.name === "end_interview") setTimeout(finish, 4000); // để lời chào kết thúc phát xong
        else dc.send(JSON.stringify({ type: "response.create" }));
        break;
      }
      case "error":
        setError(e.error?.message ?? "Lỗi từ OpenAI Realtime");
        break;
    }
  }, [finish, update, upsert]);

  /** Bắt đầu (hoặc nối lại) cuộc gọi với client secret vừa được ai-service cấp. */
  const connect = useCallback(async (session: VoiceSession) => {
    hangUp();
    setError("");
    setPhase("connecting");
    try {
      const conn = new RTCPeerConnection();
      pc.current = conn;
      audio.current = audio.current ?? new Audio();
      audio.current.autoplay = true;
      conn.ontrack = (ev) => { if (audio.current) audio.current.srcObject = ev.streams[0]; };
      conn.onconnectionstatechange = () => {
        if (conn.connectionState === "failed" || conn.connectionState === "disconnected") {
          hangUp();
          setError("Mất kết nối với người phỏng vấn AI. Bấm “Kết nối lại” để tiếp tục.");
          setPhase("dropped");
        }
      };
      const local = await ensureMedia();
      conn.addTrack(local.getAudioTracks()[0], local);
      const dc = conn.createDataChannel("oai-events");
      dc.onmessage = (m) => onEvent(dc, JSON.parse(m.data));
      // Model nói trước: chào và giới thiệu buổi phỏng vấn.
      dc.onopen = () => dc.send(JSON.stringify({ type: "response.create" }));
      const offer = await conn.createOffer();
      await conn.setLocalDescription(offer);
      const res = await fetch(REALTIME_CALLS_URL, {
        method: "POST", body: offer.sdp,
        headers: { Authorization: `Bearer ${session.clientSecret}`, "Content-Type": "application/sdp" },
      });
      if (!res.ok) throw new Error(`OpenAI Realtime từ chối kết nối (${res.status})`);
      await conn.setRemoteDescription({ type: "answer", sdp: await res.text() });
      setPhase("live");
    } catch (e) {
      hangUp();
      if (!entriesRef.current.length) stopMedia();
      const denied = e instanceof DOMException && e.name === "NotAllowedError";
      setError(denied ? (recordingRef.current ? "Bạn cần cho phép trình duyệt dùng camera và micro để phỏng vấn." : "Bạn cần cho phép trình duyệt dùng micro.") : errorMessage(e));
      setPhase(entriesRef.current.length ? "dropped" : "idle");
    }
  }, [ensureMedia, hangUp, onEvent, stopMedia]);

  /** Xoá bản ghi (bắt đầu buổi mới). */
  const reset = useCallback(() => {
    hangUp();
    stopMedia();
    update(() => []);
    uploads.current = [];
    stopWaits.current = [];
    sessionStart.current = 0;
    nextIndex.current = { chunks: 0, "audio-chunks": 0 };
    setError("");
    setPhase("idle");
  }, [hangUp, stopMedia, update]);

  return { phase, setPhase, entries, error, connect, finish, reset, stream, drain };
}
