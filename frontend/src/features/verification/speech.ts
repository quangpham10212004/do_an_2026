"use client";

/* Tiện ích giọng nói cho phòng phỏng vấn live: AI đọc to câu hỏi (speechSynthesis) và nhận dạng giọng của mentor (SpeechRecognition).
   Cả hai đều tuỳ chọn: trình duyệt không hỗ trợ thì phòng live vẫn chạy, mentor đọc chữ và gõ/sửa văn bản trả lời. */

export interface Recognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export function getRecognitionCtor(): (new () => Recognizer) | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export const recognitionSupported = () => getRecognitionCtor() !== null;
export const speakSupported = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

/** Chọn giọng tiếng Việt nếu có. */
function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang.toLowerCase().startsWith("vi")) ?? undefined;
}

/**
 * AI đọc to một đoạn văn bản. `onEnd` luôn được gọi đúng một lần (kể cả khi trình duyệt không phát được sự kiện kết thúc).
 * Trả về hàm huỷ: dừng đọc và không gọi `onEnd`.
 */
export function speak(text: string, onEnd: () => void): () => void {
  if (!speakSupported()) {
    const t = setTimeout(onEnd, 400);
    return () => clearTimeout(t);
  }
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(guard);
    onEnd();
  };
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "vi-VN";
  const voice = pickVoice();
  if (voice) u.voice = voice;
  u.rate = 1;
  u.onend = finish;
  u.onerror = finish;
  // Một số trình duyệt không bắn sự kiện kết thúc: dự phòng theo độ dài văn bản.
  const guard = setTimeout(finish, Math.max(2500, text.length * 85 + 2000));
  synth.speak(u);
  return () => {
    done = true;
    clearTimeout(guard);
    synth.cancel();
  };
}

export function stopSpeaking() {
  if (speakSupported()) window.speechSynthesis.cancel();
}

/** Chọn định dạng ghi hình mà trình duyệt hỗ trợ (có hình hoặc chỉ âm thanh). */
export function pickMime(withVideo: boolean): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const list = withVideo
    ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
    : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return list.find((m) => MediaRecorder.isTypeSupported(m));
}
