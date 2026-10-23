"use client";

import { useEffect, useRef, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Mic, PhoneOff } from "lucide-react";
import { Alert, Badge, Button, Card, CardBody, CardFooter, CardHeader, Checkbox, PageHeader, StatusBadge, Table } from "@/components/ui";
import { aiApi } from "@/features/ai/api";
import { errorMessage } from "@/lib/api";
import type { VoiceGrade, VoiceSession, VoiceTranscriptItem } from "@/types";

const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

/** Một mục của hội thoại theo đúng thứ tự OpenAI thêm vào (lời nói hoặc lần gọi tool begin_topic). */
interface Entry {
  id: string;
  role: VoiceTranscriptItem["role"];
  text: string;
  topicNo?: number;
}

type Phase = "idle" | "connecting" | "live" | "grading" | "done";

/**
 * PROTOTYPE — phỏng vấn giọng nói với OpenAI Realtime qua WebRTC. ai-service cấp client secret ngắn hạn (API key không
 * tới trình duyệt); model gọi begin_topic trước mỗi chủ đề để bản ghi chia đúng chủ đề; hết buổi gửi bản ghi về ai-service
 * chấm bằng engine hiện có. Chưa lưu vào CSDL và chưa nối với luồng duyệt.
 */
function VoiceInterview() {
  const [ack, setAck] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [session, setSession] = useState<VoiceSession | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [grade, setGrade] = useState<VoiceGrade | null>(null);
  const [error, setError] = useState("");
  const pc = useRef<RTCPeerConnection | null>(null);
  const mic = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const entriesRef = useRef<Entry[]>([]);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => () => hangUp(), []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [entries]);

  function update(fn: (list: Entry[]) => Entry[]) {
    entriesRef.current = fn(entriesRef.current);
    setEntries(entriesRef.current);
  }

  function upsert(id: string, patch: Partial<Entry> & { role?: Entry["role"] }) {
    update((list) => {
      const i = list.findIndex((e) => e.id === id);
      if (i < 0) return [...list, { id, role: patch.role ?? "assistant", text: "", ...patch }];
      const copy = [...list];
      copy[i] = { ...copy[i], ...patch };
      return copy;
    });
  }

  function hangUp() {
    pc.current?.close();
    pc.current = null;
    mic.current?.getTracks().forEach((t) => t.stop());
    mic.current = null;
  }

  function onEvent(dc: RTCDataChannel, e: any) {
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
        const args = JSON.parse(e.arguments || "{}");
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
  }

  async function start() {
    setError("");
    setGrade(null);
    update(() => []);
    setPhase("connecting");
    try {
      const s = await aiApi.voiceSession();
      setSession(s);
      const conn = new RTCPeerConnection();
      pc.current = conn;
      audio.current = audio.current ?? new Audio();
      audio.current.autoplay = true;
      conn.ontrack = (ev) => { if (audio.current) audio.current.srcObject = ev.streams[0]; };
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
        headers: { Authorization: `Bearer ${s.clientSecret}`, "Content-Type": "application/sdp" },
      });
      if (!res.ok) throw new Error(`OpenAI Realtime từ chối kết nối (${res.status})`);
      await conn.setRemoteDescription({ type: "answer", sdp: await res.text() });
      setPhase("live");
    } catch (e) {
      hangUp();
      setError(errorMessage(e));
      setPhase("idle");
    }
  }

  async function finish() {
    if (!pc.current) return;
    hangUp();
    setPhase("grading");
    try {
      const items: VoiceTranscriptItem[] = entriesRef.current.map((x) =>
        x.role === "marker" ? { role: "marker", topicNo: x.topicNo } : { role: x.role, text: x.text });
      setGrade(await aiApi.gradeVoice(items));
      setPhase("done");
    } catch (e) {
      setError(errorMessage(e));
      setPhase("done");
    }
  }

  const topicName = (n?: number) => (n && session?.topics[n - 1]) || `Chủ đề ${n ?? "?"}`;

  return (
    <>
      <PageHeader title="AI Interview bằng giọng nói" description="Bản thử nghiệm: nói chuyện trực tiếp với người phỏng vấn AI. Kết quả chưa được lưu và không dùng để duyệt tài khoản."
        actions={<Badge tone="accent">Prototype</Badge>} />
      <Alert className="mb-6">{error}</Alert>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader title="Hội thoại" actions={phase === "live" && <Badge tone="success">Đang ghi âm</Badge>} />
          <CardBody className="flex flex-col gap-3">
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
          <CardFooter>
            {(phase === "idle" || phase === "done") && (
              <>
                <Checkbox checked={ack} onChange={(e) => setAck(e.target.checked)} label="Tôi tự trả lời, không có sự trợ giúp từ bên ngoài" />
                <Button variant="primary" icon={Mic} className="ml-auto" disabled={!ack} onClick={start}>{phase === "done" ? "Phỏng vấn lại" : "Bắt đầu phỏng vấn"}</Button>
              </>
            )}
            {phase === "connecting" && <Button loading disabled>Đang kết nối…</Button>}
            {phase === "live" && <Button variant="danger" icon={PhoneOff} onClick={finish}>Kết thúc và chấm điểm</Button>}
            {phase === "grading" && <Button loading disabled>Đang chấm điểm…</Button>}
          </CardFooter>
        </Card>

        <div className="flex min-w-0 flex-col gap-6">
          {session && (
            <Card>
              <CardHeader title="Kế hoạch" description={`${session.topics.length} chủ đề · model ${session.model}`} />
              <CardBody><ol className="list-decimal pl-5">{session.topics.map((t) => <li key={t}>{t}</li>)}</ol></CardBody>
            </Card>
          )}
          {grade && (
            <Card>
              <CardHeader title={`Điểm: ${grade.assessment.overallScore.toFixed(1)}/100`} description={`Engine ${grade.engine}`}
                actions={<StatusBadge status={grade.assessment.recommendation} />} />
              <CardBody className="flex flex-col gap-3">
                <p>{grade.assessment.summary}</p>
                <Table>
                  <thead><tr><th>Chủ đề</th><th className="num">Điểm</th><th>Nhận xét</th></tr></thead>
                  <tbody>
                    {grade.turns.map((t) => (
                      <tr key={t.topic}><td>{t.topic}</td><td className="num">{t.score.toFixed(1)}</td><td className="text-small">{t.feedback}</td></tr>
                    ))}
                  </tbody>
                </Table>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

export default function VoiceInterviewPage() {
  return (
    <RequireAuth roles={["MENTOR"]}>
      <VoiceInterview />
    </RequireAuth>
  );
}
