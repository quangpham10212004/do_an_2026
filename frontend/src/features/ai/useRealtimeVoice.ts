"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/api";
import type { VoiceSession, VoiceTranscriptItem } from "@/types";

const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

/** Một mục của hội thoại theo đúng thứ tự OpenAI thêm vào (lời nói hoặc lần gọi tool begin_topic). */
export interface VoiceEntry {
  id: string;
  role: VoiceTranscriptItem["role"];
  text: string;
  topicNo?: number;
}

/** idle: chưa gọi · connecting · live: đang nói chuyện · dropped: rớt kết nối (kết nối lại được) · ended: đã kết thúc. */
export type VoicePhase = "idle" | "connecting" | "live" | "dropped" | "ended";

/**
 * Phỏng vấn giọng nói với OpenAI Realtime qua WebRTC — dùng chung cho AI Interview của mentor (/interview) và buổi luyện
 * phỏng vấn của mentee (/practice-interview). ai-service cấp client secret ngắn hạn (API key không tới trình duyệt); model
 * gọi begin_topic trước mỗi chủ đề để bản ghi chia đúng chủ đề, end_interview khi kết thúc => `onEnd(items)` để trang gửi
 * bản ghi về ai-service chấm. Kết nối lại (rớt mạng) giữ bản ghi cũ; ai-service gộp các marker trùng chủ đề.
 */
export function useRealtimeVoice(onEnd: (items: VoiceTranscriptItem[]) => void) {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [entries, setEntries] = useState<VoiceEntry[]>([]);
  const [error, setError] = useState("");
  const pc = useRef<RTCPeerConnection | null>(null);
  const mic = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const entriesRef = useRef<VoiceEntry[]>([]);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

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

  const hangUp = useCallback(() => {
    const conn = pc.current;
    pc.current = null;
    if (conn) conn.onconnectionstatechange = null;
    conn?.close();
    mic.current?.getTracks().forEach((t) => t.stop());
    mic.current = null;
  }, []);

  useEffect(() => () => hangUp(), [hangUp]);

  /** Bản ghi gửi về ai-service (POST .../voice-transcript hoặc .../complete). */
  const items = useCallback((): VoiceTranscriptItem[] =>
    entriesRef.current.map((x) => (x.role === "marker" ? { role: "marker", topicNo: x.topicNo } : { role: x.role, text: x.text })), []);

  const finish = useCallback(() => {
    if (!pc.current) return;
    hangUp();
    setPhase("ended");
    onEndRef.current(items());
  }, [hangUp, items]);

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
      mic.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      conn.addTrack(mic.current.getTracks()[0]);
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
      setError(e instanceof DOMException && e.name === "NotAllowedError" ? "Bạn cần cho phép trình duyệt dùng micro." : errorMessage(e));
      setPhase(entriesRef.current.length ? "dropped" : "idle");
    }
  }, [hangUp, onEvent]);

  /** Xoá bản ghi (bắt đầu buổi mới). */
  const reset = useCallback(() => {
    hangUp();
    update(() => []);
    setError("");
    setPhase("idle");
  }, [hangUp, update]);

  return { phase, setPhase, entries, error, connect, finish, reset };
}
