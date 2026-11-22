"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, LogOut, Mic, RotateCcw, Send, Video, VideoOff, Volume2, VolumeX, WifiOff } from "lucide-react";
import { Alert, Button, ButtonLink, Loading } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import type { VerifyInterview } from "@/types/verification";
import { verifyApi } from "./api";
import { mediaErrorText } from "./DeviceCheck";
import { getRecognitionCtor, pickMime, recognitionSupported, speak, speakSupported, stopSpeaking, type Recognizer } from "./speech";
import { clock, shortDateTime, timeLeft } from "./utils";

type Stage = "loading" | "prepare" | "live" | "expired" | "gone";
/** asking: AI đang nói · answering: mentor đang trả lời · thinking: AI nghe và nhận xét · failed: gửi lỗi · all-done: đã trả lời hết, chờ nộp. */
type Phase = "asking" | "answering" | "thinking" | "failed" | "all-done" | "finishing";

const lastAi = (iv: VerifyInterview) => [...iv.turns].reverse().find((t) => t.role === "ai");

export default function LiveRoom() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("loading");
  const [iv, setIv] = useState<VerifyInterview | null>(null);
  const [error, setError] = useState("");
  const [prepError, setPrepError] = useState("");
  const [phase, setPhase] = useState<Phase>("asking");
  const [remaining, setRemaining] = useState(0);
  const [answerSecs, setAnswerSecs] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [voiceOn, setVoiceOn] = useState(true);
  const [online, setOnline] = useState(true);
  const [hasCam, setHasCam] = useState(false);
  const [level, setLevel] = useState(0);
  const [busy, setBusy] = useState(false);

  const idRef = useRef("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recogRef = useRef<Recognizer | null>(null);
  const listeningRef = useRef(false);
  const transcriptRef = useRef("");
  const answerStartRef = useRef(0);
  const pendingRef = useRef<{ questionId: string; transcript: string; durationSeconds: number; media: Blob | null; isLast: boolean } | null>(null);
  const finishingRef = useRef(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const setText = useCallback((v: string) => { transcriptRef.current = v; setTranscript(v); }, []);

  /* ---------- tải buổi phỏng vấn (vào lại đúng chỗ cũ khi bị gián đoạn) ---------- */
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id") ?? "";
    idRef.current = id;
    if (!id) { setStage("gone"); return; }
    verifyApi.interview(id).then((d) => {
      if (d.status === "EXPIRED") { setIv(d); setStage("expired"); return; }
      if (d.status === "SUBMITTED") { setStage("gone"); return; }
      setIv(d);
      setRemaining(d.remainingSeconds);
      setStage("prepare");
    }).catch((e) => {
      const status = (e as { status?: number } | null)?.status;
      if (status === 404 || status === 410) setStage("gone"); else { setError(errorMessage(e)); setStage("gone"); }
    });
  }, []);

  /* ---------- dọn dẹp thiết bị ---------- */
  const stopMedia = useCallback(() => {
    stopSpeaking();
    listeningRef.current = false;
    try { recogRef.current?.abort(); } catch { /* bỏ qua */ }
    recogRef.current = null;
    if (recRef.current && recRef.current.state !== "inactive") { recRef.current.ondataavailable = null; recRef.current.onstop = null; try { recRef.current.stop(); } catch { /* bỏ qua */ } }
    recRef.current = null;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }, []);
  useEffect(() => stopMedia, [stopMedia]);

  /* ---------- cấp quyền và vào phòng ---------- */
  async function enter() {
    setPrepError("");
    stopMedia();
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: "user" } });
    } catch (e) {
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); setPrepError(`Chưa bật được camera. ${mediaErrorText(e)} Bạn vẫn phỏng vấn được bằng giọng nói nhưng sẽ không có hình.`); }
      catch (e2) { setPrepError(mediaErrorText(e2)); return; }
    }
    streamRef.current = stream;
    setHasCam(stream.getVideoTracks().length > 0);
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      ctxRef.current = ctx;
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(an);
      const data = new Uint8Array(an.fftSize);
      const tick = () => {
        an.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(Math.min(100, Math.round((peak / 128) * 160)));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch { /* không đo được mức âm */ }
    setStage("live");
    setPhase("asking");
  }

  // gắn luồng vào thẻ video mỗi khi vào phòng
  useEffect(() => {
    if (stage === "live" && hasCam && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => {});
    }
  }, [stage, hasCam]);

  /* ---------- ghi hình và nhận dạng giọng cho một câu trả lời ---------- */
  const startAnswer = useCallback(() => {
    setText("");
    setInterim("");
    setAnswerSecs(0);
    answerStartRef.current = Date.now();
    chunksRef.current = [];
    const stream = streamRef.current;
    if (stream && typeof MediaRecorder !== "undefined") {
      try {
        const mime = pickMime(stream.getVideoTracks().length > 0);
        const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 500_000, audioBitsPerSecond: 64_000 });
        rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        rec.start(1000);
        recRef.current = rec;
      } catch { recRef.current = null; }
    }
    const Ctor = getRecognitionCtor();
    if (Ctor) {
      try {
        const r = new Ctor();
        r.lang = "vi-VN";
        r.continuous = true;
        r.interimResults = true;
        r.onresult = (e) => {
          let fin = "";
          let tmp = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i];
            if (res.isFinal) fin += `${res[0].transcript} `; else tmp += res[0].transcript;
          }
          if (fin) setText(`${transcriptRef.current} ${fin}`.replace(/\s+/g, " ").trim());
          setInterim(tmp);
        };
        r.onerror = () => { /* lỗi nhận dạng (im lặng, mạng): bỏ qua, mentor vẫn gõ/sửa được */ };
        r.onend = () => { if (listeningRef.current) { try { r.start(); } catch { /* bỏ qua */ } } };
        listeningRef.current = true;
        r.start();
        recogRef.current = r;
      } catch { recogRef.current = null; }
    }
    setPhase("answering");
  }, [setText]);

  /** Dừng ghi và gom đoạn video/âm thanh của câu trả lời. */
  const stopAnswer = useCallback((): Promise<Blob | null> => {
    listeningRef.current = false;
    try { recogRef.current?.stop(); } catch { /* bỏ qua */ }
    recogRef.current = null;
    setInterim("");
    const rec = recRef.current;
    recRef.current = null;
    if (!rec || rec.state === "inactive") return Promise.resolve(chunksRef.current.length ? new Blob(chunksRef.current, { type: rec?.mimeType || "video/webm" }) : null);
    return new Promise((resolve) => {
      rec.onstop = () => resolve(chunksRef.current.length ? new Blob(chunksRef.current, { type: rec.mimeType || "video/webm" }) : null);
      try { rec.stop(); } catch { resolve(null); }
    });
  }, []);

  /* ---------- AI hỏi: đọc to rồi tự chuyển sang lượt trả lời ---------- */
  const qid = iv?.question?.id ?? null;
  const allAnswered = stage === "live" && iv !== null && iv.question === null;
  useEffect(() => {
    if (stage !== "live" || !iv) return undefined;
    if (!iv.question) { setPhase("all-done"); return undefined; }
    setPhase("asking");
    const ai = lastAi(iv);
    if (!voiceOn || !ai) { const t = setTimeout(startAnswer, 600); return () => clearTimeout(t); }
    const cancel = speak(ai.text, startAnswer);
    return cancel;
    // chỉ chạy lại khi sang câu hỏi mới hoặc vào phòng; bật/tắt đọc to áp dụng từ câu sau
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, qid, allAnswered]);

  function replay() {
    if (!iv || phase === "thinking" || phase === "finishing") return;
    const ai = lastAi(iv);
    if (!ai) return;
    // dừng ghi câu trả lời dở rồi AI đọc lại câu hỏi
    void stopAnswer().then(() => {
      setPhase("asking");
      speak(ai.text, startAnswer);
    });
  }

  async function restartAnswer() {
    await stopAnswer();
    startAnswer();
  }

  /* ---------- gửi câu trả lời / nộp bài ---------- */
  async function submitAll(id: string) {
    setPhase("finishing");
    stopMedia();
    try {
      const r = await verifyApi.submit(id);
      router.replace(`/interview/result?id=${encodeURIComponent(r.id)}`);
    } catch (e) { finishingRef.current = false; setError(errorMessage(e)); setPhase("all-done"); }
  }

  async function send(isLast: boolean, fromTimeout = false) {
    if (!iv || !iv.question || (busy && !fromTimeout)) return;
    setBusy(true);
    setError("");
    stopSpeaking();
    const media = await stopAnswer();
    const payload = {
      questionId: iv.question.id,
      transcript: `${transcriptRef.current} ${interim}`.replace(/\s+/g, " ").trim(),
      durationSeconds: Math.max(1, (Date.now() - answerStartRef.current) / 1000),
      media, isLast,
    };
    pendingRef.current = payload;
    setText("");
    setInterim("");
    await post(payload);
    setBusy(false);
  }

  async function post(p: NonNullable<typeof pendingRef.current>) {
    setPhase("thinking");
    try {
      const next = await verifyApi.answer(idRef.current, { questionId: p.questionId, transcript: p.transcript, durationSeconds: p.durationSeconds, media: p.media });
      pendingRef.current = null;
      if (p.isLast || next.status === "SUBMITTED") { setIv(next); await submitAll(idRef.current); return; }
      setIv(next);
      setRemaining(next.remainingSeconds);
    } catch (e) { setError(errorMessage(e)); setPhase("failed"); }
  }

  async function retrySend() {
    if (!pendingRef.current) return;
    setBusy(true);
    setError("");
    await post(pendingRef.current);
    setBusy(false);
  }

  /* ---------- đồng hồ, nhịp tim lưu tiến độ, mất kết nối ---------- */
  useEffect(() => {
    if (stage !== "live") return undefined;
    const t = setInterval(() => {
      if (!navigator.onLine) return;
      setRemaining((r) => Math.max(0, r - 1));
      setAnswerSecs((s) => (listeningRef.current || recRef.current ? s + 1 : s));
    }, 1000);
    return () => clearInterval(t);
  }, [stage]);

  const remainingRef = useRef(0);
  useEffect(() => { remainingRef.current = remaining; }, [remaining]);
  useEffect(() => {
    if (stage !== "live") return undefined;
    const t = setInterval(() => { if (navigator.onLine) void verifyApi.heartbeat(idRef.current, remainingRef.current).catch(() => {}); }, 15_000);
    return () => clearInterval(t);
  }, [stage]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => {
    if (stage !== "live") return undefined;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [stage]);

  // hết giờ: nộp những gì đã làm
  useEffect(() => {
    if (stage !== "live" || remaining > 0 || finishingRef.current || !iv) return;
    finishingRef.current = true;
    if (phase === "answering" && iv.question) void send(true, true);
    else void submitAll(idRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, stage]);

  // cuộn nhật ký hội thoại xuống cuối
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" }); }, [iv?.turns.length, transcript]);

  function leave() {
    stopMedia();
    router.push("/interview");
  }

  /* ---------- hiển thị ---------- */
  if (stage === "loading") return <Loading />;

  if (stage === "gone") {
    return (
      <div className="vf-narrow">
        <Alert tone={error ? "danger" : "info"} title={error ? undefined : "Không tìm thấy buổi phỏng vấn đang mở"} action={<ButtonLink href="/interview" size="sm">Về trang xác thực</ButtonLink>}>
          {error || "Buổi phỏng vấn đã nộp hoặc không còn hiệu lực. Bạn có thể xem kết quả ở trang xác thực."}
        </Alert>
      </div>
    );
  }

  if (stage === "expired" && iv) {
    return (
      <div className="vf-narrow">
        <div className="vf-card" data-tone="danger">
          <h2>Buổi phỏng vấn đã quá hạn</h2>
          <p className="mt-2 text-small text-ink-muted">Hạn tiếp tục là {shortDateTime(iv.resumeDeadline)}. Lượt này tính là không hoàn thành, bạn có thể bắt đầu lại ở trang xác thực.</p>
          <ButtonLink href="/interview" variant="primary" size="lg" block className="mt-4">Về trang xác thực</ButtonLink>
        </div>
      </div>
    );
  }

  if (!iv) return <Loading />;
  const q = iv.question;
  const total = iv.topics.length;
  const speaking = phase === "asking";
  const recording = phase === "answering";
  const aiLine = lastAi(iv)?.text ?? "";

  if (stage === "prepare") {
    const resumed = iv.turns.some((t) => t.role === "mentor");
    return (
      <div className="vf-narrow">
        <div className="vf-card" data-tone="accent">
          <h2>{resumed ? "Tiếp tục buổi phỏng vấn" : "Sẵn sàng vào phòng phỏng vấn"} · {iv.domain}</h2>
          <p className="mt-2 text-small leading-relaxed text-ink-muted">
            {resumed
              ? `Bạn sẽ vào lại đúng chủ đề ${Math.min(iv.topicIndex + 1, total)}/${total}. Các câu đã trả lời được giữ nguyên. Hạn tiếp tục còn ${timeLeft(iv.resumeDeadline)}.`
              : "Khi vào phòng, AI sẽ đọc câu hỏi đầu tiên và bạn trả lời trực tiếp bằng giọng nói. Hệ thống ghi hình và ghi âm từng câu trả lời."}
          </p>
          <ul className="vf-list">
            <li>Còn lại {clock(iv.remainingSeconds)} cho cả buổi. Đồng hồ chỉ chạy khi bạn đang trong phòng và có kết nối.</li>
            <li>Dùng tai nghe để micro không thu tiếng AI. Ngồi nơi yên tĩnh, đủ sáng.</li>
            <li>Bấm &quot;Xong, gửi câu trả lời&quot; khi nói xong. AI nhận xét rồi hỏi tiếp.</li>
            {!speakSupported() && <li>Trình duyệt không đọc to được: bạn đọc câu hỏi hiển thị trên màn hình.</li>}
            {!recognitionSupported() && <li>Trình duyệt không nhận dạng được giọng nói: hãy nói và gõ tóm tắt câu trả lời vào ô văn bản (video vẫn được ghi).</li>}
          </ul>
          <Alert tone="warning" className="mt-3">{prepError}</Alert>
          <Button variant="primary" size="lg" block icon={Video} className="mt-4" onClick={enter}>{resumed ? "Cấp quyền và tiếp tục" : "Cấp quyền và vào phòng"}</Button>
          <Button variant="ghost" block className="mt-2" onClick={leave}>Để sau</Button>
        </div>
      </div>
    );
  }

  const statusText = !online ? "Mất kết nối" : phase === "asking" ? "AI đang hỏi" : phase === "answering" ? "Đang nghe bạn trả lời" : phase === "thinking" ? "AI đang nhận xét…" : phase === "finishing" ? "Đang chấm điểm…" : phase === "failed" ? "Gửi lỗi" : "Hoàn tất";

  return (
    <div className="vf-live">
      <div className="vf-live-bar">
        <div className="min-w-0">
          <div className="vf-live-title">Phỏng vấn AI · {iv.domain}</div>
          <div className="vf-live-sub">{q ? `Chủ đề ${iv.topicIndex + 1}/${total} · ${q.topic}` : "Đã trả lời hết các chủ đề"}</div>
        </div>
        <div className="vf-live-meta">
          <span className="vf-live-pill" data-tone={recording ? "rec" : undefined}><span className="vf-rec-dot" aria-hidden="true" />{recording ? "Đang ghi" : statusText}</span>
          <span className="vf-live-pill" data-tone={remaining < 300 ? "warn" : undefined} role="timer" aria-label="Thời gian còn lại">{clock(remaining)}</span>
          <Button size="sm" variant="ghost" icon={LogOut} onClick={leave} className="vf-live-leave">Thoát tạm</Button>
        </div>
      </div>

      {!online && <div className="vf-live-banner" role="status"><WifiOff aria-hidden="true" /> Mất kết nối. Đồng hồ tạm dừng; tiến độ đã lưu, bạn có thể quay lại trong {timeLeft(iv.resumeDeadline)} nữa.</div>}
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}

      <div className="vf-live-grid">
        <section className="vf-live-stage" aria-label="Phòng phỏng vấn">
          <div className="vf-ai" data-speaking={speaking}>
            <div className="vf-ai-avatar" aria-hidden="true"><Bot /></div>
            <div className="vf-wave" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <span key={i} style={{ animationDelay: `${i * 90}ms` }} />)}</div>
            <div className="vf-ai-name">Người phỏng vấn AI</div>
            <p className="vf-ai-line" aria-live="polite">{phase === "thinking" ? "Đang nghe và nhận xét câu trả lời của bạn…" : phase === "finishing" ? "Đang chấm điểm buổi phỏng vấn của bạn…" : aiLine}</p>
          </div>
          <div className="vf-me" data-recording={recording}>
            {hasCam ? <video ref={videoRef} muted playsInline aria-label="Hình của bạn" /> : <div className="vf-me-off"><VideoOff aria-hidden="true" /><span>Không có camera</span></div>}
            <div className="vf-me-badge"><Mic aria-hidden="true" /> Bạn</div>
            <div className="vf-meter vf-me-meter" role="img" aria-label={`Mức âm thanh ${level}%`}><span style={{ width: `${level}%` }} /></div>
            {recording && <div className="vf-me-time">{clock(answerSecs)}{q ? ` / gợi ý ${clock(q.suggestedSeconds)}` : ""}</div>}
          </div>
        </section>

        <aside className="vf-live-side">
          <ol className="vf-topics" aria-label="Các chủ đề">
            {iv.topics.map((t, i) => {
              const state = !q ? "done" : i < iv.topicIndex ? "done" : i === iv.topicIndex ? "current" : "todo";
              return <li key={t} data-state={state} aria-current={state === "current" ? "step" : undefined}>{t}</li>;
            })}
          </ol>
          <div className="vf-log" ref={logRef} aria-label="Nội dung cuộc phỏng vấn">
            {iv.turns.map((t) => (
              <div key={t.id} className="vf-msg" data-role={t.role === "mentor" ? "user" : "ai"}>
                <div className="vf-bubble">{t.text}</div>
              </div>
            ))}
          </div>
          {q && (phase === "answering" || phase === "failed" || phase === "asking") && (
            <label className="vf-answer">
              <span>Văn bản câu trả lời {recognitionSupported() ? "(tự nhận dạng từ giọng nói, bạn có thể sửa)" : "(trình duyệt không nhận dạng giọng nói, hãy gõ tóm tắt)"}</span>
              <textarea rows={3} value={`${transcript}${interim ? ` ${interim}` : ""}`} onChange={(e) => { setText(e.target.value); setInterim(""); }} disabled={phase !== "answering"} placeholder={phase === "asking" ? "AI đang hỏi, hãy nghe câu hỏi…" : "Bạn nói, nội dung sẽ hiện ở đây"} />
            </label>
          )}
        </aside>
      </div>

      <div className="vf-live-controls">
        <Button icon={RotateCcw} onClick={replay} disabled={phase === "thinking" || phase === "finishing" || phase === "all-done" || !q}>Nhắc lại câu hỏi</Button>
        <Button icon={voiceOn ? Volume2 : VolumeX} onClick={() => { setVoiceOn((v) => { if (v) stopSpeaking(); return !v; }); }} aria-pressed={voiceOn}>{voiceOn ? "Đọc to: bật" : "Đọc to: tắt"}</Button>
        <Button icon={RotateCcw} onClick={restartAnswer} disabled={phase !== "answering"}>Trả lời lại</Button>
        <span className="flex-1" />
        {phase === "failed" ? (
          <Button variant="primary" size="lg" icon={Send} loading={busy} onClick={retrySend}>Gửi lại câu trả lời</Button>
        ) : phase === "all-done" ? (
          <Button variant="primary" size="lg" icon={Send} onClick={() => { finishingRef.current = true; void submitAll(idRef.current); }}>Kết thúc và nộp bài</Button>
        ) : (
          <Button variant="primary" size="lg" icon={Send} loading={busy || phase === "thinking" || phase === "finishing"} disabled={phase !== "answering" || (transcript.trim().length === 0 && answerSecs < 3)} onClick={() => void send(!!q?.isLast)}>
            {q?.isLast ? "Kết thúc và nộp bài" : "Xong, gửi câu trả lời"}
          </Button>
        )}
      </div>
      {phase === "answering" && transcript.trim().length === 0 && answerSecs < 3 && <p className="vf-live-hint">Hãy trả lời bằng giọng nói. Nút gửi sáng lên sau vài giây.</p>}
    </div>
  );
}
